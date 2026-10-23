// The growing library: built-in + learned kinds, lessons the agents wrote down, and templates.
//
// Bundled content is read from library/index.json (works on GitHub Pages). What the AI
// learns is kept in IndexedDB and, when a folder is connected (File System Access API),
// also written into that folder's library/ so committing it publishes it with the site.

import * as db from './db.js';
import { registerKinds, registerKind, getKind } from './kinds.js';

export const lib = { templates: [], lessons: [], learnedIds: new Set(), folder: null, folderName: '', bundled: { kinds: 0, templates: 0 } };
const listeners = new Set();
export const onLibraryChanged = fn => listeners.add(fn);
const changed = () => listeners.forEach(f => f());

const BASE = new URL('../library/', import.meta.url);
const fetchJson = async p => { const r = await fetch(new URL(p, BASE), { cache: 'no-cache' }); if (!r.ok) throw new Error(p + ' ' + r.status); return r.json(); };

export async function initLibrary() {
  let index = { kinds: [], learned: [], templates: [], lessons: null };
  try { index = { ...index, ...(await fetchJson('index.json')) }; } catch (e) { console.warn('library index missing', e); }
  const packs = await Promise.all([...index.kinds, ...index.learned].map(p => fetchJson(p).catch(() => [])));
  const kinds = packs.flatMap(p => Array.isArray(p) ? p : [p]);
  for (const p of index.learned) { const k = kinds.find(x => p.endsWith('/' + x.id + '.json')); if (k) { k.learned = true; lib.learnedIds.add(k.id); } }
  lib.bundled.kinds = registerKinds(kinds);
  // learned in this browser
  const local = await db.all('kinds');
  for (const k of local) { k.learned = true; lib.learnedIds.add(k.id); }
  registerKinds(local);
  // lessons
  let bundledLessons = [];
  if (index.lessons) bundledLessons = await fetchJson(index.lessons).catch(() => []);
  const localLessons = await db.all('lessons');
  lib.lessons = dedupeLessons([...bundledLessons, ...localLessons]);
  // templates
  const tpls = await Promise.all(index.templates.map(p => fetchJson(p).then(t => ({ ...t, bundled: true, path: p })).catch(() => null)));
  lib.templates = [...tpls.filter(Boolean), ...(await db.all('templates'))];
  lib.bundled.templates = tpls.filter(Boolean).length;
  // folder handle
  const h = await db.get('meta', 'folder');
  if (h) { lib.folder = h; lib.folderName = h.name; }
  changed();
}

function dedupeLessons(list) {
  const seen = new Set(), out = [];
  for (const l of list) { const k = (l.text || '').toLowerCase().replace(/\W+/g, ' ').trim(); if (!k || seen.has(k)) continue; seen.add(k); out.push(l); }
  return out;
}

// ---------- learning ----------
export async function saveLearnedKind(kind) {
  kind = { ...kind, learned: true, created: kind.created || Date.now() };
  if (!registerKind(kind)) return false;
  lib.learnedIds.add(kind.id);
  await db.put('kinds', kind.id, kind);
  await writeToFolder(`kinds/learned/${kind.id}.json`, kind, idx => { idx.learned = [...new Set([...(idx.learned || []), `kinds/learned/${kind.id}.json`])]; });
  changed();
  return true;
}
export async function forgetKind(id) { await db.del('kinds', id); lib.learnedIds.delete(id); changed(); }

export async function addLessons(list, source) {
  const now = Date.now(); let n = 0;
  for (const l of list || []) {
    if (!l || !l.text || l.text.length < 12) continue;
    const lesson = { id: 'l' + now.toString(36) + Math.random().toString(36).slice(2, 5), text: String(l.text).slice(0, 400), tags: (l.tags || []).slice(0, 6).map(String), source: source || '', created: now };
    const before = lib.lessons.length;
    lib.lessons = dedupeLessons([...lib.lessons, lesson]);
    if (lib.lessons.length > before) { await db.put('lessons', lesson.id, lesson); n++; }
  }
  if (n) { await writeToFolder('lessons.json', lib.lessons, idx => { idx.lessons = 'lessons.json'; }); changed(); }
  return n;
}
export async function removeLesson(id) { lib.lessons = lib.lessons.filter(l => l.id !== id); await db.del('lessons', id); await writeToFolder('lessons.json', lib.lessons); changed(); }

// Lessons relevant to a request: tag/keyword overlap, newest first, capped.
export function relevantLessons(words = [], cap = 24) {
  const ws = new Set(words.map(w => w.toLowerCase()));
  const scored = lib.lessons.map(l => {
    let s = 0;
    for (const t of l.tags || []) if (ws.has(t.toLowerCase())) s += 3;
    for (const w of (l.text || '').toLowerCase().split(/\W+/)) if (ws.has(w)) s += 1;
    if (!(l.tags || []).length || (l.tags || []).includes('general')) s += 1.5;
    return [s, l];
  });
  scored.sort((a, b) => b[0] - a[0] || (b[1].created || 0) - (a[1].created || 0));
  return scored.slice(0, cap).map(x => x[1]);
}

