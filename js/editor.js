// The canvas: rendering with a keyed DOM diff, camera, selection, move/resize/rotate,
// connectors (drag from a shape's dots, re-attach ends, bend), text editing and snapping.

import { state, change, beginChange, endChange, emit, onChange, select, clearSelection, toggleSelect, selected, makeElement, uid, clone, undo, redo } from './store.js';
import { elementSvg, pageSvg, indexDoc } from './render.js';
import { getKind, scopeFor, textBox, onKindsChanged } from './kinds.js';
import { bounds, unionBounds, toLocal, toWorld, connectorPoints, endpoint, distToPoly, rotatePt } from './geom.js';
import { onFontsChanged, ensureFont, fontStack, fitText } from './text.js';
import { initMinimap } from './minimap.js';
import { displayDoc } from './theme.js';
import { initQuickInsert } from './quick-insert.js';

const NS = 'http://www.w3.org/2000/svg';
export const cam = { x: 0, y: 0, z: 1 };
let svg, world, pageLayer, content, overlay, sourceImg, stage, textEd, quickInsert;
let lineTool = { route: 'straight', end: 'arrow' };
const nodes = new Map();
// mode: 'diagram' (editable diagram only), 'source' (original image on top), 'both' (image over the diagram at `blend`)
export const view = { mode: 'diagram', blend: 0.5, snap: true, tool: 'select', placing: null, locked: false };
const listeners = new Set();
export const onViewChanged = fn => listeners.add(fn);
const viewChanged = () => listeners.forEach(f => f());

export function initEditor(root) {
  stage = root;
  stage.innerHTML = `<svg id="canvas" xmlns="${NS}"><g id="world"><g id="pageLayer"></g><g id="content"></g><image id="sourceImg" pointer-events="none" style="display:none"/><g id="overlay"></g></g></svg><textarea id="textEd" spellcheck="false" hidden></textarea><div id="zoomBadge"></div>`;
  svg = stage.querySelector('#canvas'); world = svg.querySelector('#world'); pageLayer = svg.querySelector('#pageLayer');
  content = svg.querySelector('#content'); overlay = svg.querySelector('#overlay'); sourceImg = svg.querySelector('#sourceImg');
  textEd = stage.querySelector('#textEd');
  svg.setAttribute('tabindex', '0');
  quickInsert = initQuickInsert(stage, { onShape(kind, x, y, props) { const el = addKindAt(kind, x, y, props); if (kind === 'text') editText(el.id); }, onLine: setLineTool });
  svg.addEventListener('pointerdown', onDown);
  svg.addEventListener('pointermove', onHover);
  svg.addEventListener('dblclick', onDbl);
  svg.addEventListener('wheel', onWheel, { passive: false });
  svg.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', e => { if (e.code === 'Space') { spaceDown = false; svg.style.cursor = view.placing ? 'crosshair' : view.tool === 'hand' ? 'grab' : ''; } });
  window.addEventListener('resize', () => applyCamera());
  window.addEventListener('blur', onUp);
  window.addEventListener('themechange', () => { render(); placeTextEd(); });
  textEd.addEventListener('blur', commitText);
  textEd.addEventListener('keydown', e => { if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) { e.preventDefault(); textEd.blur(); } e.stopPropagation(); });
  textEd.addEventListener('input', placeTextEd);
  onChange(what => { if (what === 'doc') { quickInsert.close(); stopEdgeTracking(); nodes.clear(); content.innerHTML = ''; fitPage(); } render(); });
  onFontsChanged(() => { nodes.clear(); content.innerHTML = ''; render(); });
  onKindsChanged(() => { nodes.clear(); content.innerHTML = ''; render(); });
  initMinimap(stage, { cam, view, applyCamera, onViewChanged, beforeNavigate: stopEdgeTracking });
}

// ---------- camera ----------
export function applyCamera() {
  quickInsert?.close();
  world.setAttribute('transform', `matrix(${cam.z},0,0,${cam.z},${-cam.x * cam.z},${-cam.y * cam.z})`);
  const zb = stage.querySelector('#zoomBadge'); if (zb) zb.textContent = Math.round(cam.z * 100) + '%';
  const fit = document.getElementById('zoomFit'); if (fit) fit.textContent = Math.round(cam.z * 100) + '%';
  drawOverlay(); placeTextEd(); viewChanged();
}
export function fitPage(pad = 40) {
  stopEdgeTracking();
  if (!state.doc || !stage) return;
  const r = stage.getBoundingClientRect(); if (!r.width) return;
  const p = state.doc.page;
  const b = unionBounds([{ x: 0, y: 0, w: p.w, h: p.h }, ...state.doc.elements.filter(e => e.kind !== 'connector').map(e => bounds(e, state.doc))]) || { x: 0, y: 0, w: p.w, h: p.h };
  cam.z = Math.min((r.width - pad * 2) / b.w, (r.height - pad * 2) / b.h, 4);
  cam.x = b.x - (r.width / cam.z - b.w) / 2; cam.y = b.y - (r.height / cam.z - b.h) / 2;
  applyCamera();
}
export function zoomBy(f, sx, sy) {
  stopEdgeTracking();
  const r = svg.getBoundingClientRect();
  if (sx == null) { sx = r.width / 2; sy = r.height / 2; }
  const wx = sx / cam.z + cam.x, wy = sy / cam.z + cam.y;
  cam.z = Math.max(0.05, Math.min(16, cam.z * f));
  cam.x = wx - sx / cam.z; cam.y = wy - sy / cam.z; applyCamera();
}
// ---------- AI feedback: fade-in, flashes and animated moves ----------
const FLASH_MS = 1100, flashes = new Map(), appearing = new Set();
let flashFrame = 0, animFrame = 0;
export function flash(ids, tone = 'change') {
  const now = performance.now();
  for (const id of ids) { flashes.set(id, { t0: now, tone }); if (tone === 'add' && !nodes.has(id)) appearing.add(id); }
  if (!flashFrame) flashFrame = requestAnimationFrame(flashTick);
}
function flashTick(now) {
  flashFrame = 0;
  for (const [id, f] of flashes) if (now - f.t0 > FLASH_MS) flashes.delete(id);
  drawOverlay(); if (flashes.size) flashFrame = requestAnimationFrame(flashTick);
}
// Move elements to new boxes over a short ease-out, then call done.
let animDone = null;
export function animateTo(targets, ms = 240, done) {
  cancelAnimationFrame(animFrame); animDone?.(); animDone = done;
  const doc = state.doc, from = new Map();
  for (const [id] of targets) { const el = doc.byId.get(id); if (el) from.set(id, { x: el.x, y: el.y, w: el.w, h: el.h }); }
  const apply = k => { for (const [id, f] of from) { const el = doc.byId.get(id), t = targets.get(id); if (!el) continue; for (const p of ['x', 'y', 'w', 'h']) el[p] = f[p] + (t[p] - f[p]) * k; } emit('move'); };
  // hidden tabs get no animation frames: jump straight to the end so the AI flow never waits
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !ms || document.hidden) { animDone = null; apply(1); done?.(); return; }
  const t0 = performance.now();
  const tick = now => {
    if (state.doc !== doc) { animDone = null; done?.(); return; }
    const t = Math.min(1, (now - t0) / ms); apply(1 - (1 - t) ** 3);
    if (t < 1) animFrame = requestAnimationFrame(tick); else { animDone = null; done?.(); }
  };
  animFrame = requestAnimationFrame(tick);
}

