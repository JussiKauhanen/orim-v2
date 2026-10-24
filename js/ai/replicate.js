// The replication pipeline: image → analysed scene → measured → missing kinds designed →
// critic rounds that render, diff and fix. Every step reports into a `run` object that
// the agents panel shows live, and the doc on the canvas updates as elements arrive.

import { complete, extractJson, partialArray, partialObject, settings, AIError } from './llm.js';
import { withCatalog, ANALYST_SYSTEM, analystUser, DESIGNER_SYSTEM, designerUser, CRITIC_SYSTEM, criticUser, EDIT_SYSTEM } from './prompts.js';
import { loadImage, canvasOf, pixels, modelSize, encode, palette, regions, sampleBox, snapBox, compare, cropCanvas, strip } from './vision.js';
import { renderToCanvas, canvasWithHighlights } from './raster.js';
import { catalog, getKind, validateKind, allKinds } from '../kinds.js';
import { relevantLessons, addLessons, saveLearnedKind } from '../library.js';
import { state, emit, normalize, stripClasses, uid, clone, scheduleSave, saveNow, beginChange, endChange } from '../store.js';
import { ensureFont } from '../text.js';
import { dist, parse as parseColor } from '../color.js';
import { indexDoc } from '../render.js';
import { bounds } from '../geom.js';

const listeners = new Set();
export const onRun = fn => listeners.add(fn);
export let current = null;
let tick = 0;
const update = () => { cancelAnimationFrame(tick); tick = requestAnimationFrame(() => listeners.forEach(f => f(current))); };

const runs = new Map(); // docId -> latest run, so each diagram shows its own agent history
export const runFor = docId => runs.get(docId) || null;
function newRun(kind, title) {
  current = { id: uid('r'), docId: state.doc?.id, provider: settings().provider, kind, title, status: 'running', steps: [], scores: [], cost: 0, started: Date.now(), ctl: new AbortController() };
  runs.set(current.docId, current);
  update(); return current;
}
// Stream callbacks that also keep a running estimate of output tokens for the live cost display.
function meter(st, role, onText) {
  st.model = settings().roles[role]; st.outChars = st.outChars || 0;
  return {
    onThinking: t => { st.thinking += t; st.outChars += t.length; update(); },
    onText: t => { st.outChars += t.length; if (onText) onText(t); else st.text += t; update(); },
  };
}

// ---------- ghosts: instant placeholders while the model is still thinking ----------
function showGhosts(doc, boxes) {
  clearGhosts(doc);
  boxes.forEach((b, i) => doc.elements.push({ id: 'ghost-' + i, kind: 'rect', ghost: true, x: b.x, y: b.y, w: b.w, h: b.h, params: { radius: 6 }, style: {}, text: b.label ? { content: b.label } : {} }));
  emit();
}
function clearGhosts(doc) { const n = doc.elements.length; doc.elements = doc.elements.filter(e => !e.ghost); if (doc.elements.length !== n) emit(); }
function step(run, agent, title, extra = {}) {
  const s = { id: uid('s'), agent, title, status: 'running', text: '', thinking: '', images: [], log: [], started: Date.now(), ...extra };
  run.steps.push(s); update(); return s;
}
const done = (s, status = 'done', note) => { s.status = status; s.ended = Date.now(); if (note) s.log.push(note); update(); };
const log = (s, m) => { s.log.push(m); update(); };
export function stop() { if (current && current.status === 'running') { current.ctl.abort(); current.status = 'stopped'; update(); } }

function charge(run, res, s) {
  run.cost += res.cost || 0;
  if (s) {
    s.cost = (s.cost || 0) + (res.cost || 0); s.tokens = (s.tokens || 0) + (res.usage?.output_tokens || 0); s.outChars = 0;
    const u = res.usage || {}, p = s.usage || { in: 0, cached: 0, out: 0 };
    s.usage = { in: p.in + (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0), cached: p.cached + (u.cache_read_input_tokens || 0), out: p.out + (u.output_tokens || 0) };
  }
  update();
  const b = settings().budget;
  if (b && run.cost > b) throw new AIError('budget', `Stopped at the $${b} budget for one run (change it in Settings).`);
}

