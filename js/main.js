// App shell: home screen, routing, top bar, dialogs.

import { state, setDoc, newDoc, onChange, listDocs, loadDoc, deleteDoc, putDoc, saveNow, undo, redo, canUndo, canRedo, change, clone, uid } from './store.js';
import { initEditor, fitPage, zoomBy, setViewMode, view, onViewChanged, render } from './editor.js';
import { initInspector } from './inspector.js';
import { initPalette, kindPreview, setPaletteCollapsed } from './palette.js';
import { initLibrary, lib, onLibraryChanged, saveTemplate, deleteTemplate, exportBundle, importBundle, removeLesson, forgetKind } from './library.js';
import { sceneSvg, indexDoc } from './render.js';
import { ensureFont } from './text.js';
import { initAgents } from './ai/agents-ui.js';
import { replicate, refine, onRun, current, stop, styleGuide } from './ai/replicate.js';
import { settings, hasKey, mockMode } from './ai/llm.js';
import { getKind, removeKind } from './kinds.js';
import { svgWithFonts, renderToCanvas } from './ai/raster.js';
import { icon, welcomeDoodle } from './icons.js';
import { displayDoc } from './theme.js';
import { initSettings, openSettings } from './settings-ui.js';
import { initContextToolbar } from './context-toolbar.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let askStyle = null;
let sideCollapsed = true, activeSide = 'inspect';
function applyTheme() {
  let t = 'light'; try { t = localStorage.getItem('orim.theme') || 'light'; } catch (_) {}
  document.documentElement.dataset.theme = t;
  for (const b of document.querySelectorAll('.themeBtn')) b.setAttribute('aria-label', t === 'dark' ? 'Switch to day mode' : 'Switch to night mode');
  window.dispatchEvent(new Event('themechange'));
}
function toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(t._t); t._t = setTimeout(() => t.hidden = true, ms); }

// ---------- thumbnails ----------
function thumb(doc, w = 260, h = 170) {
  const d = indexDoc(clone(doc));
  for (const e of d.elements) if (e.text?.font) ensureFont(e.text.font);
  const svg = sceneSvg(displayDoc(d));
  return svg.replace(/^<svg ([^>]*?)width="[^"]*" height="[^"]*"/, `<svg $1width="100%" height="100%" preserveAspectRatio="xMidYMid meet"`);
}

// ---------- home ----------
// A running AI job edits the diagram it started on; leaving that diagram stops it.
function leaveDoc(nextId) {
  if (current?.status === 'running' && current.docId !== nextId) { stop(); toast('Stopped the AI job because you left its diagram'); }
}
async function showHome() {
  leaveDoc(null);
  $('#app').hidden = true; $('#home').hidden = false;
  if (state.doc) await saveNow();
  const docs = await listDocs();
  const tpls = lib.templates;
  $('#homeTemplates').innerHTML = tpls.map(t => `<div class="card tpl" data-tpl="${esc(t.id)}"><div class="th">${thumb(t.doc)}</div><div class="meta"><b>${esc(t.name)}</b><small>${esc(t.description || (t.tags || []).join(' · '))}</small></div>${t.bundled ? '' : `<button class="x" data-deltpl="${esc(t.id)}" title="Delete template">×</button>`}</div>`).join('') || '<p class="muted">No templates yet.</p>';
  $('#delAll').hidden = docs.length < 2;
  $('#homeRecent').innerHTML = docs.map(d => `<div class="card doc" data-doc="${esc(d.id)}"><div class="th">${d.elements.length ? thumb(d) : d.source ? `<img src="${d.source.src}" alt="">` : ''}</div><div class="meta"><b>${esc(d.name)}</b><small>${new Date(d.updated).toLocaleString()} · ${d.elements.length} elements</small></div><button class="x" data-deldoc="${esc(d.id)}" title="Delete">×</button></div>`).join('') || '<p class="muted">Nothing here yet — replicate an image or open a template.</p>';
  $('#libStats').innerHTML = `${lib.bundled.kinds} built-in kinds · <b>${lib.learnedIds.size} learned</b> · ${lib.lessons.length} lessons · ${lib.templates.length} templates${lib.folder ? ` · folder <b>${esc(lib.folderName)}</b>` : ''}`;
  $('#keyNote').hidden = hasKey();
  location.hash !== '' && history.replaceState(null, '', location.pathname);
}