// Glide the camera so a world box sits in the visible area (left of `right` px, e.g. a side panel).
let panFrame = 0;
export function panTo(b, { right = 0, pad = 80 } = {}) {
  stopEdgeTracking(); cancelAnimationFrame(panFrame);
  const r = svg.getBoundingClientRect(), vw = r.width - right; if (!vw || !b) return;
  const z = Math.min(cam.z, (vw - pad * 2) / Math.max(b.w, 1), (r.height - pad * 2) / Math.max(b.h, 1));
  const from = { ...cam }, to = { z: Math.max(0.05, z) };
  to.x = b.x + b.w / 2 - vw / 2 / to.z; to.y = b.y + b.h / 2 - r.height / 2 / to.z;
  const t0 = performance.now(), ease = t => t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
  const tick = now => {
    const t = Math.min(1, (now - t0) / 420), k = ease(t);
    for (const p of ['x', 'y', 'z']) cam[p] = from[p] + (to[p] - from[p]) * k;
    applyCamera(); if (t < 1) panFrame = requestAnimationFrame(tick);
  };
  panFrame = requestAnimationFrame(tick);
}
const toW = e => { const r = svg.getBoundingClientRect(); return [(e.clientX - r.left) / cam.z + cam.x, (e.clientY - r.top) / cam.z + cam.y]; };
export function viewCenter() { const r = svg.getBoundingClientRect(); return [cam.x + r.width / cam.z / 2, cam.y + r.height / cam.z / 2]; }

// ---------- rendering ----------
const keyReplacer = (k, v) => (k === 'src' && typeof v === 'string' && v.length > 64) ? v.length + v.slice(-24) : v;
function keyOf(el, doc) {
  let k = JSON.stringify(el, keyReplacer);
  if (el.kind === 'connector') for (const end of [el.from, el.to]) { const t = end && end.id && doc.byId.get(end.id); if (t) k += `|${t.x},${t.y},${t.w},${t.h},${t.rot},${t.kind},${JSON.stringify(t.params)}`; }
  return k;
}
let editingId = null;
export function render() {
  if (!state.doc || !content) return;
  indexDoc(state.doc);
  const doc = displayDoc(state.doc, view.mode === 'diagram');
  pageLayer.innerHTML = pageSvg(doc);
  const seen = new Set(); let prev = null;
  for (const el of doc.elements) {
    seen.add(el.id);
    let n = nodes.get(el.id);
    const key = keyOf(el, doc) + (editingId === el.id ? '#edit' : '');
    if (!n) { const g = document.createElementNS(NS, 'g'); g.dataset.id = el.id; n = { g, key: null }; nodes.set(el.id, n); if (appearing.delete(el.id)) g.classList.add('el-appear'); }
    if (n.key !== key) {
      const shown = editingId === el.id ? { ...el, text: { ...el.text, content: '' } } : el;
      n.g.innerHTML = elementSvg(shown, doc, { hit: true }); n.key = key;
    }
    const want = prev ? prev.nextSibling : content.firstChild;
    if (want !== n.g) content.insertBefore(n.g, want);
    prev = n.g;
  }
  for (const [id, n] of nodes) if (!seen.has(id)) { n.g.remove(); nodes.delete(id); }
  // source overlay
  if (doc.source && view.mode !== 'diagram') {
    sourceImg.style.display = ''; sourceImg.setAttribute('href', doc.source.src);
    sourceImg.setAttribute('width', doc.page.w); sourceImg.setAttribute('height', doc.page.h);
    sourceImg.setAttribute('opacity', view.mode === 'source' ? 1 : view.blend);
    world.insertBefore(sourceImg, overlay);
  } else sourceImg.style.display = 'none';
  drawOverlay();
}
export function setViewMode(mode, blend = view.blend) { view.mode = mode; view.blend = blend; render(); viewChanged(); }

// ---------- overlay: selection, handles, hover dots, guides ----------
let hoverId = null, guides = [], marquee = null, connectTarget = null, ghost = null, dropTarget = null;
const HS = () => 8 / cam.z;
function drawOverlay() {
  if (!overlay || !state.doc) return;
  const doc = state.doc, z = cam.z, sw = 1.5 / z;
  let o = '';
  const sel = selected();
  for (const el of sel) {
    if (el.kind === 'connector') {
      const g = connectorPoints(el, doc);
      o += `<path d="M${g.pts.map(p => p.join(',')).join(' L')}" fill="none" stroke="#4f7cff" stroke-width="${sw}" stroke-dasharray="${4 / z} ${3 / z}"/>`;
      o += handle('c-from', g.start[0], g.start[1], 'end'); o += handle('c-to', g.end[0], g.end[1], 'end');
      (el.points || []).forEach((p, i) => { o += handle('c-pt-' + i, p.x, p.y, 'pt'); });
      if (!(el.points || []).length) o += handle('c-mid', g.mid[0], g.mid[1], 'mid');
      continue;
    }
    const c = [[0, 0], [el.w, 0], [el.w, el.h], [0, el.h]].map(([x, y]) => toWorld(el, x, y));
    o += `<polygon points="${c.map(p => p.join(',')).join(' ')}" fill="none" stroke="#4f7cff" stroke-width="${sw}"/>`;
  }
  if (sel.length === 1 && sel[0].kind !== 'connector' && !view.locked) {
    const el = sel[0];
    for (const [h, lx, ly] of HANDLES) { const [x, y] = toWorld(el, lx * el.w, ly * el.h); o += handle('r-' + h, x, y, 'resize'); }
    const [rx, ry] = toWorld(el, el.w / 2, -24 / z); o += handle('rot', rx, ry, 'rot');
  } else if (sel.filter(e => e.kind !== 'connector').length > 1) {
    const b = unionBounds(sel.map(e => bounds(e, doc)));
    o += `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="none" stroke="#4f7cff" stroke-width="${sw}" stroke-dasharray="${5 / z} ${4 / z}"/>`;
    for (const [h, lx, ly] of HANDLES) o += handle('m-' + h, b.x + lx * b.w, b.y + ly * b.h, 'resize');
  }
  // connection dots on hover / connect target
  const dotsFor = connectTarget || (hoverId && !drag ? doc.byId.get(hoverId) : null);
  if (dotsFor && dotsFor.kind !== 'connector' && !view.locked && (!drag || drag.type === 'connect' || drag.type === 'cend')) {
    if (connectTarget) { const c = [[0, 0], [dotsFor.w, 0], [dotsFor.w, dotsFor.h], [0, dotsFor.h]].map(([x, y]) => toWorld(dotsFor, x, y)); o += `<polygon points="${c.map(p => p.join(',')).join(' ')}" fill="rgba(79,124,255,0.07)" stroke="#4f7cff" stroke-width="${2 / z}"/>`; }
    for (const [ax, ay] of DOTS) { const p = endpoint({ id: dotsFor.id, ax, ay }, doc); o += `<circle data-h="dot-${ax}-${ay}" data-el="${dotsFor.id}" cx="${p.x}" cy="${p.y}" r="${5 / z}" fill="#fff" stroke="#4f7cff" stroke-width="${1.6 / z}" class="dot"/>`; }
  }
  // hovering a grouped element outlines its whole group
  const hov = hoverId && !drag && doc.byId.get(hoverId);
  if (hov && hov.group && !state.selection.has(hov.id)) { const b = unionBounds(groupOf(hov).map(e => bounds(e, doc))); o += `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="none" stroke="#4f7cff" stroke-opacity=".55" stroke-width="${sw}" stroke-dasharray="${5 / z} ${4 / z}"/>`; }
  // while moving: faint outlines on what is carried along, and the box it will land in
  if (drag?.type === 'move' && drag.moved) {
    for (const c of drag.orig) { if (state.selection.has(c.id) || c.kind === 'connector') continue; const el = doc.byId.get(c.id); if (!el) continue; const b = bounds(el, doc); o += `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="none" stroke="#4f7cff" stroke-opacity=".35" stroke-width="${1 / z}"/>`; }
    if (dropTarget) { const c = [[0, 0], [dropTarget.w, 0], [dropTarget.w, dropTarget.h], [0, dropTarget.h]].map(([x, y]) => toWorld(dropTarget, x, y)); o += `<polygon points="${c.map(p => p.join(',')).join(' ')}" fill="rgba(79,124,255,0.06)" stroke="#4f7cff" stroke-width="${2 / z}"/>`; }
  }
  for (const g of guides) o += `<path d="M${g[0]},${g[1]} L${g[2]},${g[3]}" stroke="#ff4fa3" stroke-width="${1 / z}"/>`;
  if (marquee) o += `<rect x="${Math.min(marquee[0], marquee[2])}" y="${Math.min(marquee[1], marquee[3])}" width="${Math.abs(marquee[2] - marquee[0])}" height="${Math.abs(marquee[3] - marquee[1])}" fill="rgba(79,124,255,0.08)" stroke="#4f7cff" stroke-width="${sw}"/>`;
  if (ghost) o += ghost;
  // what the AI just added (green) or changed (blue): a ring that widens and fades
  const now = performance.now();
  for (const [id, f] of flashes) {
    const el = doc.byId.get(id); if (!el) continue;
    const p = Math.min(1, (now - f.t0) / FLASH_MS), col = f.tone === 'add' ? '#16a34a' : '#4f6bff', op = (1 - p) * (1 - p);
    if (el.kind === 'connector') { const g = connectorPoints(el, doc); o += `<path d="M${g.pts.map(q => q.join(',')).join(' L')}" fill="none" stroke="${col}" stroke-opacity="${op * .45}" stroke-width="${(6 + 6 * p) / z}" stroke-linecap="round" stroke-linejoin="round"/>`; continue; }
    const b = bounds(el, doc), pad = (3 + 9 * p) / z;
    o += `<rect x="${b.x - pad}" y="${b.y - pad}" width="${b.w + pad * 2}" height="${b.h + pad * 2}" rx="${8 / z}" fill="${col}" fill-opacity="${op * .1}" stroke="${col}" stroke-opacity="${op}" stroke-width="${2 / z}"/>`;
  }
  overlay.innerHTML = o;
}
const HANDLES = [['nw', 0, 0], ['n', 0.5, 0], ['ne', 1, 0], ['e', 1, 0.5], ['se', 1, 1], ['s', 0.5, 1], ['sw', 0, 1], ['w', 0, 0.5]];
const DOTS = [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]];
function handle(id, x, y, type) {
  const s = HS();
  if (type === 'resize') return `<rect data-h="${id}" x="${x - s / 2}" y="${y - s / 2}" width="${s}" height="${s}" rx="${1.5 / cam.z}" fill="#fff" stroke="#4f7cff" stroke-width="${1.5 / cam.z}" style="cursor:${cursorFor(id)}"/>`;
  if (type === 'rot') return `<circle data-h="${id}" cx="${x}" cy="${y}" r="${s * 0.6}" fill="#fff" stroke="#4f7cff" stroke-width="${1.5 / cam.z}" style="cursor:grab"/>`;
  if (type === 'mid') return `<circle data-h="${id}" cx="${x}" cy="${y}" r="${s * 0.55}" fill="#4f7cff" stroke="#fff" stroke-width="${1.5 / cam.z}" style="cursor:move"/>`;
  return `<circle data-h="${id}" cx="${x}" cy="${y}" r="${s * 0.65}" fill="#fff" stroke="#4f7cff" stroke-width="${2 / cam.z}" style="cursor:move"/>`;
}
const cursorFor = id => ({ 'n': 'ns-resize', 's': 'ns-resize', 'e': 'ew-resize', 'w': 'ew-resize', 'nw': 'nwse-resize', 'se': 'nwse-resize', 'ne': 'nesw-resize', 'sw': 'nesw-resize' })[id.slice(2)] || 'pointer';