// ---------- entry: replicate an image into the current doc ----------
export async function replicate({ src, instructions = '', diagramOnly = false, iterations, designKinds = true }) {
  const run = newRun('replicate', 'Replicate image');
  const S = settings(); iterations = iterations ?? S.iterations;
  const doc = state.doc;
  try {
    // 1. prepare
    const prep = step(run, 'eye', 'Looking at the image');
    const img = await loadImage(src);
    const full = canvasOf(img, img.naturalWidth, img.naturalHeight, '#ffffff');
    const ms = modelSize(full.width, full.height);
    const view = canvasOf(full, ms.w, ms.h, '#ffffff');
    const enc = encode(view);
    const fullPx = pixels(full);
    const pal = palette(fullPx, 20);
    const regs = regions(fullPx, pal).map(r => ({ ...r, x: r.x * ms.s, y: r.y * ms.s, w: r.w * ms.s, h: r.h * ms.s }));
    doc.page.w = ms.w; doc.page.h = ms.h; doc.page.background = pal[0]?.hex || '#ffffff';
    doc.source = { src, w: full.width, h: full.height, scale: ms.s };
    doc.elements = []; emit('doc');
    prep.images.push({ label: 'source', src: enc.url });
    prep.palette = pal.slice(0, 16).map(p => p.hex);
    log(prep, `${full.width}×${full.height}px → working at ${ms.w}×${ms.h}. ${pal.length} colours, ${regs.length} regions detected.`);
    done(prep);
    // outline what the measuring found right away; replaced as soon as real elements stream in
    showGhosts(doc, regs.filter(r => r.fill > 0.3 && r.w * r.h > ms.w * ms.h * 0.002).slice(0, 40));

    // 2. analyse
    const an = step(run, 'analyst', 'Vision analyst: reading the diagram');
    const words = (instructions + ' diagram').toLowerCase().split(/\W+/);
    const lessons = relevantLessons(words, 30);
    if (lessons.length) log(an, `Using ${lessons.length} learned lessons.`);
    let buf = '', lastParse = 0, shown = 0;
    const res = await complete({
      role: 'analyst', system: withCatalog(ANALYST_SYSTEM, catalog()), signal: run.ctl.signal, maxTokens: 64000,
      content: [{ type: 'image', mime: enc.mime, data: enc.data }, { type: 'text', text: analystUser({ w: ms.w, h: ms.h, palette: pal, regions: regs, lessons, instructions, diagramOnly }) }],
      ...meter(an, 'analyst', t => {
        buf += t; an.text = buf.length + ' chars';
        const now = performance.now();
        if (now - lastParse > 250) { lastParse = now; shown = livePreview(doc, buf, shown, an); }
      }),
    });
    clearGhosts(doc);
    charge(run, res, an);
    let scene;
    try { scene = extractJson(res.text); } catch (e) { scene = { elements: partialArray(res.text, 'elements'), page: partialObject(res.text, 'page'), styles: partialObject(res.text, 'styles') }; log(an, 'Reply was cut short; using the complete elements.'); }
    applyScene(doc, scene, ms);
    an.summary = scene.summary || '';
    log(an, `${doc.elements.length} elements${scene.newKinds?.length ? `, ${scene.newKinds.length} new kinds requested` : ''}.${scene.notes ? ' Notes: ' + scene.notes : ''}`);
    done(an);
    await Promise.all((scene.fonts || []).map(ensureFont));

    // 3. crops + measuring
    const me = step(run, 'ruler', 'Measuring: exact boxes and colours from pixels');
    let crops = 0;
    for (const el of doc.elements) if (el.kind === 'image' && el.props?.crop) {
      const c = cropCanvas(full, { x: el.x / ms.s, y: el.y / ms.s, w: el.w / ms.s, h: el.h / ms.s });
      el.props = { src: c.canvas.toDataURL('image/png') }; crops++;
    }
    if (S.measure) { const m = measure(doc, fullPx, ms.s); log(me, `Snapped ${m.snapped} boxes, corrected ${m.recoloured} colours${crops ? `, copied ${crops} image crops` : ''}.`); }
    else log(me, `Skipped (off in Settings).${crops ? ` Copied ${crops} image crops.` : ''}`);
    emit(); done(me);

    // 4. design missing kinds
    const missing = (scene.newKinds || []).filter(k => k && k.id && !getKind(k.id));
    const unknownUsed = [...new Set(doc.elements.filter(e => e.kind !== 'connector' && !getKind(e.kind)).map(e => e.kind))];
    for (const id of unknownUsed) if (!missing.find(m => m.id === id)) missing.push({ id, name: id, description: 'element of kind ' + id });
    if (missing.length && designKinds) {
      const queue = missing.slice(0, 8);
      await Promise.all(queue.map(spec => designKind(run, spec, doc, full, ms.s).catch(e => { if (e.code === 'aborted' || e.code === 'budget') throw e; })));
    }
    // anything still unknown falls back to an image crop so the scene stays faithful
    for (const el of doc.elements) if (el.kind !== 'connector' && !getKind(el.kind)) {
      const c = cropCanvas(full, { x: el.x / ms.s, y: el.y / ms.s, w: el.w / ms.s, h: el.h / ms.s });
      el.props = { src: c.canvas.toDataURL('image/png') }; el.missingKind = el.kind; el.kind = 'image'; el.text = {}; el.style = {};
    }
    emit(); scheduleSave();

    // 5. critic rounds
    await refineLoop(run, doc, view, enc, iterations, instructions);
    const learned = run.steps.filter(x => x.agent === 'designer' && x.status === 'done').length;
    run.finish = { title: 'Replication finished', text: iterations ? `Similarity ${run.first} → ${run.final}. ${run.stopReason || ''}${learned ? ` ${learned} new shape${learned > 1 ? 's' : ''} added to the library.` : ''}` : 'Built without critic rounds.', refine: true };
    run.status = 'done'; update();
    await saveNow();
  } catch (e) { fail(run, e); }
  return run;
}

