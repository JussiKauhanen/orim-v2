// Diagrams as structure. The AI writes short JSON lines (groups, nodes, links); they become
// ordinary elements on the canvas, so hand edits, grouping and export work as for anything
// drawn by hand. ELK lays them out: groups really contain their nodes, links route around.
//
//   {"group":"onprem","label":"On-premises","tone":"onprem","in":"parent-group"}
//   {"node":"ad","label":"AD group","icon":"azure:Groups","shape":"box","in":"onprem","note":"…"}
//   {"edge":["ad","entra"],"label":"2. Sync","dashed":true}
//   {"remove":"id"}   {"title":"…"}   {"layout":"right"|"down"}   {"say":"…"}
//
// A node can be any kind in the library ("kind":"button"). Screens and other containers can
// lay out their own parts instead of leaving it to ELK:
//   {"group":"login","label":"Login","device":"phone"}            a screen; parts stack inside
//   {"group":"bar","in":"login","layout":"row","dock":"top"}      parts side by side, pinned to the top
//   {"node":"email","in":"login","kind":"input","label":"Email","w":200,"grow":true}

import { getKind, resolveKind } from './kinds.js';
import { makeElement } from './store.js';
import { bounds } from './geom.js';
import { indexDoc } from './render.js';

export const TONES = {
  azure: { fill: '#f3f7ff', fill2: '#e2ecfe', stroke: '#a9c3ef', text: '#1f4fa0' },
  onprem: { fill: '#f7f7f5', fill2: '#ebebe6', stroke: '#c9c9c0', text: '#4a4a44' },
  external: { fill: '#fff9ef', fill2: '#ffeed3', stroke: '#efcb8f', text: '#875811' },
  security: { fill: '#fff4f4', fill2: '#ffe2e2', stroke: '#efb0b0', text: '#992e2e' },
  data: { fill: '#f1faf5', fill2: '#dcf2e4', stroke: '#a5d6b6', text: '#22683f' },
  neutral: { fill: '#f8f9fb', fill2: '#eceef2', stroke: '#d2d7de', text: '#3b4250' },
};
const SHAPES = { box: 'rect', process: 'rect', db: 'cylinder', database: 'cylinder', storage: 'cylinder', decision: 'diamond', note: 'note', doc: 'document', document: 'document', cloud: 'cloud', start: 'pill', end: 'pill', terminal: 'pill', queue: 'parallelogram', hexagon: 'hexagon' };
const NODE = { fill: '#ffffff', stroke: '#c5ccd6', text: '#1f2328' };
const EDGE = '#5b6472';
const GROUP_KINDS = new Set(['container', 'lane', 'frame', 'screen']);
const ICON = 48;
// Containers that place their own children: screens (a device frame), rows and stacks.
const FLOWS = new Set(['stack', 'row']);
const DEVICES = { phone: { w: 280, h: 580, top: 36, bottom: 22 }, tablet: { w: 520, h: 700, top: 26, bottom: 18 }, browser: { w: 880, h: 560, top: 32, bottom: 0 } };
const FLOW_KINDS = new Set(['rect', ...Object.values(SHAPES)]);
export const isLayoutGroup = el => el?.st === 'group' && (!!el.device || FLOWS.has(el.layout));