// ---------- pointer ----------
let drag = null, spaceDown = false;
function hitElement(e) {
  const g = e.target.closest && e.target.closest('#content > g[data-id]');
  return g ? state.doc.byId.get(g.dataset.id) : null;
}
// element under a world point (topmost), excluding ids
function elementAt(x, y, exclude = new Set()) {
  const els = state.doc.elements;
  for (let i = els.length - 1; i >= 0; i--) {
    const el = els[i]; if (exclude.has(el.id) || el.kind === 'connector' || el.hidden) continue;
    const [lx, ly] = toLocal(el, x, y);
    if (lx >= -4 && ly >= -4 && lx <= el.w + 4 && ly <= el.h + 4) return el;
  }
  return null;
}

function onDown(e) {
  if (textEd && !textEd.hidden) textEd.blur();
  svg.setPointerCapture(e.pointerId);
  const [wx, wy] = toW(e);
  if (e.button === 1 || spaceDown || view.tool === 'hand') { drag = { type: 'pan', sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y }; svg.style.cursor = 'grabbing'; return bind(); }
  if (view.placing) { e.preventDefault(); placeKind(view.placing, wx, wy, e); return; }
  if (view.locked) { drag = { type: 'pan', sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y }; return bind(); }
  const h = e.target.dataset && e.target.dataset.h;
  if (h) {
    const sel = selected();
    if (h.startsWith('dot-')) {
      const [, ax, ay] = h.split('-'); const elId = e.target.dataset.el;
      beginChange();
      drag = { type: 'connect', from: { id: elId, ax: +ax, ay: +ay }, sx: wx, sy: wy, moved: false };
      return bind();
    }
    if (h.startsWith('r-')) { beginChange(); drag = { type: 'resize', h: h.slice(2), el: sel[0], orig: clone(sel[0]), sx: wx, sy: wy }; return bind(); }
    if (h.startsWith('m-')) { beginChange(); const b = unionBounds(sel.map(x => bounds(x, state.doc))); drag = { type: 'mresize', h: h.slice(2), b, orig: sel.map(clone), sx: wx, sy: wy }; return bind(); }
    if (h === 'rot') { beginChange(); drag = { type: 'rotate', el: sel[0], orig: clone(sel[0]) }; return bind(); }
    if (h === 'c-from' || h === 'c-to') { beginChange(); drag = { type: 'cend', el: sel[0], end: h === 'c-from' ? 'from' : 'to' }; return bind(); }
    if (h.startsWith('c-pt-')) { beginChange(); drag = { type: 'cpt', el: sel[0], i: +h.slice(5) }; return bind(); }
    if (h === 'c-mid') {
      beginChange(); const c = sel[0];
      if (c.route === 'elbow') { const g = connectorPoints(c, state.doc); drag = { type: 'elbow', el: c, horiz: isMidVertical(g) }; }
      else { c.points = [{ x: wx, y: wy }]; drag = { type: 'cpt', el: c, i: 0 }; }
      return bind();
    }
  }
  const el = hitElement(e) || pickAt(wx, wy);
  // With several things selected, grabbing anywhere inside their bounds moves them all.
  const multi = state.selection.size > 1 && !(e.shiftKey || e.metaKey || e.ctrlKey);
  if (multi && (!el || state.selection.has(el.id) || insideSelection(wx, wy))) {
    // a click (no drag) on a member of the selected group selects just that member
    startMove(wx, wy, e.altKey, { drill: el && el.group && state.selection.has(el.id) && isWholeGroup() ? el.id : null });
    return bind();
  }
  if (el) {
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      const members = groupOf(el).map(m => m.id), on = !state.selection.has(el.id);
      for (const id of members) on ? state.selection.add(id) : state.selection.delete(id);
      emit('selection'); drag = null; return;
    }
    // Pressing the body of an unselected box that holds other elements starts a rubber band,
    // so items sitting on a background can be selected; a click still selects the box.
    if (!state.selection.has(el.id) && !e.altKey && encloses(el) && !inGrabZone(el, wx, wy)) {
      clearSelection();
      drag = { type: 'marquee', sx: wx, sy: wy, add: false, pick: el.id, csx: e.clientX, csy: e.clientY };
      return bind();
    }
    const wasOnlySelected = state.selection.size === 1 && state.selection.has(el.id);
    if (!state.selection.has(el.id)) select(groupOf(el).map(m => m.id));
    startMove(wx, wy, e.altKey, { clickEdit: wasOnlySelected && !e.altKey && el.kind !== 'connector' ? el.id : null });
    return bind();
  }
  if (!e.shiftKey) clearSelection();
  drag = { type: 'marquee', sx: wx, sy: wy, add: e.shiftKey };
  bind();
}
// Move the selection and whatever its enclosures carry; Alt-drag moves a copy of both.
function startMove(wx, wy, copy, extra = {}) {
  beginChange();
  if (copy) duplicateSelection(0, true);
  const moving = movingSet();
  // laid-out routes stop fitting once only one end moves: switch those links to automatic elbows
  const ids = new Set(moving.map(e => e.id));
  for (const c of state.doc.elements) if (c.st === 'edge' && c.points && ids.has(c.from.id) !== ids.has(c.to.id)) { delete c.points; c.route = 'elbow'; c.from = { id: c.from.id }; c.to = { id: c.to.id }; }
  drag = { type: 'move', sx: wx, sy: wy, orig: moving.map(clone), moved: false, home: enclosureFor(moving), carried: moving.length - state.selection.size, ...extra };
}
// Topmost element under a world point: shapes by box, connectors by distance to the line.
function pickAt(wx, wy) {
  const els = state.doc.elements, tol = 7 / cam.z;
  for (let i = els.length - 1; i >= 0; i--) {
    const el = els[i]; if (el.hidden) continue;
    if (el.kind === 'connector') { if (distToPoly(connectorPoints(el, state.doc).pts, wx, wy) <= tol) return el; continue; }
    const [lx, ly] = toLocal(el, wx, wy);
    if (lx >= 0 && ly >= 0 && lx <= el.w && ly <= el.h) return el;
  }
  return null;
}
function insideSelection(wx, wy) {
  const b = unionBounds(selected().map(x => bounds(x, state.doc)));
  return b && wx >= b.x && wy >= b.y && wx <= b.x + b.w && wy <= b.y + b.h;
}
// ---------- groups and enclosures ----------
// Elements sharing a `group` id select and move together. A shape that fully encloses
// elements drawn above it (a container, lane, frame or a plain background box) carries them.
const groupOf = el => el.group ? state.doc.elements.filter(e => e.group === el.group) : [el];
const withGroups = ids => { const out = new Set(ids); for (const id of ids) { const el = state.doc.byId.get(id); if (el?.group) for (const m of groupOf(el)) out.add(m.id); } return out; };
const within = (o, i, pad = 1) => i.x >= o.x - pad && i.y >= o.y - pad && i.x + i.w <= o.x + o.w + pad && i.y + i.h <= o.y + o.h + pad;
const canEnclose = el => el.kind !== 'connector' && el.kind !== 'text' && !el.hidden;
// Ids of elements carried by the given shapes, nested enclosures included.
function contentsOf(list) {
  const els = state.doc.elements, doc = state.doc, out = new Set();
  const moving = new Set(list.map(e => e.id));
  const idx = new Map(els.map((e, i) => [e.id, i]));
  const queue = list.filter(canEnclose);
  while (queue.length) {
    const box = queue.shift(), b = bounds(box, doc), area = b.w * b.h;
    for (let i = idx.get(box.id) + 1; i < els.length; i++) {
      const e = els[i]; if (e.hidden || moving.has(e.id) || out.has(e.id)) continue;
      const eb = bounds(e, doc);
      if (e.kind === 'connector') { if ([e.from, e.to].every(p => !p.id || moving.has(p.id) || out.has(p.id)) && within(b, eb)) out.add(e.id); continue; }
      if (eb.w * eb.h < area * 0.98 && within(b, eb)) { out.add(e.id); if (canEnclose(e)) queue.push(e); }
    }
  }
  return out;
}
const encloses = el => canEnclose(el) && contentsOf([el]).size > 0;
// Where an enclosure can be grabbed without first selecting it: its rim, or a container's header.
function inGrabZone(el, wx, wy) {
  const [lx, ly] = toLocal(el, wx, wy), m = 10 / cam.z;
  if (Math.min(lx, ly, el.w - lx, el.h - ly) < m) return true;
  const kind = getKind(el.kind);
  if (kind?.category !== 'containers') return false;
  const tb = textBox(el, kind, scopeFor(el, kind));
  return lx >= tb.x && ly >= tb.y && lx <= tb.x + tb.w && ly <= tb.y + tb.h;
}
// Selection plus everything its enclosures carry.
function movingSet() { const sel = selected(); const c = contentsOf(sel); return [...sel, ...[...c].map(id => state.doc.byId.get(id))]; }
// The topmost enclosure (not being moved) that fully contains the moving shapes.
function enclosureFor(moving) {
  const shapes = moving.filter(e => e.kind !== 'connector'); if (!shapes.length) return null;
  const ids = new Set(moving.map(e => e.id)), b = unionBounds(shapes.map(e => bounds(e, state.doc)));
  const els = state.doc.elements;
  for (let i = els.length - 1; i >= 0; i--) { const e = els[i]; if (ids.has(e.id) || !canEnclose(e)) continue; const eb = bounds(e, state.doc); if (eb.w * eb.h > b.w * b.h * 1.05 && within(eb, b, 0)) return e; }
  return null;
}
// After a drop, shapes that landed inside an enclosure drawn above them move up to just above it.
function liftInto(target, moving) {
  if (!target) return;
  const els = state.doc.elements, ids = new Set(moving.map(e => e.id)), at = els.indexOf(target);
  const below = els.filter((e, i) => i < at && ids.has(e.id)); if (!below.length) return;
  const lift = new Set(below.map(e => e.id)), rest = els.filter(e => !lift.has(e.id));
  rest.splice(rest.indexOf(target) + 1, 0, ...below);
  state.doc.elements = rest;
}
export function groupSelection() {
  const sel = selected(); if (sel.length < 2) return;
  const g = uid('g'); change(() => { for (const el of sel) el.group = g; }); emit('selection');
}
export function ungroupSelection() {
  const sel = selected().filter(el => el.group); if (!sel.length) return;
  change(() => { for (const el of sel) delete el.group; }); emit('selection');
}
// Copies get fresh group ids, so they form their own groups.
function regroup(list) { const m = new Map(); for (const n of list) if (n.group) { if (!m.has(n.group)) m.set(n.group, uid('g')); n.group = m.get(n.group); } return list; }
const isWholeGroup = () => { const sel = selected(); return sel.length > 1 && sel[0].group && sel.every(e => e.group === sel[0].group) && groupOf(sel[0]).length === sel.length; };
export const selectionGroupState = () => { const sel = selected(); return { canGroup: sel.length > 1 && !isWholeGroup(), canUngroup: sel.some(e => e.group) }; };

