// Document state, selection, undo/redo and autosave.

import * as db from './db.js';
import { getKind, defaults, resolveKind } from './kinds.js';
import { indexDoc } from './render.js';

const listeners = new Set();
export const onChange = fn => listeners.add(fn);
export const state = { doc: null, selection: new Set(), dirty: false };
let undoStack = [], redoStack = [], saveTimer = 0;

export const uid = (p = 'e') => p + Math.random().toString(36).slice(2, 8);

export function newDoc({ name = 'Untitled', w = 1200, h = 800, background = '#ffffff', pattern = null } = {}) {
  return { id: uid('d'), name, created: Date.now(), updated: Date.now(), page: { w, h, background, pattern }, elements: [], source: null, history: [] };
}

const strip = d => { const { byId, ...rest } = d; return rest; };
export const serialize = d => JSON.stringify(strip(d));
export const clone = o => JSON.parse(JSON.stringify(o, (k, v) => k === 'byId' ? undefined : v));

export function setDoc(doc) {
  state.doc = indexDoc(doc); state.selection = new Set(); undoStack = []; redoStack = [];
  emit('doc');
}
export function emit(what = 'change') { if (state.doc) indexDoc(state.doc); listeners.forEach(f => f(what)); }

// Record the current state for undo, run fn, then notify and autosave.
export function change(fn, { silent } = {}) {
  const before = serialize(state.doc);
  fn(state.doc);
  const after = serialize(state.doc);
  if (before !== after) { undoStack.push(before); if (undoStack.length > 200) undoStack.shift(); redoStack = []; scheduleSave(); }
  if (!silent) emit();
}
// For drags: snapshot at start, commit at end.
let pending = null;
export const beginChange = () => { pending = serialize(state.doc); };
export function endChange() {
  if (pending == null) return;
  const after = serialize(state.doc);
  if (after !== pending) { undoStack.push(pending); redoStack = []; scheduleSave(); }
  pending = null; emit();
}
export function undo() { if (!undoStack.length) return; redoStack.push(serialize(state.doc)); restore(undoStack.pop()); }
export function redo() { if (!redoStack.length) return; undoStack.push(serialize(state.doc)); restore(redoStack.pop()); }
export const canUndo = () => undoStack.length > 0, canRedo = () => redoStack.length > 0;
function restore(s) {
  const sel = state.selection; state.doc = indexDoc(JSON.parse(s));
  state.selection = new Set([...sel].filter(id => state.doc.byId.has(id)));
  scheduleSave(); emit();
}

export function scheduleSave() { state.dirty = true; clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 500); }
export async function saveNow() {
  if (!state.doc) return;
  state.doc.updated = Date.now(); state.dirty = false;
  await db.put('docs', state.doc.id, strip(state.doc));
}
export const listDocs = async () => (await db.all('docs')).sort((a, b) => b.updated - a.updated);
export const loadDoc = id => db.get('docs', id);
export const deleteDoc = id => db.del('docs', id);
export const putDoc = d => db.put('docs', d.id, strip(d));

export const selected = () => [...state.selection].map(id => state.doc.byId.get(id)).filter(Boolean);
export function select(ids, add = false) {
  if (!add) state.selection = new Set();
  for (const id of [].concat(ids)) if (id) state.selection.add(id);
  emit('selection');
}
export function toggleSelect(id) { state.selection.has(id) ? state.selection.delete(id) : state.selection.add(id); emit('selection'); }
export function clearSelection() { if (state.selection.size) { state.selection = new Set(); emit('selection'); } }

// Create an element of a kind with defaults merged under the given props.
export function makeElement(kindId, props = {}) {
  const kind = getKind(kindId);
  const d = kind ? defaults(kind) : { params: {}, style: {}, text: {}, size: [160, 80] };
  // vendor icons come labelled with their product name, as in architecture diagrams
  if (kind?.pack && !props.text) props = { ...props, text: { content: kind.name } };
  return {
    id: uid(), kind: kindId, x: 0, y: 0, w: d.size[0], h: d.size[1], rot: 0,
    ...props,
    params: { ...d.params, ...(props.params || {}) },
    style: { ...d.style, ...(props.style || {}) },
    text: { ...d.text, ...(!['text', 'image', 'connector', 'line'].includes(kindId) && !kind?.pack && props.text?.size == null ? { autoSize: true } : {}), ...(props.text || {}) },
  };
}

// Normalise an element coming from the AI or a file: fill gaps, coerce numbers.
// Style classes: the AI may define looks once ({"card": {style, text, params}}) and give
// elements "cls": "card". Classes are expanded on arrival; elements keep the cls name so the
// scene can be compressed again when sent back to a model.
const SECTIONS = ['params', 'style', 'text'];
const clsList = el => [].concat(el.cls || []).filter(Boolean);
export function expandClasses(el, classes) {
  if (!classes || !el.cls) return el;
  const e = { ...el };
  for (const sec of SECTIONS) {
    let base = {};
    for (const c of clsList(el)) Object.assign(base, classes[c]?.[sec] || {});
    if (Object.keys(base).length || el[sec]) e[sec] = { ...base, ...(el[sec] || {}) };
  }
  if (e.kind == null) for (const c of clsList(el)) if (classes[c]?.kind) e.kind = classes[c].kind;
  return e;
}
export function stripClasses(el, classes) {
  if (!classes || !el.cls) return el;
  const e = { ...el };
  for (const sec of SECTIONS) {
    if (!e[sec]) continue;
    const base = {}; for (const c of clsList(el)) Object.assign(base, classes[c]?.[sec] || {});
    e[sec] = Object.fromEntries(Object.entries(e[sec]).filter(([k, v]) => JSON.stringify(base[k]) !== JSON.stringify(v)));
  }
  return e;
}

export function normalize(el, classes) {
  const e = expandClasses({ ...el }, classes);
  e.id = String(e.id || uid());
  if (e.kind === 'connector') {
    e.style = { stroke: '#1f2328', strokeWidth: 2, ...(e.style || {}) };
    e.route = e.route || 'straight';
    e.end = e.end ?? 'arrow'; e.start = e.start ?? 'none';
    for (const k of ['from', 'to']) { const p = e[k] || {}; e[k] = p.id ? { id: String(p.id), ...(p.float ? { float: true } : p.ax != null ? { ax: +p.ax, ay: +p.ay } : {}), ...(p.gap ? { gap: +p.gap } : {}) } : { x: +p.x || 0, y: +p.y || 0 }; }
    if (e.points) e.points = e.points.map(p => Array.isArray(p) ? { x: +p[0], y: +p[1] } : { x: +p.x, y: +p.y });
    return e;
  }
  e.kind = resolveKind(e.kind);
  for (const k of ['x', 'y', 'w', 'h', 'rot']) e[k] = +e[k] || 0;
  e.w = Math.max(1, e.w); e.h = Math.max(1, e.h);
  e.params = e.params || {}; e.style = e.style || {}; e.text = e.text || {};
  if (typeof e.text === 'string') e.text = { content: e.text };
  return e;
}