export async function saveTemplate(doc, meta = {}) {
  const t = { id: 't' + Date.now().toString(36), name: meta.name || doc.name, description: meta.description || '', tags: meta.tags || [], doc: JSON.parse(JSON.stringify(doc, (k, v) => k === 'byId' ? undefined : v)), created: Date.now() };
  delete t.doc.source; // templates don't carry the source bitmap
  await db.put('templates', t.id, t);
  lib.templates.push(t);
  await writeToFolder(`templates/${t.id}.json`, t, idx => { idx.templates = [...new Set([...(idx.templates || []), `templates/${t.id}.json`])]; });
  changed();
  return t;
}
export async function deleteTemplate(id) { await db.del('templates', id); lib.templates = lib.templates.filter(t => t.id !== id); changed(); }

// ---------- folder sync ----------
export const folderSupported = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;
export async function connectFolder() {
  const h = await window.showDirectoryPicker({ id: 'orim-library', mode: 'readwrite' });
  lib.folder = h; lib.folderName = h.name;
  await db.put('meta', 'folder', h);
  await syncAllToFolder();
  changed();
}
export async function disconnectFolder() { lib.folder = null; lib.folderName = ''; await db.del('meta', 'folder'); changed(); }
async function ensurePermission() {
  if (!lib.folder) return false;
  try {
    if ((await lib.folder.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
    return (await lib.folder.requestPermission({ mode: 'readwrite' })) === 'granted';
  } catch (_) { return false; }
}
export const folderReady = async () => !!lib.folder && (await lib.folder.queryPermission({ mode: 'readwrite' }).catch(() => 'denied')) === 'granted';

// The chosen folder may be the repo root (has library/) or the library folder itself.
async function libDir() {
  try { return await lib.folder.getDirectoryHandle('library'); } catch (_) {}
  if (lib.folder.name === 'library') return lib.folder;
  return lib.folder.getDirectoryHandle('library', { create: true });
}
async function writeFile(dir, path, data) {
  const parts = path.split('/'); let d = dir;
  for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true });
  const fh = await d.getFileHandle(parts[parts.length - 1], { create: true });
  const w = await fh.createWritable(); await w.write(typeof data === 'string' ? data : JSON.stringify(data, null, 1)); await w.close();
}
async function readJson(dir, path) {
  try { let d = dir; const parts = path.split('/'); for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p); const f = await (await d.getFileHandle(parts[parts.length - 1])).getFile(); return JSON.parse(await f.text()); } catch (_) { return null; }
}
async function writeToFolder(path, data, updateIndex) {
  if (!lib.folder || !(await folderReady())) return false;
  try {
    const dir = await libDir();
    await writeFile(dir, path, data);
    if (updateIndex) { const idx = (await readJson(dir, 'index.json')) || { kinds: [], learned: [], templates: [] }; updateIndex(idx); await writeFile(dir, 'index.json', idx); }
    return true;
  } catch (e) { console.warn('folder write failed', e); return false; }
}
export async function syncAllToFolder() {
  if (!(await ensurePermission())) return 0;
  let n = 0;
  for (const id of lib.learnedIds) { const k = getKind(id); if (k && await writeToFolder(`kinds/learned/${id}.json`, cleanKind(k), idx => { idx.learned = [...new Set([...(idx.learned || []), `kinds/learned/${id}.json`])]; })) n++; }
  for (const t of lib.templates.filter(t => !t.bundled)) if (await writeToFolder(`templates/${t.id}.json`, t, idx => { idx.templates = [...new Set([...(idx.templates || []), `templates/${t.id}.json`])]; })) n++;
  if (lib.lessons.length) await writeToFolder('lessons.json', lib.lessons, idx => { idx.lessons = 'lessons.json'; });
  return n;
}
const cleanKind = k => { const { learned, ...rest } = k; return rest; };

// ---------- import / export ----------
export function exportBundle() {
  return { format: 'orim-library', version: 1, kinds: [...lib.learnedIds].map(getKind).filter(Boolean).map(cleanKind), lessons: lib.lessons, templates: lib.templates.filter(t => !t.bundled) };
}
export async function importBundle(b) {
  let n = 0;
  for (const k of b.kinds || []) if (await saveLearnedKind(k)) n++;
  await addLessons(b.lessons || [], 'import');
  for (const t of b.templates || []) { await db.put('templates', t.id, t); lib.templates.push(t); n++; }
  changed();
  return n;
}
