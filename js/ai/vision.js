// Local image analysis. The model sees the picture; these functions give it (and the
// pipeline) exact numbers: the palette, candidate regions with pixel-accurate boxes,
// colour sampling, edge snapping and a visual diff used to score each refinement round.

import { rgbHex, dist, parse as parseColor } from '../color.js';

export function loadImage(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not load image')); i.src = src; });
}
export function canvasOf(img, w = img.naturalWidth || img.width, h = img.naturalHeight || img.height, bg) {
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  const x = c.getContext('2d', { willReadFrequently: true });
  if (bg) { x.fillStyle = bg; x.fillRect(0, 0, c.width, c.height); }
  x.imageSmoothingQuality = 'high';
  x.drawImage(img, 0, 0, c.width, c.height);
  return c;
}
export const pixels = c => c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height);

// Size the image the way the model will see it (no server-side resize → coordinates match).
export function modelSize(w, h, maxEdge = 1568, maxPx = 1150000) {
  const s = Math.min(1, maxEdge / Math.max(w, h), Math.sqrt(maxPx / (w * h)));
  return { w: Math.round(w * s), h: Math.round(h * s), s };
}
export function encode(canvas, prefer = 'image/png') {
  let url = canvas.toDataURL(prefer);
  if (url.length > 3_800_000) url = canvas.toDataURL('image/jpeg', 0.9);
  const [head, data] = url.split(',');
  return { mime: head.slice(5, head.indexOf(';')), data, url };
}

// ---------- palette ----------
export function palette(img, k = 18) {
  const { width: W, height: H, data } = img;
  const step = Math.max(1, Math.floor(Math.sqrt((W * H) / 90000)));
  const bins = new Map();
  for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) {
    const i = (y * W + x) * 4; if (data[i + 3] < 128) continue;
    const key = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
    let b = bins.get(key); if (!b) { b = [0, 0, 0, 0]; bins.set(key, b); }
    b[0]++; b[1] += data[i]; b[2] += data[i + 1]; b[3] += data[i + 2];
  }
  const sorted = [...bins.values()].sort((a, b) => b[0] - a[0]);
  const total = sorted.reduce((t, b) => t + b[0], 0);
  const picked = [];
  for (const b of sorted) {
    const c = { r: b[1] / b[0], g: b[2] / b[0], b: b[3] / b[0] };
    const near = picked.find(p => dist(p.c, c) < 34);
    if (near) { near.n += b[0]; continue; }
    if (picked.length < k && b[0] / total > 0.0006) picked.push({ c, n: b[0] });
  }
  return picked.map(p => ({ hex: rgbHex(p.c.r, p.c.g, p.c.b), r: p.c.r, g: p.c.g, b: p.c.b, pct: p.n / total })).sort((a, b) => b.pct - a.pct);
}