function fail(run, e) {
  console.error(e);
  run.status = e.code === 'aborted' ? 'stopped' : 'error'; run.error = e.message || String(e); run.errorCode = e.code;
  for (const s of run.steps) if (s.status === 'running') done(s, run.status === 'stopped' ? 'stopped' : 'error');
  update(); scheduleSave();
}

// Stream preview: add complete elements to the canvas as they arrive.
function livePreview(doc, buf, shown, s) {
  const page = partialObject(buf, 'page');
  if (!s.stylesShown) { const st = partialObject(buf, 'styles'); if (st) { doc.classes = st; s.stylesShown = true; } }
  if (page && !s.pageShown) { s.pageShown = true; if (page.background) doc.page.background = page.background; if (page.pattern) doc.page.pattern = page.pattern; }
  const els = partialArray(buf, 'elements');
  if (els.length > shown) {
    if (!shown) clearGhosts(doc);
    const ids = new Set(doc.elements.map(e => e.id));
    for (const raw of els.slice(shown)) { const el = normalize(raw, doc.classes); if (!ids.has(el.id)) { doc.elements.push(el); ids.add(el.id); if (el.text?.font) ensureFont(el.text.font); } }
    // connectors to elements that have not arrived yet would draw to the origin: hide them for now
    indexDoc(doc);
    for (const el of doc.elements) if (el.kind === 'connector') el.hidden = !!((el.from.id && !doc.byId.has(el.from.id)) || (el.to.id && !doc.byId.has(el.to.id)));
    s.log[0] = `${els.length} elements so far…`;
    const target = doc.elements.findLast(e => e.kind !== 'connector');
    if (target) { s.focus = bounds(target, doc); s.targets = [target.id]; }
    emit();
  }
  return els.length;
}

function applyScene(doc, scene, ms) {
  const p = scene.page || {};
  doc.page = { w: ms.w, h: ms.h, background: p.background || doc.page.background, pattern: p.pattern && p.pattern.type !== 'none' ? p.pattern : null };
  doc.classes = { ...(scene.styles || {}) };
  const els = (scene.elements || []).map(e => normalize(e, doc.classes));
  const seen = new Set(); doc.elements = [];
  for (const el of els) { if (seen.has(el.id)) el.id = uid(); seen.add(el.id); doc.elements.push(el); }
  indexDoc(doc);
  // drop connectors pointing at nothing (keep them as free lines)
  for (const c of doc.elements) if (c.kind === 'connector') { delete c.hidden; for (const k of ['from', 'to']) if (c[k].id && !doc.byId.has(c[k].id)) c[k] = { x: c[k].x || 0, y: c[k].y || 0 }; }
  if (scene.summary && (!doc.name || doc.name === 'Untitled' || doc.name.startsWith('Replica'))) doc.name = scene.summary.slice(0, 60);
  emit();
}