const isMidVertical = g => { const p = g.pts; const i = Math.floor((p.length - 1) / 2); const a = p[i], b = p[i + 1] || a; return Math.abs(a[0] - b[0]) < 0.5; };

function bind() {
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerup', onUp);
  svg.addEventListener('pointercancel', onUp);
  svg.addEventListener('lostpointercapture', onUp);
}

// Keep a drag moving in world coordinates while the camera follows an edge push.
const EDGE_MODES = new Set(['move', 'resize', 'mresize', 'connect', 'cend', 'cpt', 'elbow']);
let edgeFrame = 0, edgePointer = null, edgeSince = 0, edgeLast = 0, edgeZoom = 1;
function stopEdgeTracking() {
  cancelAnimationFrame(edgeFrame);
  edgeFrame = 0; edgePointer = null; edgeSince = 0; edgeLast = 0;
}
function trackEdge(e) {
  if (!EDGE_MODES.has(drag.type)) return;
  edgePointer = { clientX: e.clientX, clientY: e.clientY, shiftKey: e.shiftKey, altKey: e.altKey };
  if (!edgeFrame) edgeFrame = requestAnimationFrame(edgeTick);
}
function edgeTick(now) {
  edgeFrame = 0;
  if (!drag || !edgePointer || !EDGE_MODES.has(drag.type) || ((drag.type === 'move' || drag.type === 'connect') && !drag.moved)) return stopEdgeTracking();
  const r = svg.getBoundingClientRect();
  if (!r.width || !r.height || document.hidden) return stopEdgeTracking();
  const x = edgePointer.clientX - r.left, y = edgePointer.clientY - r.top;
  const margin = Math.min(56, r.width / 4, r.height / 4);
  const push = (v, size) => Math.max(-1.5, Math.min(1.5, v < margin ? (v - margin) / margin : v > size - margin ? (v - size + margin) / margin : 0));
  const fx = push(x, r.width), fy = push(y, r.height);
  if (!fx && !fy) return stopEdgeTracking();
  if (!edgeSince) { edgeSince = now; edgeZoom = cam.z; }
  const dt = Math.min(32, edgeLast ? now - edgeLast : 16) / 1000; edgeLast = now;
  cam.x += fx * 650 * dt / cam.z; cam.y += fy * 650 * dt / cam.z;
  // Zoom around the grab point, so the element stays under the pointer.
  if (now - edgeSince > 500) {
    const wx = cam.x + x / cam.z, wy = cam.y + y / cam.z;
    cam.z = Math.max(0.05, edgeZoom * 0.6, cam.z * Math.exp(-0.35 * dt));
    cam.x = wx - x / cam.z; cam.y = wy - y / cam.z;
  }
  applyCamera();
  onMove(edgePointer, true);
  edgeFrame = requestAnimationFrame(edgeTick);
}