// ---------- regions (connected components of near-uniform colour) ----------
export function regions(img, pal, { maxEdge = 520, limit = 90 } = {}) {
  const s = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const W = Math.max(1, Math.round(img.width * s)), H = Math.max(1, Math.round(img.height * s));
  const src = img.data, lab = new Int16Array(W * H).fill(-1);
  const P = pal.map(p => ({ r: p.r, g: p.g, b: p.b }));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sx = Math.min(img.width - 1, Math.floor(x / s)), sy = Math.min(img.height - 1, Math.floor(y / s));
    const i = (sy * img.width + sx) * 4; const c = { r: src[i], g: src[i + 1], b: src[i + 2] };
    let bi = -1, bd = 60;
    for (let k = 0; k < P.length; k++) { const d = dist(P[k], c); if (d < bd) { bd = d; bi = k; } }
    lab[y * W + x] = bi;
  }
  const seen = new Uint8Array(W * H), comps = [];
  const stack = new Int32Array(W * H);
  for (let start = 0; start < W * H; start++) {
    if (seen[start] || lab[start] < 0) continue;
    const L = lab[start]; let sp = 0; stack[sp++] = start; seen[start] = 1;
    let n = 0, x0 = W, y0 = H, x1 = 0, y1 = 0;
    while (sp) {
      const p = stack[--sp]; const x = p % W, y = (p / W) | 0; n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && !seen[p - 1] && lab[p - 1] === L) { seen[p - 1] = 1; stack[sp++] = p - 1; }
      if (x < W - 1 && !seen[p + 1] && lab[p + 1] === L) { seen[p + 1] = 1; stack[sp++] = p + 1; }
      if (y > 0 && !seen[p - W] && lab[p - W] === L) { seen[p - W] = 1; stack[sp++] = p - W; }
      if (y < H - 1 && !seen[p + W] && lab[p + W] === L) { seen[p + W] = 1; stack[sp++] = p + W; }
    }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    if (n < Math.max(12, W * H * 0.0003)) continue;
    const touches = (x0 === 0) + (y0 === 0) + (x1 === W - 1) + (y1 === H - 1);
    if (touches >= 3 && n > W * H * 0.25) continue; // background
    comps.push({ L, n, x: x0 / s, y: y0 / s, w: bw / s, h: bh / s, fill: n / (bw * bh) });
  }
  comps.sort((a, b) => b.n - a.n);
  return comps.slice(0, limit).map(c => ({ ...c, hex: pal[c.L].hex, shape: c.fill > 0.92 ? 'solid-rect' : c.fill > 0.74 ? 'rounded/ellipse' : c.fill < 0.25 ? 'outline/line' : 'irregular' }));
}

// ---------- sampling ----------
function histogram(img, pts) {
  const bins = new Map(); let n = 0;
  for (const [x, y] of pts) {
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
    const i = (y * img.width + x) * 4, d = img.data;
    const key = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
    let b = bins.get(key); if (!b) { b = [0, 0, 0, 0]; bins.set(key, b); }
    b[0]++; b[1] += d[i]; b[2] += d[i + 1]; b[3] += d[i + 2]; n++;
  }
  const list = [...bins.values()].sort((a, b) => b[0] - a[0]).map(b => ({ c: { r: b[1] / b[0], g: b[2] / b[0], b: b[3] / b[0] }, share: b[0] / Math.max(1, n) }));
  // merge near bins into the leaders
  const out = [];
  for (const b of list) { const near = out.find(o => dist(o.c, b.c) < 28); if (near) near.share += b.share; else out.push({ ...b }); }
  return out.sort((a, b) => b.share - a.share);
}

// Interior fill, border stroke and text colour inside a box (image coords).
export function sampleBox(img, box, bg) {
  const x0 = Math.round(box.x), y0 = Math.round(box.y), x1 = Math.round(box.x + box.w), y1 = Math.round(box.y + box.h);
  const ix = Math.round(box.w * 0.18), iy = Math.round(box.h * 0.18);
  const inner = [];
  const stepI = Math.max(1, Math.floor(Math.sqrt((box.w * box.h) / 6000)));
  for (let y = y0 + iy; y < y1 - iy; y += stepI) for (let x = x0 + ix; x < x1 - ix; x += stepI) inner.push([x, y]);
  const hi = histogram(img, inner);
  const fill = hi[0];
  const ring = [];
  const t = Math.max(2, Math.min(6, Math.round(Math.min(box.w, box.h) * 0.06)));
  for (let x = x0 + t * 2; x < x1 - t * 2; x++) for (let k = 0; k < t; k++) { ring.push([x, y0 + k]); ring.push([x, y1 - 1 - k]); }
  for (let y = y0 + t * 2; y < y1 - t * 2; y++) for (let k = 0; k < t; k++) { ring.push([x0 + k, y]); ring.push([x1 - 1 - k, y]); }
  const hr = histogram(img, ring);
  const bgc = bg && parseColor(bg);
  const strokeCand = hr.find(b => (!fill || dist(b.c, fill.c) > 40) && (!bgc || dist(b.c, bgc) > 40) && b.share > 0.12);
  const textCand = hi.slice(1).find(b => fill && dist(b.c, fill.c) > 90 && b.share > 0.01);
  const h = c => rgbHex(c.r, c.g, c.b);
  return {
    fill: fill ? h(fill.c) : null, fillShare: fill ? fill.share : 0,
    stroke: strokeCand ? h(strokeCand.c) : null, strokeShare: strokeCand ? strokeCand.share : 0,
    text: textCand ? h(textCand.c) : null,
  };
}