async function openDoc(doc, { push = true } = {}) {
  leaveDoc(doc.id);
  $('#home').hidden = true; $('#app').hidden = false;
  for (const e of doc.elements) if (e.text?.font) ensureFont(e.text.font);
  view.mode = 'diagram'; // always open on the editable diagram
  setDoc(doc);
  setPaletteCollapsed(!!doc.elements.length || !!doc.source, { auto: true });
  showSide('inspect', { open: false });
  setSideCollapsed(true);
  if (push) history.pushState(null, '', '#d-' + doc.id);
  updateTop();
  welcomeDismissed = false; updateWelcome();
  setTimeout(fitPage, 30);
}

// ---------- blank-canvas welcome ----------
let welcomeDismissed = false;
function updateWelcome() {
  const w = $('#welcome'); if (!w || !state.doc) return;
  const blank = !state.doc.elements.length && !state.doc.source && !(current?.status === 'running' && current.docId === state.doc.id);
  w.hidden = !blank || welcomeDismissed;
}

async function startFromImage(src, name) {
  const d = newDoc({ name: name || 'Replica ' + new Date().toLocaleDateString() });
  d.source = { src };
  const img = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src; });
  const s = Math.min(1, 1568 / Math.max(img.width, img.height), Math.sqrt(1150000 / (img.width * img.height)));
  d.page.w = Math.round(img.width * s); d.page.h = Math.round(img.height * s);
  d.source = { src, w: img.width, h: img.height, scale: s };
  await putDoc(d);
  await openDoc(d);
  setViewMode('source');
  replicateDialog();
}

function replicateDialog() {
  const s = settings();
  const dlg = $('#repDlg');
  $('#repIter').value = s.iterations; $('#repInstr').value = ''; $('#repDiagramOnly').checked = false; $('#repDesign').checked = true;
  $('#repKeyWarn').hidden = hasKey();
  $('#repPreview').src = state.doc.source?.src || '';
  dlg.showModal();
}
async function runReplicate() {
  if (!hasKey()) { openSettings(); return; }
  $('#repDlg').close();
  showSide('agents');
  setViewMode('diagram');
  await replicate({ src: state.doc.source.src, instructions: $('#repInstr').value.trim(), diagramOnly: $('#repDiagramOnly').checked, iterations: +$('#repIter').value, designKinds: $('#repDesign').checked });
  updateTop();
}

// ---------- top bar ----------
function updateTop() {
  if (!state.doc) return;
  if (document.activeElement !== $('#docName')) $('#docName').value = state.doc.name;
  $('#undoBtn').disabled = !canUndo(); $('#redoBtn').disabled = !canRedo();
  const hasSrc = !!state.doc.source;
  $('#srcCtl').hidden = !hasSrc;
  $('#replicateBtn .action-title').textContent = hasSrc && state.doc.elements.length ? 'Re-replicate image' : 'Replicate an image';
  $('#refineBtn').hidden = !hasSrc || !state.doc.elements.length;
  const busy = current?.status === 'running';
  for (const id of ['askBtn', 'refineBtn', 'replicateBtn']) $('#' + id).disabled = busy;
  $('#aiLauncher').classList.toggle('working', busy && current.docId === state.doc.id);
  syncView();
}
function syncView() {
  for (const b of document.querySelectorAll('#viewSeg [data-view]')) b.classList.toggle('on', b.dataset.view === view.mode);
  $('#blendSlider').hidden = view.mode !== 'both'; $('#blendSlider').value = view.blend;
}
function setSideCollapsed(value) {
  if (value && $('#side').contains(document.activeElement)) (activeSide === 'agents' ? $('#aiLauncher') : $('#sideToggle')).focus({ preventScroll: true });
  sideCollapsed = value;
  $('#app').classList.toggle('side-collapsed', value);
  $('#side').setAttribute('aria-hidden', String(value));
  $('#sideToggle').setAttribute('aria-expanded', String(!value));
  $('#sideToggle').title = value ? 'Open properties panel' : 'Collapse right panel';
  const aiOpen = !value && activeSide === 'agents';
  $('#aiLauncher').setAttribute('aria-expanded', String(aiOpen));
  $('#aiLauncher').setAttribute('aria-label', aiOpen ? 'Close AI workspace' : 'Open AI workspace');
  window.dispatchEvent(new Event('resize'));
}
function showSide(which, { open = true } = {}) {
  activeSide = which;
  for (const b of document.querySelectorAll('[data-side]')) b.classList.toggle('on', b.dataset.side === which);
  $('#inspector').hidden = which !== 'inspect'; $('#aiWorkspace').hidden = which !== 'agents';
  if (open) setSideCollapsed(false);
}

