// Diagrams as structure. The AI writes short JSON lines (groups, nodes, links); they become
// ordinary elements on the canvas, so hand edits, grouping and export work as for anything
// drawn by hand. ELK lays them out: groups really contain their nodes, links route around.
//
//   {"group":"onprem","label":"On-premises","tone":"onprem","in":"parent-group"}
//   {"node":"ad","label":"AD group","icon":"azure:Groups","shape":"box","in":"onprem","note":"…"}
//   {"edge":["ad","entra"],"label":"2. Sync","dashed":true}
//   {"remove":"id"}   {"title":"…"}   {"layout":"right"|"down"}   {"say":"…"}

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
const GROUP_KINDS = new Set(['container', 'lane', 'frame']);
const ICON = 48;

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
  if (it.layout) { doc.layoutDir = doc.layoutAsked = it.layout === 'down' ? 'down' : 'right'; return null; }
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
  const want = group ? 'container' : nodeKind(it, el);
  if (el && el.kind === 'connector') return null;
  if (!el) {
    el = makeElement(want, { id });
    el.st = group ? 'group' : 'node'; change = 'add';
    // provisional spot: near its group or below the rest, until the next layout
    const parent = it.in && doc.byId.get(String(it.in)), b = parent ? bounds(parent, doc) : null;
    const n = doc.elements.filter(e => e.st).length;
    el.x = b ? b.x + 24 : 60 + (n % 6) * 40; el.y = b ? b.y + 48 : 60 + Math.floor(n / 6) * 40;
    doc.elements.push(el); doc.byId.set(id, el);
  } else if (!group && want !== el.kind && (it.icon || it.shape)) {
    el.kind = want; Object.assign(el, sizeFor(el)); el.params = { ...makeElement(want).params };
  }
  if (it.label != null) el.text = { ...el.text, content: String(it.label) };
  if (it.in !== undefined) { if (it.in && it.in !== id && doc.byId.get(String(it.in))) el.parent = String(it.in); else delete el.parent; }
  if (it.note != null) el.note = String(it.note);
  // restyle only what the structure owns; hand-drawn and replicated shapes keep their look
  if (group) { if (change === 'add' || el.st === 'group') styleGroup(el, it.tone || el.tone || 'neutral', depthOf(doc, el)); }
  else if (change === 'add' || el.st === 'node') styleNode(el, it);
  else if (it.color) el.style = { ...el.style, fill: it.color };
  if (change === 'add') Object.assign(el, sizeFor(el));
  return { id, change, name: label(el) || id };
}
function nodeKind(it, el) {
  if (it.icon) { const k = resolveKind(String(it.icon)); if (getKind(k)?.pack) return k; }
  if (it.shape === 'person') { const k = resolveKind('azure:Users'); if (getKind(k)) return k; }
  if (it.shape && SHAPES[it.shape]) return SHAPES[it.shape];
  return el ? el.kind : 'rect';
}
function styleGroup(el, tone, depth) {
  const t = TONES[tone] || TONES.neutral; el.tone = tone in TONES ? tone : 'neutral';
  el.kind = 'container';
  el.params = { header: 34, radius: 12, divider: false };
  el.style = { fill: depth % 2 ? '#ffffff' : t.fill, fill2: 'none', stroke: t.stroke, strokeWidth: 1.5 };
  el.text = { ...el.text, size: 13, weight: 600, color: t.text, align: 'left', valign: 'middle', font: 'Inter', autoSize: false };
}
function styleNode(el, it) {
  if (isIcon(el)) { el.text = { ...el.text, size: 12.5, color: NODE.text, font: 'Inter', autoSize: false }; return; }
  el.params = { ...el.params, ...(el.kind === 'rect' ? { radius: 10 } : {}) };
  el.style = { ...el.style, fill: it.color || el.style?.fill && el.style.fill !== '#ffffff' && el.style.fill || NODE.fill, stroke: NODE.stroke, strokeWidth: 1.5, ...(it.color ? { fill: it.color } : {}) };
  el.text = { ...el.text, size: 14, color: NODE.text, font: 'Inter', autoSize: false };
}
function sizeFor(el) {
  if (isIcon(el)) return { w: ICON, h: ICON };
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
  const kindName = el => { const k = getKind(el.kind); if (k?.pack) return { icon: `${k.pack === 'Azure' ? 'azure' : k.pack.toLowerCase().replace(/\s+/g, '-')}:${k.name}` }; const s = Object.entries(SHAPES).find(([, v]) => v === el.kind); return s && s[0] !== 'box' ? { shape: s[0] } : el.kind === 'text' ? { shape: 'text' } : {}; };
  for (const g of groups) out.push({ group: g.id, label: label(g), ...(g.tone ? { tone: g.tone } : {}), ...(parentOf(g) ? { in: parentOf(g) } : {}) });
  for (const n of shapes.filter(e => !isGroup(e))) out.push({ node: n.id, label: label(n), ...kindName(n), ...(parentOf(n) ? { in: parentOf(n) } : {}), ...(n.note ? { note: n.note } : {}) });
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

// Compute positions for structured content. Returns element boxes and link routes in page space.
export async function computeLayout(doc, { dir: want } = {}) {
  const engine = await loadElk();
  const els = doc.elements.filter(e => e.st && !e.hidden);
  const shapes = els.filter(e => e.st !== 'edge'), ids = new Set(shapes.map(e => e.id));
  const node = new Map();
  const dir = (want || doc.layoutDir) === 'down' ? 'DOWN' : 'RIGHT';
  for (const el of shapes) {
    const icon = isIcon(el);
    const n = { id: el.id, width: el.w, height: el.h, children: [], layoutOptions: {} };
    // icon labels go below in horizontal flows and beside the icon in vertical ones, out of the links' way
    if (icon && label(el)) { n.labels = [{ text: label(el), width: Math.min(150, textWidth(label(el), 12.5) + 10), height: dir === 'DOWN' ? 32 : 34 }]; n.layoutOptions['elk.nodeLabels.placement'] = dir === 'DOWN' ? 'OUTSIDE V_CENTER H_RIGHT' : 'OUTSIDE V_BOTTOM H_CENTER'; }
    if (el.st === 'group') Object.assign(n.layoutOptions, { 'elk.padding': '[top=50,left=22,bottom=22,right=22]', 'elk.nodeSize.constraints': 'MINIMUM_SIZE', 'elk.nodeSize.minimum': `(${Math.max(160, textWidth(label(el), 13) + 40)},90)` });
    if (el.st === 'group') { delete n.width; delete n.height; }
    node.set(el.id, n);
  }
  const root = { id: '__root', children: [], edges: [], layoutOptions: {
    'elk.algorithm': 'layered', 'elk.direction': dir, 'elk.hierarchyHandling': 'INCLUDE_CHILDREN', 'elk.edgeRouting': 'ORTHOGONAL',
    'elk.layered.spacing.nodeNodeBetweenLayers': '64', 'elk.spacing.nodeNode': '36', 'elk.spacing.edgeNode': '20', 'elk.spacing.edgeEdge': '12',
    'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX', 'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES', 'elk.spacing.componentComponent': '60',
  } };
  for (const el of shapes) (el.parent && ids.has(el.parent) && node.get(el.parent).children ? node.get(el.parent) : root).children.push(node.get(el.id));
  for (const g of shapes) { const n = node.get(g.id); if (g.st === 'group' && !n.children.length) { n.width = Math.max(160, textWidth(label(g), 13) + 40); n.height = 90; } }
  for (const c of els.filter(e => e.st === 'edge')) if (ids.has(c.from.id) && ids.has(c.to.id)) root.edges.push({ id: c.id, sources: [c.from.id], targets: [c.to.id], ...(c.text?.content ? { labels: [{ text: c.text.content, width: textWidth(c.text.content, 12) + 10, height: 18 }] } : {}) });
  const res = await engine.layout(root);
  const boxes = new Map(), routes = new Map();
  // ELK places children relative to their parent, and each route relative to the container it chose
  const walk = (n, ox, oy) => { for (const ch of n.children || []) { boxes.set(ch.id, { x: ch.x + ox, y: ch.y + oy, w: ch.width, h: ch.height }); walk(ch, ch.x + ox, ch.y + oy); } };
  walk(res, 0, 0);
  for (const e of res.edges || []) {
    const s = e.sections?.[0]; if (!s) continue;
    const c = e.container && boxes.get(e.container), ox = c ? c.x : 0, oy = c ? c.y : 0;
    routes.set(e.id, [s.startPoint, ...(s.bendPoints || []), s.endPoint].map(p => ({ x: p.x + ox, y: p.y + oy })));
  }
  return { boxes, routes };
}

// Lay out both ways and keep the one that shows larger in a view of this aspect ratio
// (width / height). Flows read best left to right, so that wins unless top to bottom is clearly
// bigger on screen; when the model asked for top to bottom (hierarchies), that wins unless
// left to right is better.
export async function bestLayout(doc, aspect = 1.6) {
  const [right, down] = await Promise.all([computeLayout(doc, { dir: 'right' }), computeLayout(doc, { dir: 'down' })]);
  const fit = lay => { const bs = [...lay.boxes.values()]; if (!bs.length) return 1; const w = Math.max(...bs.map(v => v.x + v.w)) - Math.min(...bs.map(v => v.x)), h = Math.max(...bs.map(v => v.y + v.h)) - Math.min(...bs.map(v => v.y)); return Math.min(aspect / w, 1 / h); };
  const useDown = doc.layoutAsked === 'down' ? fit(right) <= fit(down) * 1.05 : fit(down) > fit(right) * 1.3;
  return useDown ? { lay: down, dir: 'down' } : { lay: right, dir: 'right' };
}

// Icon labels follow the layout direction (see computeLayout).
export function placeLabels(doc) {
  for (const el of doc.elements) if (el.st === 'node' && getKind(el.kind)?.pack) {
    if (doc.layoutDir === 'down') { el.labelSide = 'right'; el.text = { ...el.text, align: 'left', valign: 'middle' }; }
    else if (el.labelSide) { delete el.labelSide; el.text = { ...el.text, align: 'center', valign: 'top' }; }
  }
}

// Apply a layout. With `keep`, elements already on the canvas stay where they are and new ones
// are placed by the offset of their nearest placed neighbour (hand-arranged diagrams).
export function layoutTargets(doc, { boxes, routes }, { keep = null, origin = null } = {}) {
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
  const points = new Map();
  if (!keep) for (const [id, r] of routes) points.set(id, r.map(p => ({ x: p.x + dx, y: p.y + dy })));
  return { target, points };
}

// Groups grow to hold their children (after hand placement of new nodes).
export function fitGroups(doc) {
  const groups = doc.elements.filter(e => e.st === 'group').sort((a, b) => depthOf(doc, b) - depthOf(doc, a));
  for (const g of groups) {
    const kids = doc.elements.filter(e => e.parent === g.id && e.kind !== 'connector'); if (!kids.length) continue;
    const bs = kids.map(k => { const b = bounds(k, doc); return !isIcon(k) ? b : k.labelSide === 'right' ? { x: b.x, y: b.y, w: b.w + 160, h: b.h } : { x: b.x - 40, y: b.y, w: b.w + 80, h: b.h + 34 }; });
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