// Move each edge of a box to the strongest nearby colour edge (image coords).
export function snapBox(img, box, { tol, span = [0.25, 0.75] } = {}) {
  const t = Math.round(tol ?? Math.max(3, Math.min(12, Math.min(box.w, box.h) * 0.06)));
  const W = img.width, H = img.height, d = img.data;
  const px = (x, y) => { x = Math.max(0, Math.min(W - 1, x)); y = Math.max(0, Math.min(H - 1, y)); const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
  const diff = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
  function best(vertical, pos, from, to) {
    let bestP = pos, bestG = 0, base = 0;
    const samples = 24;
    for (let off = -t; off <= t; off++) {
      const p = Math.round(pos + off); let g = 0;
      for (let k = 0; k < samples; k++) {
        const q = Math.round(from + (to - from) * (k + 0.5) / samples);
        g += vertical ? diff(px(p, q), px(p - 1, q)) : diff(px(q, p), px(q, p - 1));
      }
      g /= samples;
      if (off === 0) base = g;
      if (g > bestG + 0.5 || (Math.abs(g - bestG) <= 0.5 && Math.abs(off) < Math.abs(bestP - pos))) { bestG = g; bestP = p; }
    }
    return bestG > 30 && bestG > base * 1.15 ? bestP : (base > 30 ? Math.round(pos) : pos);
  }
  const ya = box.y + box.h * span[0], yb = box.y + box.h * span[1], xa = box.x + box.w * span[0], xb = box.x + box.w * span[1];
  const L = best(true, box.x, ya, yb), R = best(true, box.x + box.w, ya, yb);
  const T = best(false, box.y, xa, xb), B = best(false, box.y + box.h, xa, xb);
  if (R - L < box.w * 0.7 || B - T < box.h * 0.7) return box; // implausible: keep
  return { x: L, y: T, w: R - L, h: B - T };
}

// ---------- comparison ----------
// Returns { score 0..100, heat (dataURL), cells: worst regions in source coordinates }.
export function compare(srcCanvas, renderCanvas, { size = 360 } = {}) {
  const W0 = srcCanvas.width, H0 = srcCanvas.height;
  const s = Math.min(1, size / Math.max(W0, H0));
  const W = Math.max(8, Math.round(W0 * s)), H = Math.max(8, Math.round(H0 * s));
  const a = pixels(canvasOf(srcCanvas, W, H, '#ffffff')), b = pixels(canvasOf(renderCanvas, W, H, '#ffffff'));
  const heat = document.createElement('canvas'); heat.width = W; heat.height = H;
  const hx = heat.getContext('2d'); const hd = hx.createImageData(W, H);
  const G = 8, cell = new Float64Array(G * G), cellN = new Float64Array(G * G);
  // Light blur first so anti-aliasing and sub-pixel offsets do not count as differences.
  const A = blur3(a.data, W, H), B = blur3(b.data, W, H);
  const LA = lumMap(A, W, H), LB = lumMap(B, W, H);
  const GA = grad(LA, W, H), GB = grad(LB, W, H), MA = dilate(GA, W, H), MB = dilate(GB, W, H);
  let total = 0, mis = 0, edges = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x, i = p * 4;
    const dd = Math.min(255, Math.sqrt(((A[i] - B[i]) ** 2 + (A[i + 1] - B[i + 1]) ** 2 + (A[i + 2] - B[i + 2]) ** 2) / 3));
    total += dd;
    // edges present in one image but not within a pixel of the same spot in the other
    if (GA[p] > 18) { edges++; mis += Math.min(1, Math.max(0, GA[p] - MB[p]) / 60); }
    if (GB[p] > 18) { edges++; mis += Math.min(1, Math.max(0, GB[p] - MA[p]) / 60); }
    const c = Math.min(G - 1, Math.floor(x / W * G)) + Math.min(G - 1, Math.floor(y / H * G)) * G;
    cell[c] += dd; cellN[c]++;
    const v = Math.min(255, dd * 2.2);
    hd.data[i] = 255; hd.data[i + 1] = 255 - v; hd.data[i + 2] = 255 - v; hd.data[i + 3] = 255;
  }
  hx.putImageData(hd, 0, 0);
  const meanDiff = total / (W * H) / 255;  // 0..1
  const edgeDiff = edges ? mis / edges : 0; // 0..1
  const score = Math.max(0, 100 * (1 - Math.min(1, meanDiff * 4 + edgeDiff * 0.55)));
  const cells = [];
  for (let c = 0; c < G * G; c++) cells.push({ c, v: cell[c] / Math.max(1, cellN[c]) });
  cells.sort((p, q) => q.v - p.v);
  const worst = cells.slice(0, 6).filter(c => c.v > 6).map(c => ({ x: Math.round((c.c % G) * W0 / G), y: Math.round(Math.floor(c.c / G) * H0 / G), w: Math.round(W0 / G), h: Math.round(H0 / G), diff: Math.round(c.v) }));
  return { score: Math.round(score * 10) / 10, meanDiff, edgeDiff, heat: heat.toDataURL('image/png'), cells: worst };
}