function onMove(e, fromEdge = false) {
  if (!drag) return;
  if (!fromEdge) trackEdge(e);
  const [wx, wy] = toW(e); const doc = state.doc;
  switch (drag.type) {
    case 'pan': cam.x = drag.cx - (e.clientX - drag.sx) / cam.z; cam.y = drag.cy - (e.clientY - drag.sy) / cam.z; applyCamera(); return;
    case 'marquee': marquee = [drag.sx, drag.sy, wx, wy]; drawOverlay(); return;
    case 'move': {
      let dx = wx - drag.sx, dy = wy - drag.sy;
      if (!drag.moved && Math.hypot(dx, dy) * cam.z < 3) return;
      drag.moved = true;
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      const ids = new Set(drag.orig.map(o => o.id));
      const shapes = drag.orig.filter(o => o.kind !== 'connector');
      if (view.snap && shapes.length && !e.altKey) { const b = unionBounds(shapes.map(o => bounds(o, doc))); [dx, dy] = snapMove(b, dx, dy, ids); } else guides = [];
      for (const o of drag.orig) {
        const el = doc.byId.get(o.id); if (!el) continue;
        if (el.kind === 'connector') {
          for (const k of ['from', 'to']) if (!o[k].id) el[k] = { x: o[k].x + dx, y: o[k].y + dy }; else if (!ids.has(o[k].id)) { /* attached to unselected: keep */ }
          if (o.points) el.points = o.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
        } else { el.x = o.x + dx; el.y = o.y + dy; }
      }
      // connectors between moved shapes carry their waypoints along
      for (const c of doc.elements) if (c.kind === 'connector' && !ids.has(c.id) && c.points && c.points.length && c.from.id && c.to.id && ids.has(c.from.id) && ids.has(c.to.id)) {
        if (!drag.cpts) drag.cpts = {}; if (!drag.cpts[c.id]) drag.cpts[c.id] = clone(c.points);
        c.points = drag.cpts[c.id].map(p => ({ x: p.x + dx, y: p.y + dy }));
      }
      const target = enclosureFor(drag.orig.map(o => doc.byId.get(o.id)).filter(Boolean));
      dropTarget = target && target !== drag.home ? target : null;
      emit('move'); return;
    }
    case 'resize': resizeOne(drag, wx, wy, e.shiftKey); emit('move'); return;
    case 'mresize': resizeMany(drag, wx, wy, e.shiftKey); emit('move'); return;
    case 'rotate': {
      const el = doc.byId.get(drag.el.id), cx = el.x + el.w / 2, cy = el.y + el.h / 2;
      let a = Math.atan2(wy - cy, wx - cx) * 180 / Math.PI + 90;
      if (!e.altKey) { const s = Math.round(a / 15) * 15; if (Math.abs(a - s) < 4 || e.shiftKey) a = s; }
      el.rot = Math.round(((a % 360) + 360) % 360 * 10) / 10; if (el.rot > 180) el.rot -= 360;
      emit('move'); return;
    }
    case 'connect': {
      if (!drag.moved && Math.hypot(wx - drag.sx, wy - drag.sy) * cam.z < 4) return;
      drag.moved = true;
      if (!drag.c) {
        const src = doc.byId.get(drag.from.id);
        drag.c = makeElement('connector', { from: drag.from, to: { x: wx, y: wy }, route: drag.standalone ? lineTool.route : lastRoute, end: drag.standalone ? lineTool.end : 'arrow', start: 'none', style: { stroke: src && src.style.stroke && src.style.stroke !== 'none' ? src.style.stroke : '#1f2328', strokeWidth: 2 } });
        delete drag.c.params; delete drag.c.text; delete drag.c.x; delete drag.c.y; delete drag.c.w; delete drag.c.h; delete drag.c.rot;
        doc.elements.push(drag.c); select(drag.c.id);
      }
      let tx = wx, ty = wy;
      if (drag.standalone && e.shiftKey) { const a = Math.round(Math.atan2(wy - drag.sy, wx - drag.sx) / (Math.PI / 4)) * Math.PI / 4, length = Math.hypot(wx - drag.sx, wy - drag.sy); tx = drag.sx + Math.cos(a) * length; ty = drag.sy + Math.sin(a) * length; }
      drag.c.to = attachAt(tx, ty, new Set([drag.from.id]));
      emit('move'); return;
    }
    case 'cend': { const c = doc.byId.get(drag.el.id); c[drag.end] = attachAt(wx, wy, new Set([c[drag.end === 'from' ? 'to' : 'from'].id])); emit('move'); return; }
    case 'cpt': { const c = doc.byId.get(drag.el.id); c.points[drag.i] = { x: wx, y: wy }; emit('move'); return; }
    case 'elbow': { const c = doc.byId.get(drag.el.id); c.elbowOffset = drag.horiz ? wx : wy; emit('move'); return; }
  }
}
let lastRoute = 'curved';

// Where a dragged connector end attaches: a dot (exact anchor), inside a shape (auto anchor) or free.
function attachAt(wx, wy, exclude) {
  const target = elementAt(wx, wy, exclude);
  connectTarget = target;
  if (!target) return { x: wx, y: wy };
  for (const [ax, ay] of DOTS) { const p = endpoint({ id: target.id, ax, ay }, state.doc); if (Math.hypot(p.x - wx, p.y - wy) * cam.z < 14) return { id: target.id, ax, ay }; }
  // near the border: precise anchor at that spot; deep inside: auto (side picks itself)
  const [lx, ly] = toLocal(target, wx, wy);
  const edge = Math.min(lx, ly, target.w - lx, target.h - ly) * cam.z;
  if (edge < 10) { const ax = Math.max(0, Math.min(1, lx / target.w)), ay = Math.max(0, Math.min(1, ly / target.h)); const snapA = v => v < 0.08 ? 0 : v > 0.92 ? 1 : v; const nx = Math.min(lx, target.w - lx) < Math.min(ly, target.h - ly); return nx ? { id: target.id, ax: lx < target.w / 2 ? 0 : 1, ay: snapA(ay) } : { id: target.id, ax: snapA(ax), ay: ly < target.h / 2 ? 0 : 1 }; }
  return { id: target.id };
}