// Snap boxes to real edges and take fill/stroke colours from the pixels.
function measure(doc, px, s) {
  let snapped = 0, recoloured = 0;
  const bg = doc.page.background;
  for (const el of doc.elements) {
    if (el.kind === 'connector' || el.kind === 'text' || el.kind === 'image' || el.rot) continue;
    const kind = getKind(el.kind); if (!kind || kind.viewBox && kind.aspect === 'meet') continue;
    const box = { x: el.x / s, y: el.y / s, w: el.w / s, h: el.h / s };
    if (box.w < 8 || box.h < 8) continue;
    const span = (kind.outline === 'ellipse' || kind.id === 'pill' || kind.outline === 'diamond') ? [0.44, 0.56] : [0.25, 0.75];
    const nb = snapBox(px, box, { span });
    if (nb !== box && (Math.abs(nb.x - box.x) + Math.abs(nb.y - box.y) + Math.abs(nb.w - box.w) + Math.abs(nb.h - box.h)) > 0.5) {
      el.x = nb.x * s; el.y = nb.y * s; el.w = nb.w * s; el.h = nb.h * s; snapped++; box.x = nb.x; box.y = nb.y; box.w = nb.w; box.h = nb.h;
    }
    const sm = sampleBox(px, box, bg);
    const st = el.style || (el.style = {});
    const fillDefault = st.fill ?? kind.style?.fill;
    const close = (a, b, lim) => { const p = parseColor(a), q = parseColor(b); return p && q && dist(p, q) < lim; };
    if (sm.fill && sm.fillShare > 0.55 && fillDefault && fillDefault !== 'none' && close(fillDefault, sm.fill, 110) && !close(fillDefault, sm.fill, 3)) { st.fill = sm.fill; recoloured++; }
    const strokeDefault = st.stroke ?? kind.style?.stroke;
    if (sm.stroke && strokeDefault && strokeDefault !== 'none' && close(strokeDefault, sm.stroke, 90) && !close(strokeDefault, sm.stroke, 3)) { st.stroke = sm.stroke; recoloured++; }
    if (sm.text && el.text?.content && el.text.color && close(el.text.color, sm.text, 90) && !close(el.text.color, sm.text, 3)) { el.text.color = sm.text; recoloured++; }
  }
  return { snapped, recoloured };
}

