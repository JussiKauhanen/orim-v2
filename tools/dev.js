// Dev helpers for authoring templates in the browser console:
//   const D = await import('/tools/dev.js'); await D.regions('1.png')
// Measures a sample image at working size, and scores a template against it.

import * as V from '../js/ai/vision.js';
import { renderToCanvas } from '../js/ai/raster.js';
import { indexDoc } from '../js/render.js';
import { normalize } from '../js/store.js';
import { ensureFont } from '../js/text.js';

export async function sample(file) {
  const img = await V.loadImage('/samples/' + file);
  const ms = V.modelSize(img.naturalWidth, img.naturalHeight);
  const c = V.canvasOf(img, ms.w, ms.h, '#fff');
  return { img, ms, canvas: c, px: V.pixels(c) };
}
export async function regions(file, { limit = 80, pal = 18, minFill = 0 } = {}) {
  const s = await sample(file);
  const p = V.palette(s.px, pal);
  const r = V.regions(s.px, p, { maxEdge: 900, limit });
  return r.filter(x => x.fill >= minFill).map(x => `${x.hex} ${Math.round(x.x)},${Math.round(x.y)},${Math.round(x.w)},${Math.round(x.h)} f=${x.fill.toFixed(2)}`).join('\n');
}
export async function colorAt(file, pts) {
  const s = await sample(file);
  return pts.map(([x, y]) => { const i = (y * s.px.width + x) * 4, d = s.px.data; return '#' + [d[i], d[i + 1], d[i + 2]].map(v => v.toString(16).padStart(2, '0')).join(''); }).join(' ');
}
export async function sampleBox(file, box) { const s = await sample(file); return V.sampleBox(s.px, box); }
export async function snap(file, box) { const s = await sample(file); return V.snapBox(s.px, box); }

// Score a template json (path under library/templates) against its sample.
export async function score(tplPath, file) {
  const t = await (await fetch('/library/templates/' + tplPath, { cache: 'no-cache' })).json();
  const doc = indexDoc({ ...t.doc, elements: t.doc.elements.map(normalize) });
  for (const e of doc.elements) if (e.text?.font) await ensureFont(e.text.font);
  await document.fonts.ready;
  const s = await sample(file || t.source.replace('samples/', ''));
  const rc = await renderToCanvas(doc);
  const cmp = V.compare(s.canvas, rc);
  const strip = V.strip([s.canvas, rc, V.canvasOf(await V.loadImage(cmp.heat), s.canvas.width, s.canvas.height)], ['source', 'render', 'diff'], 700);
  window.__strip = strip.toDataURL();
  window.__cmp = { src: s.canvas, rc };
  return { score: cmp.score, cells: cmp.cells };
}
// Magnify the same region of source (top) and render (bottom).
export function zoom(x, y, w, h) {
  const { src, rc } = window.__cmp;
  const a = V.cropCanvas(src, { x, y, w, h }, 0, 1), b = V.cropCanvas(rc, { x, y, w, h }, 0, 1);
  const k = Math.min(1400 / w, 420 / h);
  const out = document.createElement('canvas'); out.width = Math.round(w * k); out.height = Math.round(h * k * 2 + 8);
  const c = out.getContext('2d'); c.imageSmoothingEnabled = false; c.fillStyle = '#f0f'; c.fillRect(0, 0, out.width, out.height);
  c.drawImage(a.canvas, 0, 0, w * k, h * k); c.drawImage(b.canvas, 0, h * k + 8, w * k, h * k);
  show(out.toDataURL());
}
// Show the last comparison strip full screen (for screenshots).
export function show(which = window.__strip) {
  let el = document.getElementById('__devshow');
  if (!el) { el = document.createElement('img'); el.id = '__devshow'; el.style.cssText = 'position:fixed;inset:0;z-index:9999;width:100%;height:100%;object-fit:contain;background:#fff'; el.onclick = () => el.remove(); document.body.appendChild(el); }
  el.src = which;
}
export function hide() { document.getElementById('__devshow')?.remove(); }