function resizeOne(d, wx, wy, keepRatio) {
  const el = state.doc.byId.get(d.el.id), o = d.orig;
  const [lx, ly] = toLocal(o, wx, wy);
  let x0 = 0, y0 = 0, x1 = o.w, y1 = o.h; const h = d.h;
  if (h.includes('w')) x0 = Math.min(lx, o.w - 2); if (h.includes('e')) x1 = Math.max(lx, 2);
  if (h.includes('n')) y0 = Math.min(ly, o.h - 2); if (h.includes('s')) y1 = Math.max(ly, 2);
  let w = x1 - x0, hh = y1 - y0;
  if (keepRatio || (el.kind !== 'text' && getKind(el.kind)?.viewBox && getKind(el.kind)?.aspect === 'meet' && h.length === 2)) {
    const r = o.w / o.h;
    if (h.length === 2) { if (w / hh > r) w = hh * r; else hh = w / r; if (h.includes('w')) x0 = x1 - w; if (h.includes('n')) y0 = y1 - hh; }
  }
  // snap size to other elements' edges (unrotated only)
  if (view.snap && !o.rot) {
    const target = snapEdges(new Set([el.id]));
    guides = [];
    const S = 6 / cam.z;
    const sx = (v, axis) => { for (const t of target[axis]) if (Math.abs(t - v) < S) { guides.push(axis === 'x' ? [t, -1e5, t, 1e5] : [-1e5, t, 1e5, t]); return t; } return v; };
    if (h.includes('e')) x1 = sx(o.x + x0 + w, 'x') - o.x; if (h.includes('w')) x0 = sx(o.x + x0, 'x') - o.x;
    if (h.includes('s')) y1 = sx(o.y + y0 + hh, 'y') - o.y; if (h.includes('n')) y0 = sx(o.y + y0, 'y') - o.y;
    if (!keepRatio) { w = x1 - x0; hh = y1 - y0; }
  }
  // new box in local coords [x0..x0+w]; keep the opposite corner fixed in world space
  const cxl = x0 + w / 2, cyl = y0 + hh / 2;
  const [cwx, cwy] = toWorld(o, cxl, cyl);
  el.w = Math.max(2, w); el.h = Math.max(2, hh); el.x = cwx - el.w / 2; el.y = cwy - el.h / 2;
}
function resizeMany(d, wx, wy) {
  const b = d.b, h = d.h;
  let x0 = b.x, y0 = b.y, x1 = b.x + b.w, y1 = b.y + b.h;
  if (h.includes('w')) x0 = Math.min(wx, x1 - 4); if (h.includes('e')) x1 = Math.max(wx, x0 + 4);
  if (h.includes('n')) y0 = Math.min(wy, y1 - 4); if (h.includes('s')) y1 = Math.max(wy, y0 + 4);
  const sx = (x1 - x0) / b.w, sy = (y1 - y0) / b.h;
  for (const o of d.orig) {
    const el = state.doc.byId.get(o.id); if (!el) continue;
    if (el.kind === 'connector') { if (o.points) el.points = o.points.map(p => ({ x: x0 + (p.x - b.x) * sx, y: y0 + (p.y - b.y) * sy })); for (const k of ['from', 'to']) if (!o[k].id) el[k] = { x: x0 + (o[k].x - b.x) * sx, y: y0 + (o[k].y - b.y) * sy }; continue; }
    el.x = x0 + (o.x - b.x) * sx; el.y = y0 + (o.y - b.y) * sy; el.w = o.w * sx; el.h = o.h * sy;
  }
}

// snapping
function snapEdges(exclude) {
  const xs = [], ys = [];
  const p = state.doc.page; xs.push(0, p.w / 2, p.w); ys.push(0, p.h / 2, p.h);
  for (const el of state.doc.elements) {
    if (exclude.has(el.id) || el.kind === 'connector') continue;
    const b = bounds(el, state.doc); xs.push(b.x, b.x + b.w / 2, b.x + b.w); ys.push(b.y, b.y + b.h / 2, b.y + b.h);
  }
  return { x: xs, y: ys };
}
function snapMove(b, dx, dy, exclude) {
  const t = snapEdges(exclude), S = 6 / cam.z; guides = [];
  let bx = null, by = null;
  for (const v of [b.x + dx, b.x + b.w / 2 + dx, b.x + b.w + dx]) for (const s of t.x) if (Math.abs(s - v) < S && (bx == null || Math.abs(s - v) < Math.abs(bx))) bx = s - v;
  for (const v of [b.y + dy, b.y + b.h / 2 + dy, b.y + b.h + dy]) for (const s of t.y) if (Math.abs(s - v) < S && (by == null || Math.abs(s - v) < Math.abs(by))) by = s - v;
  if (bx != null) dx += bx; if (by != null) dy += by;
  const nb = { x: b.x + dx, y: b.y + dy, w: b.w, h: b.h };
  if (bx != null) for (const v of [nb.x, nb.x + nb.w / 2, nb.x + nb.w]) if (t.x.some(s => Math.abs(s - v) < 0.01)) guides.push([v, nb.y - 2000, v, nb.y + nb.h + 2000]);
  if (by != null) for (const v of [nb.y, nb.y + nb.h / 2, nb.y + nb.h]) if (t.y.some(s => Math.abs(s - v) < 0.01)) guides.push([nb.x - 2000, v, nb.x + nb.w + 2000, v]);
  return [dx, dy];
}