// ---------- shape designer loop ----------
async function designKind(run, spec, doc, full, s) {
  const st = step(run, 'designer', `Shape designer: ${spec.name || spec.id}`);
  const example = doc.elements.find(e => e.id === spec.example) || doc.elements.find(e => e.kind === spec.id);
  if (!example) { log(st, 'No element uses it; skipped.'); done(st, 'skipped'); return; }
  st.focus = bounds(example, doc); st.targets = [example.id];
  const pad = 6;
  const box = { x: example.x / s, y: example.y / s, w: example.w / s, h: example.h / s };
  const scale = Math.min(4, Math.max(1, 220 / Math.max(box.w, box.h)), 600 / Math.max(box.w, box.h));
  const cr = cropCanvas(full, box, pad / s, scale * s);
  const target = cr.canvas;
  const bg = cornerColour(target);
  st.images.push({ label: 'target', src: target.toDataURL() });
  const examples = pickExamples(spec);
  let best = null, previous = null, feedback = '', bestCanvas = null;
  const attempts = settings().designAttempts;
  for (let a = 0; a < attempts; a++) {
    const content = [{ type: 'image', mime: 'image/png', data: target.toDataURL('image/png').split(',')[1] }];
    if (previous && bestCanvas) content.push({ type: 'image', mime: 'image/png', data: feedback.strip.split(',')[1] });
    content.push({ type: 'text', text: designerUser({ spec, crop: { w: target.width, h: target.height, pad: Math.round(pad * scale) }, examples, previous, feedback: feedback.text }) });
    const res = await complete({ role: 'designer', system: DESIGNER_SYSTEM, content, signal: run.ctl.signal, maxTokens: 24000, ...meter(st, 'designer') });
    charge(run, res, st);
    let out; try { out = extractJson(res.text); } catch (e) { log(st, `Attempt ${a + 1}: unreadable reply.`); continue; }
    const kind = { category: 'learned', ...(out.kind || out), id: spec.id };
    const errs = validateKind(kind);
    if (errs.length) { log(st, `Attempt ${a + 1} rejected: ${errs.join(', ')}`); previous = kind; feedback = { text: 'The kind was invalid: ' + errs.join(', '), strip: target.toDataURL() }; continue; }
    const inst = out.element || {};
    const P = Math.round(pad * scale), tmpId = 'tmp-' + spec.id.replace(/[^a-z0-9-]/g, '');
    const tdoc = indexDoc({ id: 'design', page: { w: target.width, h: target.height, background: bg }, elements: [{ id: 'x', kind: tmpId, x: P, y: P, w: inst.w || target.width - P * 2, h: inst.h || target.height - P * 2, params: { ...(example.params || {}), ...(inst.params || {}) }, style: scaleStyle({ ...(example.style || {}), ...(inst.style || {}) }, scale), text: example.text?.content ? { ...example.text, size: (example.text.size || 14) * scale } : {} }] });
    const { registerKind, removeKind } = await import('../kinds.js');
    registerKind({ ...kind, id: tmpId }, { silent: true });
    let rc; try { rc = await renderToCanvas(tdoc); } finally { removeKind(tmpId, { silent: true }); }
    const cmp = compare(target, rc, { size: 220 });
    st.images.push({ label: `try ${a + 1} · ${cmp.score}`, src: rc.toDataURL() });
    log(st, `Attempt ${a + 1}: similarity ${cmp.score}`);
    if (!best || cmp.score > best.score) { best = { kind, inst, score: cmp.score }; bestCanvas = rc; }
    if (cmp.score >= 96) break;
    previous = kind;
    const heat = await loadImage(cmp.heat);
    feedback = { text: `similarity ${cmp.score}/100`, strip: strip([target, rc, canvasOf(heat, target.width, target.height)], ['target', 'render', 'difference']).toDataURL('image/png') };
  }
  if (!best) { done(st, 'error', 'No usable design.'); return; }
  if (best.score < 55) { done(st, 'skipped', `Best design only reached ${best.score}; using a pixel crop instead of saving it.`); return; }
  const { learned, ...k } = best.kind;
  k.source = { from: doc.name || 'replication', score: best.score, created: Date.now() };
  await saveLearnedKind(k);
  // style the instances like the designer's instantiation
  for (const el of doc.elements) if (el.kind === spec.id) { el.params = { ...(best.inst.params || {}), ...(el.params || {}) }; el.style = { ...(best.inst.style || {}), ...(el.style || {}) }; }
  log(st, `Saved "${k.name || k.id}" to the library (similarity ${best.score}).`);
  emit(); done(st);
}
const scaleStyle = (st, k) => ({ ...st, ...(st.strokeWidth ? { strokeWidth: st.strokeWidth * k } : {}) });
function cornerColour(c) {
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, W = c.width, H = c.height;
  const pts = [[1, 1], [W - 2, 1], [1, H - 2], [W - 2, H - 2]].map(([x, y]) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; });
  const avg = pts.reduce((a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4, a[2] + p[2] / 4], [0, 0, 0]);
  return '#' + avg.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
}
function pickExamples(spec) {
  const words = new Set(`${spec.id} ${spec.name} ${spec.description}`.toLowerCase().split(/\W+/));
  const scored = allKinds().map(k => [(k.tags || []).concat(k.id.split('-')).filter(t => words.has(t)).length + (k.learned ? 0.5 : 0), k]);
  scored.sort((a, b) => b[0] - a[0]);
  const picks = [scored[0]?.[1], getKind('callout'), getKind('cube-3d')].filter(Boolean);
  const out = []; for (const k of picks) if (!out.find(o => o.id === k.id) && out.length < 2) out.push(k);
  return out.map(k => { const { learned, source, ...rest } = k; return rest; });
}

// ---------- critic loop ----------
// Scene as sent back to a model: values covered by a style class or the kind's defaults are
// left out and numbers are rounded, which keeps critic and editor prompts small.
function compactScene(doc) {
  const r = v => typeof v === 'number' ? (Math.abs(v) >= 10 ? Math.round(v) : Math.round(v * 10) / 10) : v;
  const els = doc.elements.map(e => {
    let o = stripClasses(JSON.parse(JSON.stringify(e, (k, v) => k === 'src' ? undefined : k === 'byId' ? undefined : r(v))), doc.classes);
    const kind = getKind(o.kind);
    if (kind) for (const [sec, def] of [['params', Object.fromEntries(Object.entries(kind.params || {}).map(([k, p]) => [k, p.default]))], ['style', kind.style || {}], ['text', kind.text || {}]]) {
      if (o[sec]) o[sec] = Object.fromEntries(Object.entries(o[sec]).filter(([k, v]) => JSON.stringify(def[k]) !== JSON.stringify(v)));
    }
    if (o.props && !Object.keys(o.props).length) delete o.props;
    for (const k of ['params', 'style', 'text']) if (o[k] && !Object.keys(o[k]).length) delete o[k];
    if (!o.rot) delete o.rot;
    if (o.missingKind) delete o.missingKind;
    return o;
  });
  return JSON.stringify({ page: doc.page, ...(doc.classes && Object.keys(doc.classes).length ? { styles: doc.classes } : {}), elements: els });
}