export const isGroup = el => el.st === 'group' || (!el.st && GROUP_KINDS.has(el.kind));
const isIcon = el => !!getKind(el.kind)?.pack;
const label = el => el.text?.content || '';
const textWidth = (s, size = 14) => [...String(s)].reduce((w, ch) => w + (/[ilj.,:;'|!]/.test(ch) ? .3 : /[mwMW]/.test(ch) ? .85 : /[A-Z0-9]/.test(ch) ? .64 : .54), 0) * size;

// ---------- reading the model's lines ----------
// Feed streamed text; complete lines come back as objects. Fences and prose are skipped.
export function lineReader() {
  let buf = '';
  const parse = l => { l = l.trim().replace(/,$/, ''); if (!l.startsWith('{')) return null; try { return JSON.parse(l); } catch (_) { return null; } };
  return {
    push(text) { buf += text; const lines = buf.split('\n'); buf = lines.pop(); return lines.map(parse).filter(Boolean); },
    end() { const out = parse(buf); buf = ''; return out ? [out] : []; },
  };
}

// ---------- applying lines to a document ----------
// Returns what happened, for flashes and the reply's change list.
export function applyItem(doc, it, pending = []) {
  if (it.title) { if (!doc.name || /^untitled/i.test(doc.name)) doc.name = String(it.title).slice(0, 80); return null; }
  if (it.layout && !it.group && !it.node) { doc.layoutDir = it.layout === 'down' ? 'down' : 'right'; return null; }
  if (it.remove) return removeItem(doc, String(it.remove));
  if (it.group || it.node) return upsertShape(doc, it);
  if (it.edge) { const r = upsertEdge(doc, it); if (!r) pending.push(it); return r; }
  return null;
}
// Links whose ends were not there yet: retry after each new shape.
export function retryPending(doc, pending) {
  const out = [];
  for (let i = pending.length - 1; i >= 0; i--) { const r = upsertEdge(doc, pending[i]); if (r) { out.push(r); pending.splice(i, 1); } }
  return out;
}

function upsertShape(doc, it) {
  const group = !!it.group, id = String(it.group || it.node);
  let el = doc.byId.get(id), change = 'update';
  const want = group ? groupKind(it, el) : nodeKind(it, el);
  if (el && el.kind === 'connector') return null;
  if (!el) {
    el = makeElement(want, { id });
    // creation order: parts stack in the order the model wrote them, whatever the drawing order
    el.st = group ? 'group' : 'node'; change = 'add'; el.seq = doc.seq = (doc.seq || 0) + 1;
    // provisional spot: near its group or below the rest, until the next layout
    const parent = it.in && doc.byId.get(String(it.in)), b = parent ? bounds(parent, doc) : null;
    const n = doc.elements.filter(e => e.st).length;
    el.x = b ? b.x + 24 : 60 + (n % 6) * 40; el.y = b ? b.y + 48 : 60 + Math.floor(n / 6) * 40;
    doc.elements.push(el); doc.byId.set(id, el);
  } else if (!group && want !== el.kind && (it.icon || it.shape || it.kind)) {
    el.kind = want; Object.assign(el, sizeFor(el)); el.params = { ...makeElement(want).params }; el.style = { ...makeElement(want).style };
  }
  // how a container arranges its parts, and how a part sits in one
  if (group) {
    if (it.device !== undefined) { if (DEVICES[it.device]) el.device = it.device; else delete el.device; }
    if (it.layout !== undefined) { if (FLOWS.has(it.layout)) el.layout = it.layout; else delete el.layout; }
    for (const k of ['gap', 'pad']) if (it[k] != null) el[k] = +it[k];
    if (it.align) el.align = it.align;
  }
  if (it.dock !== undefined) { if (it.dock === 'top' || it.dock === 'bottom') el.dock = it.dock; else delete el.dock; }
  if (it.grow !== undefined) { if (it.grow) el.grow = true; else delete el.grow; }
  if (it.w != null || it.h != null) el.want = { ...el.want, ...(it.w != null ? { w: +it.w } : {}), ...(it.h != null ? { h: +it.h } : {}) };
  if (it.label != null) el.text = { ...el.text, content: String(it.label) };
  if (it.in !== undefined) { if (it.in && it.in !== id && doc.byId.get(String(it.in))) el.parent = String(it.in); else delete el.parent; }
  if (it.note != null) el.note = String(it.note);
  // restyle only what the structure owns; hand-drawn and replicated shapes keep their look
  if (group) { if (change === 'add' || el.st === 'group') styleGroup(el, it, depthOf(doc, el)); }
  else if (change === 'add' || el.st === 'node') styleNode(doc, el, it, change === 'add');
  else if (it.color) el.style = { ...el.style, fill: it.color };
  if (change === 'add') Object.assign(el, sizeFor(el));
  return { id, change, name: label(el) || el.caption || id };
}
function groupKind(it, el) {
  const device = it.device !== undefined ? it.device : el?.device, layout = it.layout !== undefined ? it.layout : el?.layout;
  return DEVICES[device] ? 'screen' : FLOWS.has(layout) ? 'rect' : 'container';
}
function nodeKind(it, el) {
  if (it.icon) { const k = resolveKind(String(it.icon)); if (getKind(k)?.pack) return k; }
  if (it.kind) { const k = resolveKind(String(it.kind)); if (getKind(k) && k !== 'connector') return k; }
  if (it.shape === 'person') { const k = resolveKind('azure:Users'); if (getKind(k)) return k; }
  if (it.shape && SHAPES[it.shape]) return SHAPES[it.shape];
  return el ? el.kind : 'rect';
}
function styleGroup(el, it, depth) {
  const tone = it.tone || el.tone || 'neutral', t = TONES[tone] || TONES.neutral; el.tone = tone in TONES ? tone : 'neutral';
  el.kind = groupKind(it, el);
  if (el.kind === 'screen') {
    el.params = { device: el.device };
    el.style = { ...makeElement('screen').style, ...(it.color ? { fill: it.color } : {}) };
    el.text = { ...el.text, size: 14, weight: 600, color: '#1f2328', align: 'left', valign: 'bottom', font: 'Inter', autoSize: false };
  } else if (el.kind === 'rect') {
    // rows and stacks inside a screen: an optional surface (bar, card), no title of their own
    if (it.label != null) el.caption = String(it.label);
    el.params = { radius: it.radius ?? el.params?.radius ?? 0 };
    el.style = { fill: it.color || el.style?.fill || 'none', stroke: it.stroke || 'none', strokeWidth: it.stroke ? 1 : 0 };
    el.text = { content: '' };
  } else {
    el.params = { header: 34, radius: 12, divider: false };
    el.style = { fill: depth % 2 ? '#ffffff' : t.fill, fill2: 'none', stroke: t.stroke, strokeWidth: 1.5 };
    el.text = { ...el.text, size: 13, weight: 600, color: t.text, align: 'left', valign: 'middle', font: 'Inter', autoSize: false };
  }
}
// Flow shapes get the diagram look; any other library kind keeps its own look, with the
// colours and text settings the model asked for on top.
function styleNode(doc, el, it, fresh) {
  const inScreen = !!layoutRoot(doc, el), text = { ...(it.textColor ? { color: it.textColor } : {}), ...(it.size ? { size: +it.size } : {}), ...(it.weight ? { weight: +it.weight } : {}), ...(it.align ? { align: it.align } : {}) };
  if (isIcon(el)) { el.text = { ...el.text, size: 12.5, color: NODE.text, font: 'Inter', autoSize: false, ...text }; return; }
  if (FLOW_KINDS.has(el.kind) && !inScreen) {
    el.params = { ...el.params, ...(el.kind === 'rect' ? { radius: 10 } : {}) };
    el.style = { ...el.style, fill: it.color || el.style?.fill && el.style.fill !== '#ffffff' && el.style.fill || NODE.fill, stroke: NODE.stroke, strokeWidth: 1.5, ...(it.color ? { fill: it.color } : {}) };
    el.text = { ...el.text, size: 14, color: NODE.text, font: 'Inter', autoSize: false, ...text };
    return;
  }
  if (fresh && el.kind === 'rect') { el.params = { ...el.params, radius: 10 }; el.style = { fill: '#f3f4f6', stroke: 'none', strokeWidth: 0 }; }
  if (fresh && el.kind === 'text') el.text = { ...el.text, size: 14, align: 'left' };
  if (it.color) el.style = { ...el.style, fill: it.color };
  if (it.stroke) el.style = { ...el.style, stroke: it.stroke, strokeWidth: el.style?.strokeWidth || 1.5 };
  el.text = { ...el.text, font: el.text?.font || 'Inter', autoSize: false, ...text };
}
// The screen (or other self-arranging container) a shape sits in, outermost first.
function layoutRoot(doc, el) {
  let root = null, p = el.parent && doc.byId.get(el.parent), n = 0;
  while (p && n++ < 12) { if (isLayoutGroup(p)) root = p; p = p.parent && doc.byId.get(p.parent); }
  return root;
}
function sizeFor(el) {
  if (isIcon(el)) return { w: ICON, h: ICON };
  if (el.kind === 'screen') { const d = DEVICES[el.device] || DEVICES.phone; return { w: d.w, h: d.h }; }
  if (!FLOW_KINDS.has(el.kind)) { const k = getKind(el.kind); return { w: k?.size?.[0] || 160, h: k?.size?.[1] || 40 }; }
  const t = label(el), lines = String(t).split('\n'), widest = Math.max(...lines.map(l => textWidth(l)), 40);
  if (el.kind === 'cylinder') return { w: Math.min(180, Math.max(110, widest + 36)), h: 90 };
  if (el.kind === 'diamond') return { w: Math.min(240, Math.max(140, widest * 1.4 + 40)), h: 90 };
  const w = Math.min(220, Math.max(124, widest + 40));
  const rows = lines.reduce((n, l) => n + Math.max(1, Math.ceil(textWidth(l) / (w - 32))), 0);
  return { w, h: Math.max(56, 26 + rows * 18) };
}
const depthOf = (doc, el) => { let d = 0, p = el.parent && doc.byId.get(el.parent); while (p && d < 8) { d++; p = p.parent && doc.byId.get(p.parent); } return d; };

function upsertEdge(doc, it) {
  const [a, b] = [].concat(it.edge).map(String);
  if (!doc.byId.get(a) || !doc.byId.get(b) || a === b) return null;
  const id = String(it.id || `${a}>${b}`);
  let c = doc.byId.get(id), change = 'update';
  if (!c) {
    c = { id, kind: 'connector', st: 'edge', from: { id: a }, to: { id: b }, route: 'elbow', start: 'none', end: 'arrow', style: { stroke: EDGE, strokeWidth: 1.6 }, text: {} };
    doc.elements.push(c); doc.byId.set(id, c); change = 'add';
  }
  if (it.label != null) c.text = { size: 12, color: '#3b4250', font: 'Inter', content: String(it.label) };
  if (it.dashed != null) c.style = { ...c.style, dash: it.dashed ? 'dashed' : 'solid' };
  return { id, change, name: (doc.byId.get(a) && label(doc.byId.get(a))) + ' → ' + (doc.byId.get(b) && label(doc.byId.get(b))) };
}

function removeItem(doc, id) {
  const el = doc.byId.get(id); if (!el) return null;
  const gone = new Set([id]);
  for (const e of doc.elements) {
    if (e.parent === id) { if (el.parent) e.parent = el.parent; else delete e.parent; }
    if (e.kind === 'connector' && (e.from?.id === id || e.to?.id === id)) gone.add(e.id);
  }
  doc.elements = doc.elements.filter(e => !gone.has(e.id)); indexDoc(doc);
  return { id, change: 'remove', name: label(el) || id };
}

// ---------- writing a document back as lines (for edit requests) ----------
// Hand-drawn shapes count too: their group is the smallest box that holds them.
export function serialize(doc) {
  const els = doc.elements.filter(e => !e.ghost && !e.hidden), out = [];
  const shapes = els.filter(e => e.kind !== 'connector' && e.kind !== 'image');
  const groups = shapes.filter(isGroup);
  const parentOf = el => {
    if (el.parent && doc.byId.get(el.parent)) return el.parent;
    const b = bounds(el, doc); let best = null, area = Infinity;
    for (const g of groups) { if (g === el) continue; const gb = bounds(g, doc); const a = gb.w * gb.h; if (a < area && a > b.w * b.h && gb.x <= b.x && gb.y <= b.y && gb.x + gb.w >= b.x + b.w && gb.y + gb.h >= b.y + b.h) { best = g.id; area = a; } }
    return best;
  };
  const kindName = el => { const k = getKind(el.kind); if (k?.pack) return { icon: `${k.pack === 'Azure' ? 'azure' : k.pack.toLowerCase().replace(/\s+/g, '-')}:${k.name}` }; const s = Object.entries(SHAPES).find(([, v]) => v === el.kind); return s && s[0] !== 'box' ? { shape: s[0] } : el.kind !== 'rect' ? { kind: el.kind } : {}; };
  const placing = el => ({ ...(el.dock ? { dock: el.dock } : {}), ...(el.grow ? { grow: true } : {}), ...(el.want?.w != null ? { w: el.want.w } : {}), ...(el.want?.h != null ? { h: el.want.h } : {}) });
  for (const g of groups) out.push({ group: g.id, label: label(g) || g.caption || '', ...(g.tone && !isLayoutGroup(g) ? { tone: g.tone } : {}), ...(g.device ? { device: g.device } : {}), ...(g.layout ? { layout: g.layout } : {}), ...(parentOf(g) ? { in: parentOf(g) } : {}), ...placing(g) });
  for (const n of shapes.filter(e => !isGroup(e))) out.push({ node: n.id, label: label(n), ...kindName(n), ...(parentOf(n) ? { in: parentOf(n) } : {}), ...placing(n), ...(n.note ? { note: n.note } : {}) });
  for (const c of els.filter(e => e.kind === 'connector' && e.from?.id && e.to?.id)) out.push({ edge: [c.from.id, c.to.id], ...(c.id !== `${c.from.id}>${c.to.id}` ? { id: c.id } : {}), ...(c.text?.content ? { label: c.text.content } : {}), ...(c.style?.dash === 'dashed' ? { dashed: true } : {}) });
  return out.map(o => JSON.stringify(o)).join('\n');
}

// ---------- layout ----------
let elk = null;
function loadElk() {
  return elk ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/elkjs@0.9.3/lib/elk.bundled.js';
    s.onload = () => resolve(new window.ELK()); s.onerror = () => { elk = null; reject(new Error('Could not load the layout engine.')); };
    document.head.appendChild(s);
  });
}
// Can the whole diagram be laid out again, or has the user arranged it by hand?
export const fullyStructured = doc => !doc.manualLayout && doc.elements.every(e => e.st || e.ghost);

// ---------- screens, rows and stacks ----------
// A small flexbox: stacks go top to bottom, rows left to right, docked parts stick to a
// screen's top or bottom edge, "grow" parts take the rest of a row. Positions come back
// relative to the outermost container.
const isLine = el => getKind(el.kind)?.category === 'icons';
function leafSize(el, avail) {
  const want = el.want || {}, k = getKind(el.kind), t = label(el), size = el.text?.size || 14;
  if (isLine(el)) return { w: want.w ?? 24, h: want.h ?? 24 };
  if (el.kind === 'text') {
    const w = want.w ?? Math.min(avail, textWidth(t, size) + 6), lines = String(t).split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(textWidth(l, size) / Math.max(20, w - 4))), 0);
    return { w, h: want.h ?? Math.ceil(lines * size * 1.35 + 2) };
  }
  const natural = el.kind === 'button' ? Math.max(80, textWidth(t, 12) + 36) : ['checkbox', 'toggle'].includes(el.kind) ? textWidth(t, 13) + (el.kind === 'toggle' ? 64 : 32) : k?.size?.[0] || 160;
  return { w: want.w ?? natural, h: want.h ?? (k?.size?.[1] || 40) };
}
// Parts that keep their natural width in a stack (the rest stretch across it).
const keepsWidth = el => isLine(el) || el.kind === 'dots' || el.kind === 'ellipse' || el.want?.w != null;
function flowLayout(doc, root) {
  const kids = new Map();
  for (const e of doc.elements) if (e.parent && e.st && e.kind !== 'connector') { if (!kids.has(e.parent)) kids.set(e.parent, []); kids.get(e.parent).push(e); }
  for (const list of kids.values()) list.sort((a, b) => (a.seq ?? 1e9) - (b.seq ?? 1e9));
  const out = new Map();
  const shift = (id, dx, dy) => { const b = out.get(id); if (b) { b.x += dx; b.y += dy; } for (const c of kids.get(id) || []) shift(c.id, dx, dy); };
  // natural width of anything, for rows
  const widthOf = (el, avail) => isLayoutGroup(el) ? (el.want?.w ?? (el.layout === 'row' ? (kids.get(el.id) || []).reduce((w, c) => w + widthOf(c, avail), 0) + (el.gap ?? 10) * Math.max(0, (kids.get(el.id) || []).length - 1) + (el.pad ?? 0) * 2 : avail)) : leafSize(el, avail).w;
  function place(el, x, y, w) {
    if (!isLayoutGroup(el)) { const b = { x, y, w, h: leafSize(el, w).h }; out.set(el.id, b); return b.h; }
    const items = kids.get(el.id) || [], dev = DEVICES[el.device];
    if (el.layout === 'row' && !dev) {
      const pad = el.pad ?? (el.style?.fill && el.style.fill !== 'none' ? 12 : 0), gap = el.gap ?? 10, inner = w - pad * 2;
      const fixed = items.filter(c => !c.grow).reduce((t, c) => t + Math.min(inner, widthOf(c, inner)), 0) + gap * Math.max(0, items.length - 1);
      const growers = items.filter(c => c.grow).length, share = growers ? Math.max(30, (inner - fixed) / growers) : 0;
      // spread evenly when nothing grows and the row has room (tab bars)
      const spread = !growers && items.length > 1 && el.align === 'spread' ? (inner - fixed) / (items.length - 1) : 0;
      let cx = x + pad, rowH = 0; const hs = [];
      for (const c of items) { const cw = c.grow ? share : Math.min(inner, widthOf(c, inner)); const h = place(c, cx, y + pad, cw); hs.push(h); rowH = Math.max(rowH, h); cx += cw + gap + spread; }
      items.forEach((c, i) => shift(c.id, 0, (rowH - hs[i]) / 2));
      const h = el.want?.h ?? rowH + pad * 2;
      if (el.want?.h) items.forEach(c => shift(c.id, 0, (h - rowH - pad * 2) / 2));
      out.set(el.id, { x, y, w, h }); return h;
    }
    // stacks and screens
    const pad = el.pad ?? (dev ? 16 : el.style?.fill && el.style.fill !== 'none' ? 12 : 0), gap = el.gap ?? (dev ? 12 : 8);
    const top = dev ? dev.top : 0, bottom = dev ? dev.bottom : 0;
    const docked = c => dev && (c.dock === 'top' || c.dock === 'bottom');
    let cy = y + top;
    for (const c of items.filter(c => docked(c) && c.dock === 'top')) cy += place(c, x, cy, w);
    cy += pad;
    for (const c of items.filter(c => !docked(c))) {
      const inner = w - pad * 2, cw = keepsWidth(c) && !isLayoutGroup(c) ? Math.min(inner, leafSize(c, inner).w) : inner;
      const cx = x + pad + (el.align === 'center' ? (inner - cw) / 2 : el.align === 'right' ? inner - cw : 0);
      cy += place(c, cx, cy, cw) + gap;
    }
    let content = cy - gap + pad - y;
    const bottoms = items.filter(c => docked(c) && c.dock === 'bottom');
    let by = 0; const bh = bottoms.map(c => { const h = place(c, x, y, w); by += h; return h; });
    let h = el.want?.h ?? (dev ? Math.max(dev.h, content + by + bottom) : content);
    if (el.want?.h && el.want.h < content) h = content;
    let yb = y + h - bottom - by; bottoms.forEach((c, i) => { shift(c.id, 0, yb - y); yb += bh[i]; });
    out.set(el.id, { x, y, w, h }); return h;
  }
  const w = root.want?.w ?? (DEVICES[root.device]?.w || Math.max(200, widthOf(root, 320)));
  place(root, 0, 0, w);
  return out;
}

