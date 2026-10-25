// Scene → SVG. The same functions draw the editor canvas, thumbnails, exports and the
// rasterised frames the AI critic compares against the source image.

import { getKind, scopeFor, shapeSvg, textBox } from './kinds.js';
import { textSvg, layout } from './text.js';
import { connectorPoints, connectorPath, bounds, unionBounds } from './geom.js';
import { parse as parseColor } from './color.js';

const f = v => Math.round(v * 100) / 100;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function parseShadow(s) {
  if (!s || s === 'none') return null;
  if (typeof s === 'object') return { x: s.x ?? 0, y: s.y ?? 4, blur: s.blur ?? 8, color: s.color || 'rgba(0,0,0,0.25)' };
  const m = String(s).trim().split(/\s+(?![^(]*\))/);
  return { x: +m[0] || 0, y: +m[1] || 0, blur: +m[2] || 0, color: m.slice(3).join(' ') || 'rgba(0,0,0,0.25)' };
}

function filters(el, id) {
  const st = el.style || {}, sh = parseShadow(st.shadow), sk = +st.sketch || 0;
  if (!sh && !sk) return { defs: '', attr: '' };
  let defs = `<filter id="${id}" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB">`;
  let src = 'SourceGraphic';
  if (sk) {
    defs += `<feTurbulence type="fractalNoise" baseFrequency="${f(0.02 + sk * 0.01)}" numOctaves="2" seed="${hash(el.id) % 97}" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="${f(sk * 6)}" xChannelSelector="R" yChannelSelector="G" result="sk"/>`;
    src = 'sk';
  }
  if (sh) {
    const c = parseColor(sh.color) || { r: 0, g: 0, b: 0, a: 0.25 };
    defs += `<feGaussianBlur in="${src}" stdDeviation="${f(sh.blur / 2)}" result="b"/><feOffset in="b" dx="${sh.x}" dy="${sh.y}" result="o"/><feFlood flood-color="rgb(${c.r},${c.g},${c.b})" flood-opacity="${c.a}"/><feComposite in2="o" operator="in" result="s"/><feMerge><feMergeNode in="s"/><feMergeNode in="${src}"/></feMerge>`;
  }
  defs += '</filter>';
  return { defs, attr: ` filter="url(#${id})"` };
}
const hash = s => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