async function refineLoop(run, doc, view, enc, iterations, instructions) {
  if (!iterations) return;
  let rc = await renderToCanvas(doc);
  let cmp = compare(view, rc);
  run.scores.push(cmp.score);
  let best = { score: cmp.score, snap: clone(doc) };
  const first = step(run, 'critic', `First render: similarity ${cmp.score}`);
  first.images.push({ label: 'render', src: rc.toDataURL() }, { label: 'difference', src: cmp.heat });
  done(first);
  for (let round = 1; round <= iterations; round++) {
    const st = step(run, 'critic', `Critic round ${round}`, { focus: cmp.cells[0] || { x: 0, y: 0, w: doc.page.w, h: doc.page.h } });
    const heat = await loadImage(cmp.heat);
    const hs = Math.min(1, 480 / Math.max(view.width, view.height));
    const content = [
      { type: 'image', mime: enc.mime, data: enc.data, cache: true }, // same in every round: read from cache after the first
      { type: 'image', mime: 'image/png', data: rc.toDataURL('image/png').split(',')[1] },
      { type: 'image', mime: 'image/png', data: canvasOf(heat, view.width * hs, view.height * hs).toDataURL('image/png').split(',')[1] },
      { type: 'text', text: criticUser({ score: cmp.score, cells: cmp.cells, scene: compactScene(doc), round, instructions }) },
    ];
    const { out, n } = await streamOps(run, st, doc, { system: withCatalog(CRITIC_SYSTEM, catalog()), content });
    if (!out) { done(st, 'error', 'Unreadable reply.'); continue; }
    await Promise.all(doc.elements.filter(e => e.text?.font).map(e => ensureFont(e.text.font)));
    emit();
    rc = await renderToCanvas(doc);
    cmp = compare(view, rc);
    run.scores.push(cmp.score);
    st.images.push({ label: `render · ${cmp.score}`, src: rc.toDataURL() }, { label: 'difference', src: cmp.heat });
    if (out.lessons?.length) { const k = await addLessons(out.lessons, doc.name); if (k) log(st, `Learned ${k} lesson${k > 1 ? 's' : ''}.`); }
    if (cmp.score + 0.3 < best.score) {
      log(st, `${n} edits made it worse (${cmp.score} < ${best.score}); reverted.`);
      restoreInto(doc, best.snap); emit();
      rc = await renderToCanvas(doc); cmp = compare(view, rc);
    } else { log(st, `${n} edits → similarity ${cmp.score}.`); if (cmp.score >= best.score) best = { score: cmp.score, snap: clone(doc) }; }
    done(st);
    if (out.done) { run.stopReason = 'The critic found nothing visible left to fix.'; break; }
    if (!n) { run.stopReason = 'The critic had no further edits.'; break; }
    if (round === iterations) run.stopReason = `Reached the limit of ${iterations} critic round${iterations > 1 ? 's' : ''}; Refine runs another.`;
  }
  run.first = run.scores[0]; run.final = best.score;
}
function restoreInto(doc, snap) { doc.elements = clone(snap.elements); doc.page = clone(snap.page); indexDoc(doc); }