function blur3(d, W, H) {
  const o = new Float32Array(d.length);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) { const yy = y + dy; if (yy < 0 || yy >= H) continue; for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx < 0 || xx >= W) continue; const j = (yy * W + xx) * 4; r += d[j]; g += d[j + 1]; b += d[j + 2]; n++; } }
    const i = (y * W + x) * 4; o[i] = r / n; o[i + 1] = g / n; o[i + 2] = b / n;
  }
  return o;
}
const lumMap = (d, W, H) => { const o = new Float32Array(W * H); for (let p = 0; p < W * H; p++) o[p] = d[p * 4] * 0.3 + d[p * 4 + 1] * 0.59 + d[p * 4 + 2] * 0.11; return o; };
function grad(L, W, H) {
  const o = new Float32Array(W * H);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const p = y * W + x; o[p] = Math.abs(L[p + 1] - L[p - 1]) + Math.abs(L[p + W] - L[p - W]); }
  return o;
}
function dilate(G, W, H) {
  const o = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let m = 0;
    for (let dy = -1; dy <= 1; dy++) { const yy = y + dy; if (yy < 0 || yy >= H) continue; for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx < 0 || xx >= W) continue; const v = G[yy * W + xx]; if (v > m) m = v; } }
    o[y * W + x] = m;
  }
  return o;
}

export function cropCanvas(srcCanvas, box, pad = 0, scale = 1) {
  const x = Math.max(0, Math.floor(box.x - pad)), y = Math.max(0, Math.floor(box.y - pad));
  const w = Math.min(srcCanvas.width - x, Math.ceil(box.w + pad * 2)), h = Math.min(srcCanvas.height - y, Math.ceil(box.h + pad * 2));
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * scale)); c.height = Math.max(1, Math.round(h * scale));
  const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(srcCanvas, x, y, w, h, 0, 0, c.width, c.height);
  return { canvas: c, x, y, w, h };
}

// Side-by-side strip for feedback images: [a | b | c] with small captions.
export function strip(canvases, labels = [], maxH = 520) {
  const h = Math.min(maxH, Math.max(...canvases.map(c => c.height)));
  const ws = canvases.map(c => c.width * h / c.height);
  const out = document.createElement('canvas'); out.width = Math.round(ws.reduce((a, b) => a + b, 0) + 12 * (canvases.length - 1)); out.height = h + 22;
  const x = out.getContext('2d'); x.fillStyle = '#ffffff'; x.fillRect(0, 0, out.width, out.height);
  let off = 0;
  canvases.forEach((c, i) => { x.drawImage(c, off, 22, ws[i], h); x.fillStyle = '#333'; x.font = '13px sans-serif'; x.fillText(labels[i] || '', off + 4, 15); off += ws[i] + 12; });
  return out;
}