// Compute positions for structured content. Returns element boxes and link routes in page space.
export async function computeLayout(doc) {
  const engine = await loadElk();
  const all = doc.elements.filter(e => e.st && !e.hidden);
  // screens and other self-arranging containers lay out their parts first; ELK sees them as one block
  const roots = all.filter(e => isLayoutGroup(e) && !layoutRoot(doc, e)), rel = new Map(), inside = new Map();
  for (const r of roots) for (const [id, b] of flowLayout(doc, r)) { rel.set(id, { root: r.id, ...b }); if (id !== r.id) inside.set(id, r.id); }
  const els = all.filter(e => !inside.has(e.id));
  const shapes = els.filter(e => e.st !== 'edge'), ids = new Set(shapes.map(e => e.id));
  const node = new Map();
  const dir = doc.layoutDir === 'down' ? 'DOWN' : 'RIGHT';
  for (const el of shapes) {
    const icon = isIcon(el);
    const n = { id: el.id, width: el.w, height: el.h, children: [], layoutOptions: {} };
    if (icon && label(el)) { n.labels = [{ text: label(el), width: Math.min(150, textWidth(label(el), 12.5) + 8), height: 34 }]; n.layoutOptions['elk.nodeLabels.placement'] = 'OUTSIDE V_BOTTOM H_CENTER'; }
    if (rel.has(el.id)) { const b = rel.get(el.id); n.width = b.w; n.height = b.h; if (el.kind === 'screen' && label(el)) { n.labels = [{ text: label(el), width: textWidth(label(el), 14) + 8, height: 26 }]; n.layoutOptions['elk.nodeLabels.placement'] = 'OUTSIDE V_TOP H_LEFT'; } }
    else if (el.st === 'group') { Object.assign(n.layoutOptions, { 'elk.padding': '[top=50,left=22,bottom=22,right=22]', 'elk.nodeSize.constraints': 'MINIMUM_SIZE', 'elk.nodeSize.minimum': `(${Math.max(160, textWidth(label(el), 13) + 40)},90)` }); delete n.width; delete n.height; }
    node.set(el.id, n);
  }
  const root = { id: '__root', children: [], edges: [], layoutOptions: {
    'elk.algorithm': 'layered', 'elk.direction': dir, 'elk.hierarchyHandling': 'INCLUDE_CHILDREN', 'elk.edgeRouting': 'ORTHOGONAL',
    'elk.layered.spacing.nodeNodeBetweenLayers': '64', 'elk.spacing.nodeNode': '36', 'elk.spacing.edgeNode': '20', 'elk.spacing.edgeEdge': '12',
    'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX', 'elk.layered.wrapping.strategy': 'MULTI_EDGE', 'elk.aspectRatio': '1.6', 'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES', 'elk.spacing.componentComponent': '60',
  } };
  for (const el of shapes) (el.parent && ids.has(el.parent) && node.get(el.parent).children ? node.get(el.parent) : root).children.push(node.get(el.id));
  for (const g of shapes) { const n = node.get(g.id); if (g.st === 'group' && !rel.has(g.id) && !n.children.length) { n.width = Math.max(160, textWidth(label(g), 13) + 40); n.height = 90; } }
  // a link from a part inside a screen counts as a link from the screen; it is routed later
  const lifted = new Set(), end = id => inside.get(id) || id;
  for (const c of all.filter(e => e.st === 'edge')) {
    const a = end(c.from.id), b = end(c.to.id); if (!ids.has(a) || !ids.has(b) || a === b) continue;
    if (a !== c.from.id || b !== c.to.id) lifted.add(c.id);
    root.edges.push({ id: c.id, sources: [a], targets: [b], ...(c.text?.content ? { labels: [{ text: c.text.content, width: textWidth(c.text.content, 12) + 10, height: 18 }] } : {}) });
  }
  const res = await engine.layout(root);
  const boxes = new Map(), routes = new Map();
  // ELK places children relative to their parent, and each route relative to the container it chose
  const walk = (n, ox, oy) => { for (const ch of n.children || []) { boxes.set(ch.id, { x: ch.x + ox, y: ch.y + oy, w: ch.width, h: ch.height }); walk(ch, ch.x + ox, ch.y + oy); } };
  walk(res, 0, 0);
  for (const [id, b] of rel) if (id !== b.root && boxes.has(b.root)) { const r = boxes.get(b.root); boxes.set(id, { x: r.x + b.x, y: r.y + b.y, w: b.w, h: b.h }); }
  for (const e of res.edges || []) {
    const s = e.sections?.[0]; if (!s || lifted.has(e.id)) continue;
    const c = e.container && boxes.get(e.container), ox = c ? c.x : 0, oy = c ? c.y : 0;
    routes.set(e.id, [s.startPoint, ...(s.bendPoints || []), s.endPoint].map(p => ({ x: p.x + ox, y: p.y + oy })));
  }
  return { boxes, routes, rel };
}