function deepMerge(t, s) {
  for (const [k, v] of Object.entries(s || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && t[k] && typeof t[k] === 'object' && !Array.isArray(t[k])) deepMerge(t[k], v);
    else if (v === null) delete t[k];
    else t[k] = v;
  }
  return t;
}
export function applyOps(doc, ops) {
  let n = 0; indexDoc(doc);
  for (const op of ops) {
    try {
      if (op.op === 'update' && doc.byId.has(op.id)) { const el = doc.byId.get(op.id); const base = op.set?.cls !== undefined ? stripClasses(clone(el), doc.classes) : clone(el); const merged = normalize(deepMerge(base, op.set || {}), doc.classes); Object.assign(el, merged); if (el.kind === 'image' && el.props?.crop && !el.props.src) {} n++; }
      else if (op.op === 'add' && op.element) {
        const el = normalize(op.element, doc.classes); if (doc.byId.has(el.id)) el.id = uid();
        const i = op.before ? doc.elements.findIndex(e => e.id === op.before) : -1;
        if (i >= 0) doc.elements.splice(i, 0, el); else doc.elements.push(el);
        if (el.kind === 'image' && el.props?.crop && doc.source) pendingCrops.push(el);
        indexDoc(doc); n++;
      }
      else if (op.op === 'remove') { const i = doc.elements.findIndex(e => e.id === op.id); if (i >= 0) { doc.elements.splice(i, 1); n++; } }
      else if (op.op === 'page') { deepMerge(doc.page, op.set || {}); n++; }
      else if (op.op === 'styles') { doc.classes = deepMerge(doc.classes || {}, op.set || {}); n++; }
      else if (op.op === 'order' && doc.byId.has(op.id)) {
        const el = doc.byId.get(op.id); doc.elements = doc.elements.filter(e => e !== el);
        const i = op.before ? doc.elements.findIndex(e => e.id === op.before) : -1;
        if (i >= 0) doc.elements.splice(i, 0, el); else doc.elements.push(el); n++;
      }
    } catch (e) { console.warn('op failed', op, e); }
  }
  indexDoc(doc);
  for (const c of doc.elements) if (c.kind === 'connector') for (const k of ['from', 'to']) if (c[k].id && !doc.byId.has(c[k].id)) c[k] = { x: 0, y: 0 };
  if (pendingCrops.length) fillCrops(doc);
  return n;
}
const pendingCrops = [];
async function fillCrops(doc) {
  const img = await loadImage(doc.source.src); const full = canvasOf(img);
  const s = doc.source.scale || 1;
  for (const el of pendingCrops.splice(0)) { const c = cropCanvas(full, { x: el.x / s, y: el.y / s, w: el.w / s, h: el.h / s }); el.props = { src: c.canvas.toDataURL('image/png') }; }
  emit();
}

// Run a critic/editor request and apply its ops to the doc as they stream in.
async function streamOps(run, st, doc, { role = 'critic', system, content }) {
  let buf = '', applied = 0, n = 0, last = 0;
  const apply = ops => {
    const ids = ops.map(op => op.id || op.element?.id).filter(Boolean);
    const previous = ids.map(id => doc.byId.get(id)).filter(Boolean).map(e => bounds(e, doc));
    const count = applyOps(doc, ops);
    st.targets = ids.filter(id => doc.byId.has(id)).slice(-4);
    const changed = st.targets.map(id => bounds(doc.byId.get(id), doc));
    if (changed.length || previous.length) st.focus = (changed.length ? changed : previous).at(-1);
    update(); return count;
  };
  const flush = () => {
    const ops = partialArray(buf, 'ops');
    if (ops.length > applied) { if (!applied) { run.opsStarted = true; clearGhosts(doc); } n += apply(ops.slice(applied)); applied = ops.length; emit(); }
  };
  const res = await complete({ role, system, content, signal: run.ctl.signal, maxTokens: 64000,
    ...meter(st, role, t => { buf += t; st.text += t; const now = performance.now(); if (now - last > 150) { last = now; flush(); } }) });
  charge(run, res, st);
  buf = res.text; flush();
  let out = null; try { out = extractJson(res.text); } catch (_) { out = applied ? { ops: [] } : null; }
  if (out) {
    st.summary = out.assessment || '';
    if ((out.ops || []).length > applied) { n += apply(out.ops.slice(applied)); emit(); }
  }
  await Promise.all(doc.elements.filter(e => e.text?.font).map(e => ensureFont(e.text.font)));
  return { out, n };
}