// ---------- gradients: CSS-like strings in fill / fill2 / stroke / page background ----------
const isGradient = v => typeof v === 'string' && /^(linear|radial)-gradient\(/i.test(v.trim());
function splitTop(s) { const out = []; let d = 0, cur = ''; for (const c of s) { if (c === '(') d++; if (c === ')') d--; if (c === ',' && d === 0) { out.push(cur.trim()); cur = ''; } else cur += c; } if (cur.trim()) out.push(cur.trim()); return out; }
export function gradientDef(v, id) {
  const radial = /^radial/i.test(v.trim());
  const parts = splitTop(v.trim().replace(/^[a-z-]+\(/i, '').replace(/\)\s*$/, ''));
  let x1 = 0, y1 = 0, x2 = 0, y2 = 1;
  if (!radial) {
    let ang = 180;
    const a = /^(-?[\d.]+)deg$/.exec(parts[0]); const to = /^to\s+(.+)$/.exec(parts[0]);
    if (a) { ang = +a[1]; parts.shift(); }
    else if (to) { const w = to[1]; ang = w.includes('right') ? (w.includes('top') ? 45 : w.includes('bottom') ? 135 : 90) : w.includes('left') ? (w.includes('top') ? 315 : w.includes('bottom') ? 225 : 270) : w.includes('top') ? 0 : 180; parts.shift(); }
    const r = ang * Math.PI / 180, dx = Math.sin(r), dy = -Math.cos(r);
    x1 = 0.5 - dx / 2; y1 = 0.5 - dy / 2; x2 = 0.5 + dx / 2; y2 = 0.5 + dy / 2;
  } else if (!/^(#|rgb|hsl|[a-z]+$)/i.test(parts[0]) || /circle|ellipse|at /.test(parts[0])) parts.shift();
  const stops = parts.map((p, i) => { const m = /^(.*?)(?:\s+(-?[\d.]+)%)?$/.exec(p); return [m[1].trim(), m[2] != null ? +m[2] : (i / Math.max(1, parts.length - 1)) * 100]; });
  const st = stops.map(([c, o]) => `<stop offset="${o}%" stop-color="${c}"/>`).join('');
  return radial ? `<radialGradient id="${id}" cx="0.5" cy="0.5" r="0.5">${st}</radialGradient>` : `<linearGradient id="${id}" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}">${st}</linearGradient>`;
}
function withGradients(el) {
  const st = el.style || {}; let defs = '', over = null;
  for (const k of ['fill', 'fill2', 'stroke']) if (isGradient(st[k])) { const id = `gr-${el.id}-${k}`; defs += gradientDef(st[k], id); (over || (over = {}))[k] = `url(#${id})`; }
  return over ? { el: { ...el, style: { ...st, ...over } }, defs } : { el, defs: '' };
}

// ---------- arrowheads ----------
export const CAPS = ['none', 'arrow', 'open', 'triangle', 'diamond', 'diamond-open', 'circle', 'circle-open', 'dot', 'bar'];
function capGeom(type, sw, scale) {
  const L = (scale || 1) * (6 + sw * 3), W = L * 0.48;
  switch (type) {
    case 'arrow': return { d: `M0,0 L${f(-L)},${f(-W)} L${f(-L * 0.82)},0 L${f(-L)},${f(W)} Z`, fill: true, back: L * 0.75 };
    case 'open': return { d: `M${f(-L)},${f(-W)} L0,0 L${f(-L)},${f(W)}`, fill: false, back: sw * 0.6 };
    case 'triangle': return { d: `M0,0 L${f(-L)},${f(-W)} L${f(-L)},${f(W)} Z`, fill: 'bg', back: L };
    case 'diamond': return { d: `M0,0 L${f(-L * 0.7)},${f(-W)} L${f(-L * 1.4)},0 L${f(-L * 0.7)},${f(W)} Z`, fill: true, back: L * 1.3 };
    case 'diamond-open': return { d: `M0,0 L${f(-L * 0.7)},${f(-W)} L${f(-L * 1.4)},0 L${f(-L * 0.7)},${f(W)} Z`, fill: 'bg', back: L * 1.4 };
    case 'circle': return { d: circ(-W * 0.8, W * 0.8), fill: true, back: W * 1.5 };
    case 'circle-open': return { d: circ(-W * 0.8, W * 0.8), fill: 'bg', back: W * 1.6 };
    case 'dot': return { d: circ(0, Math.max(2.5, sw * 1.8) * (scale || 1)), fill: true, back: 0 };
    case 'bar': return { d: `M0,${f(-W)} L0,${f(W)}`, fill: false, back: 0 };
  }
  return null;
}
const circ = (cx, r) => `M${f(cx - r)},0 a${f(r)},${f(r)} 0 1 0 ${f(r * 2)},0 a${f(r)},${f(r)} 0 1 0 ${f(-r * 2)},0`;

function connectorSvg(c, doc, opts) {
  const geo = connectorPoints(c, doc);
  const st = c.style || {};
  const stroke = st.stroke || '#1f2328', sw = st.strokeWidth ?? 2;
  const bg = doc.page?.background || '#ffffff';
  const cs = capGeom(c.start, sw, c.capSize), ce = capGeom(c.end, sw, c.capSize);
  const d = connectorPath(geo, cs ? cs.back : 0, ce ? ce.back : 0);
  const dash = st.dash && st.dash !== 'solid' ? ` stroke-dasharray="${dashFor(st.dash, sw)}"` : '';
  const fl = filters(c, 'f-' + c.id);
  let out = fl.defs + `<g${fl.attr}${st.opacity != null && st.opacity < 1 ? ` opacity="${st.opacity}"` : ''}>`;
  out += `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="${st.linecap || 'round'}" stroke-linejoin="round"${dash}/>`;
  const cap = (g, at, dir) => {
    if (!g) return '';
    const ang = Math.atan2(dir[1], dir[0]) * 180 / Math.PI;
    return `<path d="${g.d}" transform="translate(${f(at[0])},${f(at[1])}) rotate(${f(ang)})" fill="${g.fill === true ? stroke : g.fill === 'bg' ? (c.capFill || bg) : 'none'}" stroke="${stroke}" stroke-width="${g.fill === true ? Math.min(sw, 1.5) : sw}" stroke-linejoin="round" stroke-linecap="round"/>`;
  };
  out += cap(cs, geo.start, [-geo.startDir[0], -geo.startDir[1]]);
  out += cap(ce, geo.end, geo.endDir);
  const t = c.text;
  if (t && t.content) {
    const L = layout({ ...t, size: t.size || 14 }, 400);
    const w = L.width + 12, h = L.height + 6;
    const [mx, my] = geo.mid;
    const box = { x: mx - w / 2 + (t.dx || 0), y: my - h / 2 + (t.dy || 0), w, h };
    if (t.bg !== 'none') out += `<rect x="${f(box.x)}" y="${f(box.y)}" width="${f(w)}" height="${f(h)}" rx="3" fill="${t.bg || bg}"/>`;
    out += textSvg({ size: 14, color: stroke, ...t, wrap: false }, box);
  }
  out += '</g>';
  if (opts.hit) out += `<path class="hit" d="${geo.pts.map((p, i) => (i ? 'L' : 'M') + f(p[0]) + ',' + f(p[1])).join(' ')}" fill="none" stroke="transparent" stroke-width="${Math.max(12, sw + 10)}"/>`;
  return out;
}
const dashFor = (dash, sw) => dash === 'dashed' ? `${sw * 4} ${sw * 3}` : dash === 'dotted' ? `0.01 ${sw * 2.2}` : String(dash);

// One element as an SVG string in world coordinates.
export function elementSvg(el, doc, opts = {}) {
  if (el.hidden) return '';
  if (el.ghost) return `<g class="ghost" pointer-events="none" transform="translate(${f(el.x)},${f(el.y)})"><rect x="0.5" y="0.5" width="${f(Math.max(1, el.w - 1))}" height="${f(Math.max(1, el.h - 1))}" rx="6" fill="rgba(79,107,255,0.06)" stroke="#4f6bff" stroke-width="1.5" stroke-dasharray="6 5" vector-effect="non-scaling-stroke"/>${el.text?.content ? textSvg({ content: el.text.content, size: Math.min(13, Math.max(8, el.h / 4)), color: '#4f6bff', align: 'center', valign: 'middle' }, { x: 4, y: 4, w: el.w - 8, h: el.h - 8 }) : ''}</g>`;
  if (el.kind === 'connector') return connectorSvg(el, doc, opts);
  const kind = getKind(el.kind);
  const tr = `translate(${f(el.x)},${f(el.y)})${el.rot ? ` rotate(${f(el.rot)},${f(el.w / 2)},${f(el.h / 2)})` : ''}`;
  const st = el.style || {};
  let body = '';
  if (!kind) {
    // unknown kind (being designed, or missing): dashed placeholder
    body = `<rect x="0" y="0" width="${f(el.w)}" height="${f(el.h)}" rx="6" fill="rgba(120,120,255,0.08)" stroke="#8a8aff" stroke-dasharray="6 4"/>` +
      textSvg({ content: el.kind, size: 11, color: '#6b6bd6', align: 'center', valign: 'middle' }, { x: 0, y: 0, w: el.w, h: el.h });
    return `<g transform="${tr}">${body}${opts.hit ? hitRect(el) : ''}</g>`;
  }
  const g = withGradients(el);
  const scope = scopeFor(g.el, kind);
  if (el.kind === 'image') body = imageSvg(g.el, scope);
  else body = g.defs + shapeSvg(g.el, kind, scope);
  const fl = filters(el, 'f-' + el.id);
  let text = '';
  if (el.text && el.text.content) {
    const tb = textBox(el, kind, scope);
    const t = { ...(kind.text || {}), ...el.text };
    if (t.vertical) {
      const cx = tb.x + tb.w / 2, cy = tb.y + tb.h / 2;
      text = `<g transform="rotate(-90,${f(cx)},${f(cy)})">${textSvg(t, { x: cx - tb.h / 2, y: cy - tb.w / 2, w: tb.h, h: tb.w })}</g>`;
    } else text = textSvg(t, tb);
  }
  const op = st.opacity != null && st.opacity < 1 ? ` opacity="${st.opacity}"` : '';
  return `<g transform="${tr}"${op}>${fl.defs}<g${fl.attr}>${body}</g>${text}${opts.hit ? hitRect(el) : ''}</g>`;
}
const hitRect = el => `<rect class="hit" x="0" y="0" width="${f(el.w)}" height="${f(el.h)}" fill="transparent"/>`;

function imageSvg(el, sc) {
  const src = el.props?.src; if (!src) return `<rect width="${f(el.w)}" height="${f(el.h)}" fill="#eee"/>`;
  const fit = sc.fit || 'fill', r = sc.radius || 0;
  const par = fit === 'contain' ? 'xMidYMid meet' : fit === 'cover' ? 'xMidYMid slice' : 'none';
  const clip = r ? `<clipPath id="c-${el.id}"><rect width="${f(el.w)}" height="${f(el.h)}" rx="${r}"/></clipPath>` : '';
  const sw = sc.stroke && sc.stroke !== 'none' ? sc.strokeWidth || 0 : 0;
  return clip + `<image href="${esc(src)}" x="0" y="0" width="${f(el.w)}" height="${f(el.h)}" preserveAspectRatio="${par}"${r ? ` clip-path="url(#c-${el.id})"` : ''}/>` +
    (sw ? `<rect x="${sw / 2}" y="${sw / 2}" width="${f(el.w - sw)}" height="${f(el.h - sw)}" rx="${r}" fill="none" stroke="${sc.stroke}" stroke-width="${sw}"/>` : '');
}

// Page background with optional dot / grid / line pattern.
// Only diagrams rebuilt from an image have a fixed page (it lines up with the source).
// Everything else lives on an open board; exports and thumbnails frame the content.
export const hasPage = doc => !!doc.source;
export function framed(doc, margin = 40) {
  if (hasPage(doc)) return doc;
  const d = indexDoc(JSON.parse(JSON.stringify(doc, (k, v) => k === 'byId' ? undefined : v)));
  const b = unionBounds(d.elements.filter(e => !e.hidden && !e.ghost).map(e => bounds(e, d)));
  if (!b) return d;
  const dx = margin - b.x, dy = margin - b.y;
  for (const e of d.elements) {
    if (e.kind === 'connector') { for (const k of ['from', 'to']) if (e[k] && !e[k].id) e[k] = { ...e[k], x: e[k].x + dx, y: e[k].y + dy }; if (e.points) e.points = e.points.map(p => ({ x: p.x + dx, y: p.y + dy })); }
    else { e.x += dx; e.y += dy; }
  }
  d.page = { ...d.page, w: Math.ceil(b.w + margin * 2), h: Math.ceil(b.h + margin * 2), pattern: null };
  return indexDoc(d);
}

export function pageSvg(doc) {
  const p = doc.page || {}; const w = p.w || 1200, h = p.h || 800;
  const bg = p.background || '#ffffff';
  let out = isGradient(bg) ? `<defs>${gradientDef(bg, 'pbg-' + (doc.id || 'p'))}</defs><rect x="0" y="0" width="${w}" height="${h}" fill="url(#pbg-${doc.id || 'p'})"/>` : `<rect x="0" y="0" width="${w}" height="${h}" fill="${bg}"/>`;
  const pt = p.pattern;
  if (pt && pt.type && pt.type !== 'none') {
    const g = pt.gap || 24, c = pt.color || '#d0d4da', s = pt.size || (pt.type === 'dots' ? 1.6 : 1);
    const ox = pt.offsetX ?? g / 2, oy = pt.offsetY ?? g / 2;
    let cell = '';
    if (pt.type === 'dots') cell = `<circle cx="${f(ox % g)}" cy="${f(oy % g)}" r="${s}" fill="${c}"/>`;
    else if (pt.type === 'grid') cell = `<path d="M${g},0 L0,0 0,${g}" fill="none" stroke="${c}" stroke-width="${s}"/>`;
    else if (pt.type === 'lines') cell = `<path d="M0,${g} L${g},${g}" fill="none" stroke="${c}" stroke-width="${s}"/>`;
    out += `<defs><pattern id="pg-${doc.id || 'p'}" width="${g}" height="${g}" patternUnits="userSpaceOnUse">${cell}</pattern></defs><rect x="0" y="0" width="${w}" height="${h}" fill="url(#pg-${doc.id || 'p'})"/>`;
  }
  return out;
}

export function indexDoc(doc) { doc.byId = new Map(doc.elements.map(e => [e.id, e])); return doc; }

// Full standalone SVG for export / rasterising / thumbnails.
export function sceneSvg(doc, { fontCss = '', clipToPage = true, scale = 1, width, height, only } = {}) {
  indexDoc(doc);
  const p = doc.page || {}; const w = p.w || 1200, h = p.h || 800;
  const els = only ? doc.elements.filter(e => only.has(e.id)) : doc.elements;
  const body = els.map(e => elementSvg(e, doc)).join('');
  const W = width || w * scale, H = height || h * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${f(W)}" height="${f(H)}" viewBox="0 0 ${w} ${h}"${clipToPage ? '' : ' overflow="visible"'}>${fontCss ? `<style>${fontCss}</style>` : ''}${pageSvg(doc)}${body}</svg>`;
}