// Apply a layout. With `keep`, elements already on the canvas stay where they are and new ones
// are placed by the offset of their nearest placed neighbour (hand-arranged diagrams).
export function layoutTargets(doc, { boxes, routes, rel = new Map() }, { keep = null, origin = null } = {}) {
  const target = new Map();
  let dx = 0, dy = 0;
  if (!keep) {
    // keep the diagram where it was on the page
    const ox = origin?.x ?? 60, oy = origin?.y ?? 60;
    const all = [...boxes.values()]; const minX = Math.min(...all.map(b => b.x)), minY = Math.min(...all.map(b => b.y));
    dx = ox - minX; dy = oy - minY;
    for (const [id, b] of boxes) target.set(id, { x: b.x + dx, y: b.y + dy, w: b.w, h: b.h });
  } else {
    for (const [id, b] of boxes) {
      const el = doc.byId.get(id); if (!el) continue;
      if (keep.has(id)) continue;
      // offset of a placed neighbour: a linked shape, else the parent group, else none
      const link = doc.elements.find(c => c.kind === 'connector' && ((c.from.id === id && keep.has(c.to.id)) || (c.to.id === id && keep.has(c.from.id))));
      const nb = link ? (link.from.id === id ? link.to.id : link.from.id) : el.parent && keep.has(el.parent) ? el.parent : null;
      const nbEl = nb && doc.byId.get(nb), nbBox = nb && boxes.get(nb);
      const ox = nbEl && nbBox ? nbEl.x - nbBox.x : 60 - Math.min(...[...boxes.values()].map(v => v.x)), oy = nbEl && nbBox ? nbEl.y - nbBox.y : 60 - Math.min(...[...boxes.values()].map(v => v.y));
      target.set(id, { x: b.x + ox, y: b.y + oy, w: b.w, h: b.h });
    }
  }
  if (keep) for (const [id, b] of rel) {
    const root = doc.byId.get(b.root); if (!root) continue;
    const at = target.get(b.root) || { x: root.x, y: root.y };
    if (id === b.root) target.set(id, { x: at.x, y: at.y, w: b.w, h: b.h }); else target.set(id, { x: at.x + b.x, y: at.y + b.y, w: b.w, h: b.h });
  }
  const points = new Map();
  if (!keep) for (const [id, r] of routes) points.set(id, r.map(p => ({ x: p.x + dx, y: p.y + dy })));
  return { target, points };
}