function onUp(e) {
  stopEdgeTracking();
  svg.removeEventListener('pointermove', onMove);
  svg.removeEventListener('pointerup', onUp);
  svg.removeEventListener('pointercancel', onUp);
  svg.removeEventListener('lostpointercapture', onUp);
  const cancelled = e.type !== 'pointerup';
  const d = drag; drag = null; guides = []; svg.style.cursor = spaceDown || view.tool === 'hand' ? 'grab' : view.placing ? 'crosshair' : '';
  if (!d) return;
  if (d.type === 'marquee') {
    // a press on a box's body that did not turn into a drag selects the box
    if (d.pick && !cancelled && (!marquee || Math.hypot(e.clientX - d.csx, e.clientY - d.csy) < 4)) { const el = state.doc.byId.get(d.pick); if (el) select(groupOf(el).map(m => m.id)); }
    else if (marquee && !cancelled) {
      const [x0, y0, x1, y1] = marquee, r = { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
      const ids = state.doc.elements.filter(el => !el.hidden && within(r, bounds(el, state.doc), 0)).map(el => el.id);
      select([...withGroups(ids)], d.add);
    }
    marquee = null; drawOverlay(); return;
  }
  if (d.type === 'connect') {
    connectTarget = null;
    if (d.standalone) {
      if (cancelled && d.c) state.doc.elements = state.doc.elements.filter(el => el.id !== d.c.id);
      setPlacing(null); endChange(); return;
    }
    if (!d.moved) { if (!cancelled) quickAdd(d.from); endChange(); return; }
    if (d.c) { lastRoute = d.c.route; if (!d.c.to.id) { /* free end: fine */ } }
    endChange(); return;
  }
  if (d.type === 'cend') connectTarget = null;
  if (d.type === 'pan') { drawOverlay(); return; }
  // hand-arranged: later AI edits keep these positions instead of laying everything out again
  if (['move', 'resize', 'mresize', 'rotate'].includes(d.type) && d.moved !== false && !cancelled && state.doc.elements.some(e => e.st)) state.doc.manualLayout = true;
  if (d.type === 'move') {
    if (d.moved && !cancelled) liftInto(dropTarget || enclosureFor(d.orig.map(o => state.doc.byId.get(o.id)).filter(Boolean)), d.orig.map(o => state.doc.byId.get(o.id)).filter(Boolean));
    dropTarget = null;
  }
  endChange();
  // a plain click on the shape that was already selected edits its text in place
  if (d.type === 'move' && !d.moved && !cancelled) { if (d.drill) select(d.drill); else if (d.clickEdit) editText(d.clickEdit); }
}

// Click on a dot: add a copy of the shape on that side, connected.
function quickAdd(from) {
  const src = state.doc.byId.get(from.id); if (!src) return;
  const gap = 80, dx = from.ax === 1 ? 1 : from.ax === 0 ? -1 : 0, dy = from.ay === 1 ? 1 : from.ay === 0 ? -1 : 0;
  const n = clone(src); n.id = uid(); n.text = { ...n.text, content: '' };
  n.x = src.x + dx * (src.w + gap); n.y = src.y + dy * (src.h + gap);
  const back = { 0: 1, 1: 0, 0.5: 0.5 };
  const c = { id: uid('c'), kind: 'connector', from: { ...from }, to: { id: n.id, ax: back[from.ax], ay: back[from.ay] }, route: lastRoute === 'curved' && (dx && dy) ? 'curved' : lastRoute, start: 'none', end: 'arrow', style: { stroke: src.style.stroke && src.style.stroke !== 'none' ? src.style.stroke : '#1f2328', strokeWidth: 2 } };
  state.doc.elements.push(n, c); select(n.id); emit();
  setTimeout(() => editText(n.id), 30);
}

function onHover(e) {
  if (drag) return;
  const el = hitElement(e);
  const id = el && el.kind !== 'connector' ? el.id : (e.target.dataset && e.target.dataset.el) || null;
  if (id !== hoverId) { hoverId = id; drawOverlay(); }
}

function onDbl(e) {
  if (view.locked || view.tool === 'hand' || view.placing) return;
  // The canvas holds pointer capture, so the event target is the canvas: hit-test by position.
  const [wx, wy] = toW(e);
  const el = pickAt(wx, wy);
  if (el) { if (!textEd.hidden && textEd.dataset.id === el.id) return; editText(el.id); return; }
  quickInsert.open(e.clientX, e.clientY, wx, wy);
}
const defaultFont = () => { const t = state.doc.elements.find(e => e.text && e.text.font); return t ? t.text.font : 'Inter'; };

function onWheel(e) {
  e.preventDefault();
  stopEdgeTracking();
  const r = svg.getBoundingClientRect();
  if (e.ctrlKey || e.metaKey) zoomBy(Math.exp(-e.deltaY * 0.0022), e.clientX - r.left, e.clientY - r.top);
  else { cam.x += e.deltaX / cam.z; cam.y += e.deltaY / cam.z; applyCamera(); }
}

// ---------- placing new elements ----------
export function setTool(tool) { quickInsert?.close(); view.tool = tool === 'hand' ? 'hand' : 'select'; view.placing = null; svg.style.cursor = view.tool === 'hand' ? 'grab' : ''; viewChanged(); }
export function setLineTool(route = 'straight', end = 'arrow') { lineTool = { route, end }; setPlacing('connector'); }
export function setPlacing(kindId) { view.placing = kindId; if (kindId) view.tool = 'select'; svg.style.cursor = kindId ? 'crosshair' : view.tool === 'hand' ? 'grab' : ''; viewChanged(); }
function placeKind(kindId, wx, wy, e) {
  if (kindId === 'connector') { beginChange(); drag = { type: 'connect', standalone: true, from: attachAt(wx, wy, new Set()), sx: wx, sy: wy, moved: false }; bind(); return; }
  const el = makeElement(kindId);
  el.x = wx - el.w / 2; el.y = wy - el.h / 2;
  if (kindId === 'text') { el.text = { ...el.text, content: '', font: defaultFont() }; }
  change(d => d.elements.push(el));
  select(el.id); setPlacing(null);
  if (kindId === 'text') editText(el.id);
}
export function addKindAt(kindId, wx, wy, props = {}) {
  const el = makeElement(kindId, props);
  if (wx == null) [wx, wy] = viewCenter();
  el.x = wx - el.w / 2; el.y = wy - el.h / 2;
  change(d => d.elements.push(el)); select(el.id);
  return el;
}
export function dropKind(kindId, clientX, clientY) {
  const r = svg.getBoundingClientRect();
  addKindAt(kindId, (clientX - r.left) / cam.z + cam.x, (clientY - r.top) / cam.z + cam.y);
}

// ---------- text editing ----------
export function editText(id) {
  const el = state.doc.byId.get(id); if (!el) return;
  if (el.kind === 'image') return;
  select(id);
  editingId = id; render();
  const t = el.kind === 'connector' ? { size: 14, ...el.text } : { ...(getKind(el.kind)?.text || {}), ...el.text };
  textEd.hidden = false; textEd.value = t.content || '';
  textEd.dataset.id = id;
  if (t.font) ensureFont(t.font);
  placeTextEd();
  textEd.focus(); textEd.select();
}
function placeTextEd() {
  if (!textEd || textEd.hidden) return;
  const doc = state.doc && displayDoc(state.doc, view.mode === 'diagram');
  const el = doc && doc.byId.get(textEd.dataset.id); if (!el) return;
  let box, t;
  if (el.kind === 'connector') {
    const g = connectorPoints(el, doc); t = { size: 14, color: el.style.stroke, align: 'center', ...el.text };
    box = { x: g.mid[0] - 100, y: g.mid[1] - 20, w: 200, h: 40 };
  } else {
    const kind = getKind(el.kind) || getKind('text'); const sc = scopeFor(el, kind); const tb = textBox(el, kind, sc);
    t = { ...(kind.text || {}), ...el.text };
    const pad = t.pad || 0;
    const p0 = [el.x + tb.x + pad, el.y + tb.y + pad];
    box = { x: p0[0], y: p0[1], w: tb.w - pad * 2, h: tb.h - pad * 2 };
    if (t.vertical) { const cx = box.x + box.w / 2, cy = box.y + box.h / 2; box = { x: cx - box.h / 2, y: cy - box.w / 2, w: box.h, h: box.w }; }
  }
  const r = svg.getBoundingClientRect(), sr = stage.getBoundingClientRect();
  const z = cam.z;
  t = fitText({ ...t, content: textEd.value, pad: 0 }, box);
  Object.assign(textEd.style, {
    left: (r.left - sr.left + (box.x - cam.x) * z) + 'px', top: (r.top - sr.top + (box.y - cam.y) * z) + 'px',
    width: Math.max(40, box.w * z) + 'px', minHeight: Math.max(20, box.h * z) + 'px',
    fontFamily: fontStack(t.font), fontSize: (t.size || 16) * z + 'px', fontWeight: t.weight || 400, fontStyle: t.italic ? 'italic' : 'normal',
    color: t.color || '#1f2328', textAlign: t.align || 'center', lineHeight: t.lineHeight || 1.25, letterSpacing: (t.letterSpacing || 0) * z + 'px',
    textTransform: t.upper ? 'uppercase' : 'none',
  });
  textEd.dataset.valign = t.valign || 'middle'; textEd.dataset.boxh = box.h * z;
  sizeTextEd();
}
function sizeTextEd() {
  textEd.style.height = 'auto'; textEd.style.paddingTop = '0px';
  const sh = textEd.scrollHeight, bh = +textEd.dataset.boxh || 0;
  const va = textEd.dataset.valign;
  if (sh < bh && va !== 'top') textEd.style.paddingTop = (va === 'bottom' ? bh - sh : (bh - sh) / 2) + 'px';
  textEd.style.height = Math.max(sh, bh) + 'px';
}
function commitText() {
  if (textEd.hidden) return;
  const id = textEd.dataset.id, v = textEd.value;
  textEd.hidden = true; editingId = null;
  const el = state.doc.byId.get(id);
  if (el) change(() => {
    el.text = { ...(el.text || {}), content: v };
    if (el.kind === 'text' && !v.trim()) state.doc.elements = state.doc.elements.filter(e => e.id !== id);
    if (el.kind === 'connector' && !v.trim()) delete el.text.content;
  });
  else render();
  svg.focus?.();
}

// ---------- commands ----------
export function deleteSelection() {
  const ids = state.selection; if (!ids.size) return;
  change(d => {
    d.elements = d.elements.filter(e => !ids.has(e.id));
    // connectors attached to removed shapes keep their last position as a free end
    for (const c of d.elements) if (c.kind === 'connector') for (const k of ['from', 'to']) if (c[k].id && ids.has(c[k].id)) { const p = endpoint(c[k], { ...d, byId: state.doc.byId }); c[k] = { x: p.x, y: p.y }; }
  });
  clearSelection();
}
let clipboard = null;
// Copies take what boxes hold along with them, in drawing order.
const withContents = () => { const ids = new Set(movingSet().map(e => e.id)); return state.doc.elements.filter(e => ids.has(e.id)); };
export function copySelection() { clipboard = withContents().map(clone); try { navigator.clipboard.writeText(JSON.stringify({ orim: 1, elements: clipboard })); } catch (_) {} }
export function paste(els = clipboard, offset = 24) {
  if (!els || !els.length) return;
  const map = new Map(els.map(e => [e.id, uid(e.kind === 'connector' ? 'c' : 'e')]));
  const out = els.map(e => {
    const n = clone(e); n.id = map.get(e.id);
    if (n.kind === 'connector') { for (const k of ['from', 'to']) { if (n[k].id) { if (map.has(n[k].id)) n[k].id = map.get(n[k].id); } else n[k] = { x: n[k].x + offset, y: n[k].y + offset }; } if (n.points) n.points = n.points.map(p => ({ x: p.x + offset, y: p.y + offset })); }
    else { n.x += offset; n.y += offset; }
    return n;
  });
  regroup(out);
  change(d => d.elements.push(...out));
  // select the pasted boxes, not what they hold
  const held = new Set(out.flatMap(e => [...contentsOf([state.doc.byId.get(e.id)])]));
  select(out.map(e => e.id).filter(id => !held.has(id)));
  clipboard = out.map(clone);
}
export function duplicateSelection(offset = 24, inPlace = false) {
  const picked = new Set(state.selection), els = withContents().map(clone);
  // include connectors between selected shapes
  const ids = new Set(els.map(e => e.id));
  for (const c of state.doc.elements) if (c.kind === 'connector' && !ids.has(c.id) && c.from.id && c.to.id && ids.has(c.from.id) && ids.has(c.to.id)) els.push(clone(c));
  const map = new Map(els.map(e => [e.id, uid()]));
  const out = els.map(e => { const n = clone(e); n.id = map.get(e.id); if (n.kind === 'connector') { for (const k of ['from', 'to']) if (n[k].id && map.has(n[k].id)) n[k].id = map.get(n[k].id); else if (!n[k].id) n[k] = { x: n[k].x + offset, y: n[k].y + offset }; if (n.points) n.points = n.points.map(p => ({ x: p.x + offset, y: p.y + offset })); } else { n.x += offset; n.y += offset; } return n; });
  regroup(out);
  // select the copies of what was selected; copied contents ride along inside their copied boxes
  const sel = out.filter((n, i) => picked.has(els[i].id)).map(e => e.id);
  if (inPlace) { state.doc.elements.push(...out); select(sel); return; }
  change(d => d.elements.push(...out)); select(sel);
}
export function reorder(where) {
  const ids = state.selection; if (!ids.size) return;
  change(d => {
    const sel = d.elements.filter(e => ids.has(e.id)), rest = d.elements.filter(e => !ids.has(e.id));
    if (where === 'front') d.elements = [...rest, ...sel];
    else if (where === 'back') d.elements = [...sel, ...rest];
    else {
      const arr = d.elements.slice(), step = where === 'forward' ? 1 : -1;
      const idxs = arr.map((e, i) => ids.has(e.id) ? i : -1).filter(i => i >= 0);
      if (step > 0) idxs.reverse();
      for (const i of idxs) { const j = i + step; if (j < 0 || j >= arr.length || ids.has(arr[j].id)) continue; [arr[i], arr[j]] = [arr[j], arr[i]]; }
      d.elements = arr;
    }
  });
}
export function align(how) {
  const els = selected().filter(e => e.kind !== 'connector'); if (els.length < 2) return;
  const b = unionBounds(els.map(e => bounds(e, state.doc)));
  change(() => {
    for (const el of els) {
      if (how === 'left') el.x = b.x; if (how === 'right') el.x = b.x + b.w - el.w; if (how === 'hcenter') el.x = b.x + (b.w - el.w) / 2;
      if (how === 'top') el.y = b.y; if (how === 'bottom') el.y = b.y + b.h - el.h; if (how === 'vcenter') el.y = b.y + (b.h - el.h) / 2;
    }
    if (how === 'hdist' || how === 'vdist') {
      const k = how === 'hdist' ? 'x' : 'y', s = how === 'hdist' ? 'w' : 'h';
      const sorted = els.slice().sort((a, c) => a[k] - c[k]);
      const total = sorted.reduce((t, e) => t + e[s], 0), gap = (b[s] - total) / (sorted.length - 1);
      let pos = b[k]; for (const e of sorted) { e[k] = pos; pos += e[s] + gap; }
    }
  });
}

function onKey(e) {
  if (e.defaultPrevented || !state.doc || document.getElementById('app').hidden || e.target.closest?.('dialog[open]')) return;
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
  if (['button', 'summary'].includes(tag) && (e.key === 'Enter' || e.code === 'Space' || e.key.startsWith('Arrow'))) return;
  const mod = e.metaKey || e.ctrlKey;
  if (e.code === 'Space' && !spaceDown) { spaceDown = true; svg.style.cursor = 'grab'; e.preventDefault(); return; }
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (view.locked) return;
  if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelection(); return; }
  if (mod && e.key.toLowerCase() === 'g') { e.preventDefault(); e.shiftKey ? ungroupSelection() : groupSelection(); return; }
  if (mod && e.key.toLowerCase() === 'c') { copySelection(); return; }
  if (mod && e.key.toLowerCase() === 'x') { copySelection(); deleteSelection(); return; }
  if (mod && e.key.toLowerCase() === 'v') { e.preventDefault(); paste(); return; }
  if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); select(state.doc.elements.map(x => x.id)); return; }
  if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomBy(1.2); return; }
  if (mod && e.key === '-') { e.preventDefault(); zoomBy(1 / 1.2); return; }
  if (mod && e.key === '0') { e.preventDefault(); fitPage(); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection(); return; }
  if (e.key === 'Escape') {
    if (drag?.standalone) onUp({ type: 'pointercancel' }); setTool('select');
    // from a member picked inside a group, Escape steps back out to the whole group
    const sel = selected(), g = sel[0]?.group;
    if (g && sel.every(x => x.group === g) && !isWholeGroup() && groupOf(sel[0]).length > 1) select(groupOf(sel[0]).map(x => x.id)); else clearSelection();
    return;
  }
  if (!mod && !e.altKey && !e.shiftKey && ['v', 'h'].includes(e.key.toLowerCase())) { e.preventDefault(); setTool(e.key.toLowerCase() === 'h' ? 'hand' : 'select'); return; }
  if (e.key === ']') { reorder(mod ? 'front' : 'forward'); return; }
  if (e.key === '[') { reorder(mod ? 'back' : 'backward'); return; }
  if (e.key === 'Enter' && state.selection.size === 1) { e.preventDefault(); editText([...state.selection][0]); return; }
  if (e.key.startsWith('Arrow') && state.selection.size) {
    e.preventDefault(); const s = e.shiftKey ? 10 : 1;
    const dx = e.key === 'ArrowLeft' ? -s : e.key === 'ArrowRight' ? s : 0, dy = e.key === 'ArrowUp' ? -s : e.key === 'ArrowDown' ? s : 0;
    change(() => { for (const el of movingSet()) { if (el.kind === 'connector') { for (const k of ['from', 'to']) if (!el[k].id) el[k] = { x: el[k].x + dx, y: el[k].y + dy }; if (el.points) el.points = el.points.map(p => ({ x: p.x + dx, y: p.y + dy })); } else { el.x += dx; el.y += dy; } } });
    return;
  }
  if (!mod && !e.altKey && e.key.length === 1 && state.selection.size === 1) {
    const id = [...state.selection][0]; const el = state.doc.byId.get(id);
    if (el && el.kind !== 'image') { editText(id); textEd.value = e.key; placeTextEd(); e.preventDefault(); }
    return;
  }
  const tools = { r: 'rect', o: 'ellipse', t: 'text', n: 'note', d: 'diamond' };
  if (!mod && tools[e.key]) setPlacing(tools[e.key]);
}

export function setLocked(v) { view.locked = v; drawOverlay(); viewChanged(); }
export const stageEl = () => stage;