// ---------- library dialog ----------
function openLibrary() {
  const learned = [...lib.learnedIds].map(getKind).filter(Boolean);
  $('#libKinds').innerHTML = learned.map(k => `<div class="lk"><div class="pv">${kindPreview(k.id, 56)}</div><div><b>${esc(k.name || k.id)}</b><small>${esc(k.description || '')}</small>${k.source?.score ? `<small>similarity ${k.source.score} · from ${esc(k.source.from || '')}</small>` : ''}</div><button class="x" data-forget="${esc(k.id)}" title="Remove from this browser">×</button></div>`).join('') || '<p class="muted">Nothing learned yet. When a replication meets a shape the library does not have, the designer agent builds it and it lands here.</p>';
  $('#libLessons').innerHTML = lib.lessons.map(l => `<li>${esc(l.text)} ${(l.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')} <button class="x" data-dellesson="${esc(l.id)}">×</button></li>`).join('') || '<li class="muted">No lessons yet. The critic writes them down when it finds something general.</li>';
  $('#libDlg').showModal();
}

// ---------- export ----------
function download(name, data, type) { const a = document.createElement('a'); a.href = typeof data === 'string' && data.startsWith('data:') ? data : URL.createObjectURL(new Blob([data], { type })); a.download = name; a.click(); }
async function exportAs(kind) {
  const d = state.doc, base = (d.name || 'diagram').replace(/[^\w-]+/g, '-').slice(0, 50);
  if (kind === 'svg') download(base + '.svg', await svgWithFonts(d), 'image/svg+xml');
  if (kind === 'png') { const c = await renderToCanvas(d, { scale: 2 }); download(base + '.png', c.toDataURL('image/png')); }
  if (kind === 'json') download(base + '.orim.json', JSON.stringify(d, (k, v) => k === 'byId' ? undefined : v), 'application/json');
  if (kind === 'template') { const t = await saveTemplate(d, { name: d.name }); toast(`Saved "${t.name}" as a template${lib.folder ? ' (also written to the folder)' : ''}`); }
}