// ---------- refine against the source, or edit by instruction ----------
// Both are one undo step; an instruction edit is applied as asked (it is not scored against the source).
export async function refine({ rounds = 1, instructions = '', style = '', highlights = [] } = {}) {
  const doc = state.doc;
  const run = newRun('refine', instructions ? 'Edit with AI' : 'Refine against the original');
  run.highlights = highlights;
  beginChange();
  try {
    if (!instructions && doc.source) {
      const img = await loadImage(doc.source.src);
      const view = canvasOf(img, doc.page.w, doc.page.h, '#ffffff');
      await refineLoop(run, doc, view, encode(view), rounds, '');
      run.finish = { title: 'Refine finished', text: `Similarity ${run.first} → ${run.final}. ${run.stopReason || ''}`, undo: true, refine: true };
    } else {
      const st = step(run, 'editor', 'Editing: ' + instructions.slice(0, 60));
      if (highlights.length) {
        const points = highlights.flatMap(s => s.points), xs = points.map(p => p[0]), ys = points.map(p => p[1]);
        st.focus = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
      }
      const before = await renderToCanvas(doc);
      st.images.push({ label: 'before', src: before.toDataURL() });
      const marked = highlights.length ? canvasWithHighlights(before, highlights).toDataURL('image/png') : null;
      if (marked) st.images.push({ label: 'Your highlighted areas', src: marked });
      const real = doc.elements.filter(e => !e.ghost).length;
      // Building on a near-empty page: a fast model sketches the layout in a few seconds while
      // the main model is still thinking; its boxes are replaced as soon as real edits arrive.
      let sketching = null;
      if (real < 3) sketching = quickSketch(run, doc, instructions).catch(() => {});
      const attention = marked ? '\nThe first image is the clean diagram. The second is the same diagram with translucent yellow highlighter strokes drawn by the user to indicate the areas they want changed. Focus the request on those areas unless instructed otherwise. The highlights are request annotations, not diagram content: never add them to the result. Image coordinates match the page.\n' : '';
      const text = `Request: ${instructions}\n${attention}${style ? `\nStyle reference (match this look: palette, fonts, shapes, line style):\n${style}\n` : ''}\nPage: ${doc.page.w} × ${doc.page.h} px.\nCurrent scene:\n${compactScene(doc)}`;
      const { out, n } = await streamOps(run, st, doc, { role: 'editor', system: withCatalog(EDIT_SYSTEM, catalog()), content: [...(real || marked ? [{ type: 'image', mime: 'image/png', data: before.toDataURL('image/png').split(',')[1] }] : []), ...(marked ? [{ type: 'image', mime: 'image/png', data: marked.split(',')[1] }] : []), { type: 'text', text }] });
      run.sketchDone = true; await sketching; clearGhosts(doc);
      if (!out) throw new AIError('bad_reply', 'The reply could not be read; nothing was changed.');
      st.images.push({ label: 'after', src: (await renderToCanvas(doc)).toDataURL() });
      log(st, `${n} edits.`); done(st);
      run.finish = { title: 'Edit applied', text: `${n} change${n === 1 ? '' : 's'} made on the canvas. Undo (⌘Z) returns to the version before.`, undo: true, refine: !!doc.source };
    }
    run.status = 'done'; update();
  } catch (e) { fail(run, e); }
  clearGhosts(doc);
  endChange();
  return run;
}

// Fast, cheap layout sketch (small model, low effort): labelled boxes shown as ghosts.
async function quickSketch(run, doc, instructions) {
  const st = step(run, 'sketch', 'Sketching the layout');
  try {
    const res = await complete({ role: 'sketch', system: 'You sketch diagram layouts. Reply with JSON only: {"boxes": [{"x": 0, "y": 0, "w": 100, "h": 60, "label": "short label"}]} with 6 to 30 boxes that block out the main areas and items of the requested diagram on the page, aligned on a grid. No prose.', content: [{ type: 'text', text: `Page ${doc.page.w} × ${doc.page.h} px. Diagram: ${instructions}` }], signal: run.ctl.signal, maxTokens: 3000, ...meter(st, 'sketch') });
    charge(run, res, st);
    if (!run.sketchDone && !run.opsStarted) {
      const out = extractJson(res.text);
      if (Array.isArray(out.boxes)) showGhosts(doc, out.boxes.slice(0, 40).map(b => ({ x: +b.x || 0, y: +b.y || 0, w: Math.max(10, +b.w || 0), h: Math.max(10, +b.h || 0), label: String(b.label || '').slice(0, 40) })));
    }
    done(st);
  } catch (e) { done(st, e.code === 'aborted' ? 'stopped' : 'skipped', e.message); throw e; }
}

// Style guide from a template: page, fonts and the most common looks, as compact text.
export function styleGuide(tdoc) {
  const looks = new Map(), lines = new Map();
  for (const e of tdoc.elements) {
    if (e.kind === 'connector') { const k = JSON.stringify({ route: e.route, end: e.end, style: e.style }); lines.set(k, (lines.get(k) || 0) + 1); continue; }
    const t = e.text || {};
    const k = JSON.stringify({ kind: e.kind, params: e.params, style: e.style, text: { font: t.font, size: t.size, weight: t.weight, color: t.color } });
    looks.set(k, (looks.get(k) || 0) + 1);
  }
  const top = m => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, n]) => `${n}× ${k}`).join('\n');
  return `page ${JSON.stringify({ background: tdoc.page.background, pattern: tdoc.page.pattern })}\nlooks:\n${top(looks)}\nlines:\n${top(lines)}`;
}
