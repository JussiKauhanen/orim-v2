// Draw, edit or read a picture as structure: one fast streamed model call writes JSON lines,
// each line lands on the canvas at once, and the layout engine tidies up as they arrive.
import { complete, AIError } from './llm.js';
import { newRun, step, done, charge, fail, update } from './replicate.js';
import { DRAW_SYSTEM } from './prompts.js';
import { renderToCanvas } from './raster.js';
import { state, emit, beginChange, endChange, scheduleSave } from '../store.js';
import { indexDoc, framed } from '../render.js';
import { bounds, unionBounds } from '../geom.js';
import { flash, animateTo, panTo } from '../editor.js';
import { lineReader, applyItem, retryPending, serialize, computeLayout, bestLayout, layoutTargets, fitGroups, sortLayers, anchorsFor, fullyStructured, isGroup } from '../structure.js';

// Lay out structured content: all of it, or (hand-arranged diagrams) only what is new.
function makeLayout(doc, keep, { fresh = false, view = null } = {}) {
  let busy = null, again = false, timer = 0;
  const origin = () => { const b = unionBounds(doc.elements.filter(e => e.st && e.kind !== 'connector').map(e => bounds(e, doc))); return b ? { x: Math.max(40, b.x), y: Math.max(40, b.y) } : null; };
  const start = origin();
  // the visible canvas (beside the AI panel), for choosing the layout direction
  const aspect = () => { const r = document.getElementById('stage')?.getBoundingClientRect(); const w = (r?.width || 1200) - (view?.() || 0); return Math.max(.5, w / Math.max(1, r?.height || 800)); };
  async function once(final) {
    sortLayers(doc); indexDoc(doc);
    if (!doc.elements.some(e => e.st && e.kind !== 'connector')) return;
    // while lines stream in the direction stays put; the last pass picks the better one and keeps it
    let lay;
    if (final && !keep) { const best = await bestLayout(doc, aspect()); lay = best.lay; doc.layoutDir = best.dir; }
    else lay = await computeLayout(doc);
    if (state.doc !== doc) return;
    const { target, points } = layoutTargets(doc, lay, { keep, origin: start });
    // links follow their shapes during the move, then take the routed path
    for (const c of doc.elements) if (c.st === 'edge' && !keep?.has(c.id)) { delete c.points; c.route = 'elbow'; c.from = { id: c.from.id }; c.to = { id: c.to.id }; }
    await new Promise(res => animateTo(target, 240, res));
    if (keep) fitGroups(doc);
    else for (const c of doc.elements) {
      const pts = points.get(c.id); if (!pts || c.st !== 'edge') continue;
      Object.assign(c, anchorsFor(doc, c, pts, target), { route: 'straight', points: pts.slice(1, -1) });
    }
    // the page grows with the diagram
    const b = unionBounds(doc.elements.filter(e => e.kind !== 'connector').map(e => bounds(e, doc)));
    if (b && fresh) { doc.page.w = Math.ceil(b.x + b.w + 60); doc.page.h = Math.ceil(b.y + b.h + 60); }
    else if (b) { doc.page.w = Math.max(doc.page.w, Math.ceil(b.x + b.w + 60)); doc.page.h = Math.max(doc.page.h, Math.ceil(b.y + b.h + 60)); }
    emit('move');
    // keep a new drawing in view while it grows
    if (b && view) panTo(b, { right: view(), pad: 60 });
  }
  let wantFinal = false;
  async function run() { if (busy) { again = true; return busy; } const final = wantFinal; wantFinal = false; busy = once(final).catch(e => console.warn(e)); await busy; busy = null; if (again) { again = false; return run(); } }
  return { soon() { clearTimeout(timer); timer = setTimeout(run, 120); }, async now() { clearTimeout(timer); if (busy) await busy; wantFinal = true; await run(); } };
}