// ---------- boot ----------
async function boot() {
  applyTheme();
  initSettings({ toast, onSaved: () => { $('#keyNote').hidden = hasKey(); } });
  for (const el of document.querySelectorAll('[data-icon]')) el.innerHTML = icon(el.dataset.icon);
  initEditor($('#stage'));
  const launcher = document.createElement('button'); launcher.id = 'aiLauncher'; launcher.className = 'ai-launcher';
  launcher.type = 'button'; launcher.setAttribute('aria-label', 'Open AI workspace'); launcher.setAttribute('aria-expanded', 'false'); launcher.setAttribute('aria-controls', 'aiWorkspace'); launcher.title = 'AI workspace'; launcher.innerHTML = icon('ai');
  $('#stage').appendChild(launcher);
  launcher.addEventListener('click', () => { if (!sideCollapsed && activeSide === 'agents') setSideCollapsed(true); else showSide('agents'); });
  const pill = document.createElement('div'); pill.id = 'aiPill'; pill.hidden = true; $('#stage').appendChild(pill);
  const welcome = document.createElement('div'); welcome.id = 'welcome'; welcome.hidden = true;
  welcome.innerHTML = `<div class="card"><div class="ill">${welcomeDoodle()}</div><h2>A blank canvas. A little possibility.</h2><p>Start with a shape, an idea, or a picture.<br>Make it yours from there.</p><div class="acts"><button class="welcome-action draw" data-w="draw">${icon('draw')}<span>Draw with shapes</span></button><button class="welcome-action ask" data-w="ask">${icon('ai')}<span>Ask AI to draw it</span></button><button class="welcome-action replicate" data-w="replicate">${icon('image')}<span>Replicate an image</span></button><button class="welcome-action templates" data-w="templates">${icon('templates')}<span>Start from a template</span></button></div></div>`;
  $('#stage').appendChild(welcome);
  welcome.addEventListener('click', e => {
    const b = e.target.closest('[data-w]'); if (!b) return;
    if (b.dataset.w === 'draw') { welcomeDismissed = true; updateWelcome(); setPaletteCollapsed(false); $('#palSearch')?.focus(); }
    if (b.dataset.w === 'ask') $('#askBtn').click();
    if (b.dataset.w === 'replicate') $('#replicateBtn').click();
    if (b.dataset.w === 'templates') $('#homeBtn').click();
  });
  initInspector($('#inspector'));
  initContextToolbar($('#stage'), { onProperties: () => showSide('inspect') });
  initAgents($('#agents'), {
    pillEl: pill,
    onImage: (src, label) => { $('#imgDlgImg').src = src; $('#imgDlgCap').textContent = label; $('#imgDlg').showModal(); },
    onAction: act => { if (act === 'undo') undo(); else if (act === 'ask') $('#askBtn').click(); else if (act === 'refine') $('#refineBtn').click(); },
  });
  await initLibrary();
  initPalette($('#palette'));
  onChange(what => {
    updateTop(); updateWelcome();
    if (what === 'selection' && state.selection.size && !sideCollapsed) showSide('inspect');
  });
  $('#stage').addEventListener('pointerdown', e => {
    if (!sideCollapsed && e.target.closest('#canvas') && state.selection.size) showSide('inspect');
  });
  onViewChanged(syncView);
  onLibraryChanged(() => { if (!$('#home').hidden) showHome(); });
  onRun(run => {
    if (run.status === 'running' && !run.collapsedPanel) { run.collapsedPanel = true; setPaletteCollapsed(true, { auto: true }); }
    updateWelcome();
    updateTop();
    if (run.status === 'running') return;
    if (!run.announced) { run.announced = true; toast(run.status === 'done' ? `${run.finish?.title || 'Done'}${run.final != null ? ` — similarity ${run.final}/100` : ''}` : run.status === 'stopped' ? 'Stopped' : 'Stopped with an error — see the Agents tab', 4000); }
  });

  // home events
  const drop = $('#drop');
  const takeFile = f => { if (!f || !f.type.startsWith('image/')) return toast('Drop an image (PNG, JPG, WebP)'); const r = new FileReader(); r.onload = () => startFromImage(r.result, f.name.replace(/\.\w+$/, '')); r.readAsDataURL(f); };
  drop.addEventListener('click', () => $('#fileIn').click());
  $('#fileIn').addEventListener('change', e => takeFile(e.target.files[0]));
  for (const t of [drop, document.body]) {
    t.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); drop.classList.add('over'); } });
    t.addEventListener('dragleave', () => drop.classList.remove('over'));
    t.addEventListener('drop', e => { if (e.dataTransfer.files.length) { e.preventDefault(); drop.classList.remove('over'); if (!$('#home').hidden) takeFile(e.dataTransfer.files[0]); else addImageToDoc(e.dataTransfer.files[0]); } });
  }
  window.addEventListener('paste', e => {
    const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
    if (item) { e.preventDefault(); const f = item.getAsFile(); if (!$('#home').hidden) takeFile(f); else addImageToDoc(f); return; }
    const txt = e.clipboardData?.getData('text');
    if (txt && !$('#app').hidden && txt.startsWith('{"orim"')) { try { const { paste } = window.__editor; paste(JSON.parse(txt).elements); e.preventDefault(); } catch (_) {} }
  });
  $('#newBlank').addEventListener('click', async () => { const d = newDoc({ name: 'Untitled', w: 1400, h: 900, background: '#ffffff' }); await putDoc(d); openDoc(d); });
  $('#homeTemplates').addEventListener('click', async e => {
    const del = e.target.closest('[data-deltpl]'); if (del) { e.stopPropagation(); if (confirm('Delete this template?')) { await deleteTemplate(del.dataset.deltpl); showHome(); } return; }
    const c = e.target.closest('[data-tpl]'); if (!c) return;
    const t = lib.templates.find(x => x.id === c.dataset.tpl);
    const d = { ...clone(t.doc), id: uid('d'), name: t.name, created: Date.now(), updated: Date.now() };
    if (t.source && !d.source) { try { const r = await fetch(new URL('../' + t.source, import.meta.url)); const b = await r.blob(); d.source = { src: await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); }), scale: 1 }; } catch (_) {} }
    await putDoc(d); openDoc(d);
  });
  $('#homeRecent').addEventListener('click', async e => {
    const del = e.target.closest('[data-deldoc]'); if (del) { e.stopPropagation(); if (confirm('Delete this diagram?')) { await deleteDoc(del.dataset.deldoc); if (state.doc?.id === del.dataset.deldoc) state.doc = null; showHome(); } return; }
    const c = e.target.closest('[data-doc]'); if (c) openDoc(await loadDoc(c.dataset.doc));
  });
  $('#delAll').addEventListener('click', async () => {
    const docs = await listDocs();
    if (!confirm(`Delete all ${docs.length} diagrams in this browser? This cannot be undone.`)) return;
    for (const d of docs) await deleteDoc(d.id);
    state.doc = null; // otherwise showHome saves the last open diagram back
    showHome();
  });
  for (const b of document.querySelectorAll('.themeBtn')) b.addEventListener('click', () => { const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; try { localStorage.setItem('orim.theme', t); } catch (_) {} applyTheme(); if (!$('#home').hidden) showHome(); });
  $('#homeSettings').addEventListener('click', openSettings);
  $('#homeLibrary').addEventListener('click', openLibrary);

  // top bar
  $('#homeBtn').addEventListener('click', () => { history.pushState(null, '', location.pathname); showHome(); });
  $('#docName').addEventListener('change', e => change(d => { d.name = e.target.value || 'Untitled'; }));
  $('#undoBtn').addEventListener('click', undo); $('#redoBtn').addEventListener('click', redo);
  $('#zoomOut').addEventListener('click', () => zoomBy(1 / 1.25)); $('#zoomIn').addEventListener('click', () => zoomBy(1.25)); $('#zoomFit').addEventListener('click', () => fitPage());
  $('#viewSeg').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (b) setViewMode(b.dataset.view); });
  $('#blendSlider').addEventListener('input', e => setViewMode('both', +e.target.value));
  window.addEventListener('keydown', e => { if (e.key.toLowerCase() === 'v' && !e.metaKey && !e.ctrlKey && !$('#app').hidden && state.doc?.source && !/input|textarea|select/i.test(e.target.tagName)) { e.preventDefault(); e.stopImmediatePropagation(); setViewMode(view.mode === 'diagram' ? 'source' : 'diagram'); } }, true);
  $('#replicateBtn').addEventListener('click', () => {
    if (state.doc.source) return replicateDialog();
    const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*';
    i.onchange = () => { const f = i.files[0]; if (!f) return; const r = new FileReader(); r.onload = async () => { state.doc.source = { src: r.result }; const img = new Image(); img.onload = () => { const s = Math.min(1, 1568 / Math.max(img.width, img.height), Math.sqrt(1150000 / (img.width * img.height))); change(d => { d.source = { src: r.result, w: img.width, h: img.height, scale: s }; d.page.w = Math.round(img.width * s); d.page.h = Math.round(img.height * s); }); fitPage(); replicateDialog(); }; img.src = r.result; }; r.readAsDataURL(f); };
    i.click();
  });
  $('#refineBtn').addEventListener('click', async () => { if (!hasKey()) return openSettings(); showSide('agents'); await refine({ rounds: 1 }); });
  $('#askBtn').addEventListener('click', () => {
    $('#askIn').value = '';
    const blank = state.doc.elements.length < 3;
    $('#askStyleWrap').hidden = !blank; askStyle = null;
    $('#askDlg h2').innerHTML = icon('ai') + (blank ? 'Ask AI to draw a diagram' : 'Ask AI to change the diagram');
    $('#askIn').placeholder = blank ? 'e.g. lead flow from our website chat through Azure into Dynamics 365, one column per system' : 'e.g. make all connectors dashed and add a legend at the bottom';
    if (blank) $('#askStyles').innerHTML = `<button class="tp none on" data-tp=""><div class="th">No preference</div><span>Let the AI choose</span></button>` + lib.templates.map(t => `<button class="tp" data-tp="${esc(t.id)}"><div class="th">${thumb(t.doc)}</div><span>${esc(t.name)}</span></button>`).join('');
    $('#askDlg').showModal(); $('#askIn').focus();
  });
  $('#askStyles').addEventListener('click', e => { const b = e.target.closest('[data-tp]'); if (!b) return; e.preventDefault(); askStyle = b.dataset.tp || null; for (const x of $('#askStyles').children) x.classList.toggle('on', x === b); });
  $('#askGo').addEventListener('click', async e => {
    e.preventDefault(); const q = $('#askIn').value.trim(); if (!q) return; $('#askDlg').close(); if (!hasKey()) return openSettings();
    const t = askStyle && lib.templates.find(x => x.id === askStyle);
    if (t) change(d => { d.page.background = t.doc.page.background; d.page.pattern = t.doc.page.pattern || null; });
    showSide('agents');
    await refine({ rounds: 1, instructions: q, style: t ? styleGuide(t.doc) : '' });
  });
  $('#repGo').addEventListener('click', e => { e.preventDefault(); runReplicate(); });
  for (const b of document.querySelectorAll('[data-export]')) b.addEventListener('click', () => { $('#exportMenu').hidden = true; exportAs(b.dataset.export); });
  $('#exportBtn').addEventListener('click', e => { e.stopPropagation(); $('#exportMenu').hidden = !$('#exportMenu').hidden; });
  document.addEventListener('click', e => { if (!e.target.closest('#exportMenu')) $('#exportMenu').hidden = true; });
  $('#settingsBtn').addEventListener('click', openSettings);
  $('#libraryBtn').addEventListener('click', openLibrary);
  $('#aiSettings').addEventListener('click', openSettings);
  $('#sideToggle').addEventListener('click', () => { if (sideCollapsed) showSide('inspect'); else setSideCollapsed(true); });
  $('#sideClose').addEventListener('click', () => setSideCollapsed(true));
  for (const b of document.querySelectorAll('[data-side]')) b.addEventListener('click', () => showSide(b.dataset.side));

  // dialogs
  $('#libDlg').addEventListener('click', async e => {
    const f = e.target.closest('[data-forget]'); if (f) { await forgetKind(f.dataset.forget); removeKind(f.dataset.forget); openLibrary(); return; }
    const l = e.target.closest('[data-dellesson]'); if (l) { await removeLesson(l.dataset.dellesson); openLibrary(); return; }
    if (e.target.id === 'libExport') download('orim-library.json', JSON.stringify(exportBundle(), null, 1), 'application/json');
    if (e.target.id === 'libImport') { const i = document.createElement('input'); i.type = 'file'; i.accept = '.json'; i.onchange = async () => { const n = await importBundle(JSON.parse(await i.files[0].text())); toast(`Imported ${n} items`); openLibrary(); }; i.click(); }
  });
  for (const d of document.querySelectorAll('dialog')) d.addEventListener('click', e => { if (e.target === d) d.close(); });
  for (const b of document.querySelectorAll('[data-close]')) b.addEventListener('click', e => { e.preventDefault(); b.closest('dialog').close(); });

  $('#mockBadge').hidden = !mockMode();
  window.addEventListener('popstate', route);
  window.__orim = { startFromImage, openDoc };
  await route();
}

async function addImageToDoc(f) {
  const r = new FileReader();
  r.onload = () => { const img = new Image(); img.onload = () => { const s = Math.min(1, 400 / Math.max(img.width, img.height)); import('./editor.js').then(m => m.addKindAt('image', null, null, { w: img.width * s, h: img.height * s, props: { src: r.result } })); }; img.src = r.result; };
  r.readAsDataURL(f);
}

async function route() {
  const m = /^#d-(.+)$/.exec(location.hash);
  if (m) { const d = await loadDoc(m[1]); if (d) return openDoc(d, { push: false }); }
  showHome();
}

import * as editorApi from './editor.js';
window.__editor = editorApi;
boot();