// Groups grow to hold their children (after hand placement of new nodes).
export function fitGroups(doc) {
  const groups = doc.elements.filter(e => e.st === 'group' && !isLayoutGroup(e) && !layoutRoot(doc, e)).sort((a, b) => depthOf(doc, b) - depthOf(doc, a));
  for (const g of groups) {
    const kids = doc.elements.filter(e => e.parent === g.id && e.kind !== 'connector'); if (!kids.length) continue;
    const bs = kids.map(k => { const b = bounds(k, doc); return isIcon(k) ? { x: b.x - 40, y: b.y, w: b.w + 80, h: b.h + 34 } : b; });
    const x0 = Math.min(g.x, ...bs.map(b => b.x - 22)), y0 = Math.min(g.y, ...bs.map(b => b.y - 50));
    const x1 = Math.max(g.x + g.w, ...bs.map(b => b.x + b.w + 22)), y1 = Math.max(g.y + g.h, ...bs.map(b => b.y + b.h + 22));
    Object.assign(g, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  }
}

// z-order: outer groups first, then inner groups, nodes, and links on top.
export function sortLayers(doc) {
  const rank = e => e.st === 'group' ? depthOf(doc, e) : e.kind === 'connector' ? 100 : e.st ? 50 : -1;
  const order = new Map(doc.elements.map((e, i) => [e.id, i]));
  doc.elements.sort((a, b) => (rank(a) - rank(b)) || (order.get(a.id) - order.get(b.id)));
}

// Anchors that make a connector leave its shapes where the route does.
export function anchorsFor(doc, c, pts, target) {
  const at = (id, p) => { const b = target.get(id) || doc.byId.get(id); if (!b || !p) return { id }; const ax = (p.x - b.x) / b.w, ay = (p.y - b.y) / b.h; const cl = v => Math.max(0, Math.min(1, Math.round(v * 1000) / 1000)); return { id, ax: cl(ax), ay: cl(ay) }; };
  return { from: at(c.from.id, pts[0]), to: at(c.to.id, pts.at(-1)) };
}