export async function draw({ instructions = '', image = null, selection = [], viewRight = () => 0 } = {}) {
  const doc = state.doc;
  const existing = doc.elements.filter(e => !e.ghost);
  const editing = existing.length > 0;
  const run = newRun('draw', image ? 'Read a picture' : editing ? 'Edit with AI' : 'Draw with AI');
  Object.assign(run, { say: '', changes: [], prompt: instructions, imageSrc: image?.src });
  const st = step(run, 'editor', image ? 'Reading the picture' : editing ? 'Editing the diagram' : 'Drawing');
  // a hand-arranged diagram keeps its positions; only new things are placed
  const keep = editing && !fullyStructured(doc) ? new Set(existing.map(e => e.id)) : null;
  const layout = makeLayout(doc, keep, { fresh: !editing, view: editing ? null : viewRight }), pending = [], reader = lineReader(), byId = new Map();
  const note = r => {
    const prev = byId.get(r.id);
    if (prev) prev.change = prev.change === 'add' && r.change === 'update' ? 'add' : r.change, prev.name = r.name;
    else { const x = { ...r }; byId.set(r.id, x); run.changes.push(x); }
  };
  const handle = items => {
    const added = [], changed = [];
    for (const it of items) {
      if (it.say) { run.say += (run.say ? '\n\n' : '') + String(it.say); update(); continue; }
      const r = applyItem(doc, it, pending); if (!r) continue;
      for (const x of [r, ...(r.change === 'remove' ? [] : retryPending(doc, pending))]) { note(x); (x.change === 'add' ? added : changed).push(x.id); }
    }
    if (!added.length && !changed.length) return;
    if (added.length) flash(added, 'add');
    if (changed.length) flash(changed.filter(id => doc.byId.has(id)), 'change');
    st.targets = [...added, ...changed].filter(id => doc.byId.has(id)).slice(-4);
    emit('move'); update(); layout.soon();
  };
  beginChange();
  try {
    const picked = selection.filter(id => doc.byId.has(id));
    const text = [
      image ? 'Read the diagram in the image and rebuild it as structure.' : '',
      instructions ? `Request: ${instructions}` : '',
      picked.length ? `Selected: ${picked.join(', ')}` : '',
      editing ? `Current diagram:\n${serialize(doc)}` : 'The canvas is empty.',
    ].filter(Boolean).join('\n\n');
    const content = [...(image ? [{ type: 'image', mime: image.mime, data: image.data }] : []), { type: 'text', text }];
    const res = await complete({ role: 'editor', effort: 'low', maxTokens: 8000, system: DRAW_SYSTEM, content, signal: run.ctl.signal,
      onThinking: t => { st.thinking += t; update(); }, onText: t => handle(reader.push(t)) });
    handle(reader.end());
    charge(run, res, st);
    if (!run.changes.length && !run.say) throw new AIError('bad_reply', 'The reply could not be read; nothing was changed.');
    await layout.now();
    try { run.thumb = await thumbnail(doc); } catch (_) {}
    done(st);
    const n = c => run.changes.filter(x => x.change === c).length;
    run.finish = { title: [n('add') && `${n('add')} added`, n('update') && `${n('update')} changed`, n('remove') && `${n('remove')} removed`].filter(Boolean).join(' · ') || 'No changes', undo: run.changes.length > 0 };
    run.status = 'done'; update(); scheduleSave();
  } catch (e) { fail(run, e); }
  endChange();
  return run;
}

// Lay out a diagram again from scratch, hand-drawn parts included.
export async function tidy() {
  const doc = state.doc; if (!doc) return;
  beginChange();
  const groups = doc.elements.filter(e => e.kind !== 'connector' && isGroup(e));
  for (const el of doc.elements) {
    if (el.ghost || el.hidden) continue;
    if (el.kind === 'connector') { if (el.from?.id && el.to?.id) el.st = 'edge'; continue; }
    if (!el.st) el.st = isGroup(el) ? 'group' : 'node';
    if (!el.parent) {
      const b = bounds(el, doc); let best = null, area = Infinity;
      for (const g of groups) { if (g === el) continue; const gb = bounds(g, doc), a = gb.w * gb.h; if (a < area && a > b.w * b.h && gb.x <= b.x && gb.y <= b.y && gb.x + gb.w >= b.x + b.w && gb.y + gb.h >= b.y + b.h) { best = g; area = a; } }
      if (best) el.parent = best.id;
    }
  }
  doc.manualLayout = false;
  await makeLayout(doc, null, { view: () => { const p = document.getElementById('aiPanel'); return p && !p.hidden && innerWidth > 900 ? p.offsetWidth + 24 : 0; } }).now();
  endChange();
}

// An image for the model: at most 1600 px on the long side, as base64 PNG.
export async function imagePart(src) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('The image could not be opened.')); i.src = src; });
  const s = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
  return { mime: 'image/png', data: c.toDataURL('image/png').split(',')[1], src: c.toDataURL('image/png') };
}

async function thumbnail(doc) {
  const c = await renderToCanvas(framed(doc)), w = 360, s = Math.min(1, w / c.width);
  const t = document.createElement('canvas'); t.width = Math.round(c.width * s); t.height = Math.round(c.height * s);
  t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
  return t.toDataURL('image/png');
}
