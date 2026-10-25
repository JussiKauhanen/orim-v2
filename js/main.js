// App shell: home screen, routing, top bar, dialogs.

import { state, setDoc, newDoc, onChange, listDocs, loadDoc, deleteDoc, putDoc, saveNow, undo, redo, canUndo, canRedo, change, clone, uid } from './store.js';
import { initEditor, fitPage, zoomBy, setViewMode, view, onViewChanged, render } from './editor.js';
import { initInspector } from './inspector.js';
import { initPalette, kindPreview, setPaletteCollapsed } from './palette.js';
import { initLibrary, lib, onLibraryChanged, saveTemplate, deleteTemplate, exportBundle, importBundle, removeLesson, forgetKind } from './library.js';
import { sceneSvg, indexDoc } from './render.js';
import { ensureFont } from './text.js';
import { initAIChat } from './ai/chat-ui.js';
import { replicate, refine, onRun, current, stop, styleGuide } from './ai/replicate.js';
import { draw, tidy, imagePart } from './ai/draw.js';
import { settings, hasKey, mockMode } from './ai/llm.js';
import { getKind, removeKind } from './kinds.js';
import { svgWithFonts, renderToCanvas } from './ai/raster.js';
import { icon, welcomeDoodle } from './icons.js';
import { displayDoc } from './theme.js';
import { initSettings, openSettings } from './settings-ui.js';
import { initContextToolbar } from './context-toolbar.js';
import { initReplicateImage } from './replicate-image.js';
import { providerMark, providerNames } from './ai/provider-ui.js';
import { initHighlighter } from './ai/highlighter.js';
import { initAgentPresence } from './ai/agent-presence.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let aiChat, repImage, displayedProvider, highlighter;
let sideCollapsed = true;
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
  editorApi.setTool('select');
  setDoc(doc);
  setPaletteCollapsed(!!doc.elements.length || !!doc.source, { auto: true });
  setAIExpanded(false);
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
  setViewMode('both');
  replicateDialog(src);
}

function replicateDialog(initialSource) {
  const s = settings();
  const dlg = $('#repDlg');
  $('#repIter').value = s.iterations; $('#repInstr').value = ''; $('#repDiagramOnly').checked = false; $('#repDesign').checked = true;
  $('#repKeyWarn').hidden = hasKey();
  repImage.open(state.doc, initialSource);
  dlg.showModal();
}
async function runReplicate() {
  if (!hasKey()) { openSettings(); return; }
  let src;
  try { src = repImage.source(); } catch (_) { toast('Choose an image that can be opened before replicating.'); return; }
  $('#repDlg').close();
  openAI();
  setViewMode('diagram');
  if ($('#repDlg [name=repMode]:checked')?.value === 'exact') await replicate({ src, instructions: $('#repInstr').value.trim(), diagramOnly: $('#repDiagramOnly').checked, iterations: +$('#repIter').value, designKinds: $('#repDesign').checked });
  else { let image; try { image = await imagePart(src); } catch (e) { toast(e.message); return; } await draw({ image, instructions: $('#repInstr').value.trim(), viewRight: aiPanelWidth }); }
  updateTop();
}

// ---------- top bar ----------
function updateTop() {
  if (!state.doc) return;
  if (document.activeElement !== $('#docName')) $('#docName').value = state.doc.name;
  $('#undoBtn').disabled = !canUndo(); $('#redoBtn').disabled = !canRedo();
  const hasSrc = !!state.doc.source;
  $('#srcCtl').hidden = !hasSrc;
  const busy = current?.status === 'running';
  $('#aiLauncher').classList.toggle('working', busy && current.docId === state.doc.id);
  updateProviderMark();
  aiChat?.refresh();
  syncView();
}
function syncView() {
  for (const b of document.querySelectorAll('#viewSeg [data-view]')) b.classList.toggle('on', b.dataset.view === view.mode);
  $('#blendSlider').hidden = view.mode !== 'both'; $('#blendSlider').value = view.blend;
}
function setSideCollapsed(value) {
  if (value && $('#side').contains(document.activeElement)) $('#sideToggle').focus({ preventScroll: true });
  sideCollapsed = value;
  $('#app').classList.toggle('side-collapsed', value);
  $('#side').setAttribute('aria-hidden', String(value));
  $('#sideToggle').setAttribute('aria-expanded', String(!value));
  $('#sideToggle').title = value ? 'Open properties panel' : 'Collapse right panel';
  window.dispatchEvent(new Event('resize'));
}
function showProperties() { setSideCollapsed(false); }
function setAIExpanded(value) {
  aiChat?.setExpanded(value);
  if (!value) highlighter?.setActive(false);
  $('#app').classList.toggle('ai-chat-open', value);
  $('#aiLauncher').hidden = value;
  $('#aiLauncher').setAttribute('aria-expanded', String(value));
}
function updateProviderMark() {
  const provider = settings().provider;
  if (provider === displayedProvider) return;
  displayedProvider = provider;
  $('#aiLauncher').innerHTML = providerMark(provider);
  $('#aiLauncher').title = `Ask ${providerNames[provider]}`;
}
const aiPanelWidth = () => { const p = $('#aiPanel'); return p && !p.hidden && innerWidth > 900 ? p.offsetWidth + 24 : 0; };
function openAI() { welcomeDismissed = true; updateWelcome(); setAIExpanded(true); aiChat.focus(); }
function chooseReplicationImage() {
  if (current?.status === 'running') return;
  replicateDialog();
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
  initSettings({ toast, onSaved: () => { $('#keyNote').hidden = hasKey(); updateProviderMark(); aiChat?.refresh(); } });
  for (const el of document.querySelectorAll('[data-icon]')) el.innerHTML = icon(el.dataset.icon);
  initEditor($('#stage'));
  const launcher = document.createElement('button'); launcher.id = 'aiLauncher'; launcher.className = 'ai-launcher';
  launcher.type = 'button'; launcher.setAttribute('aria-label', 'Open AI chat'); launcher.setAttribute('aria-expanded', 'false'); launcher.setAttribute('aria-controls', 'aiPanel'); launcher.title = 'AI chat';
  $('#stage').appendChild(launcher);
  updateProviderMark();
  launcher.addEventListener('click', openAI);
  repImage = initReplicateImage($('#repDlg'));
  highlighter = initHighlighter($('#stage'), { onUpdate: () => aiChat?.refresh() });
  initAgentPresence($('#stage'));
  const welcome = document.createElement('div'); welcome.id = 'welcome'; welcome.hidden = true;
  welcome.innerHTML = `<div class="card"><div class="ill">${welcomeDoodle()}</div><h2>A blank canvas. A little possibility.</h2><p>Start with a shape, an idea, or a picture.<br>Make it yours from there.</p><div class="acts"><button class="welcome-action draw" data-w="draw">${icon('draw')}<span>Draw with shapes</span></button><button class="welcome-action ask" data-w="ask">${icon('ai')}<span>Ask AI to draw it</span></button><button class="welcome-action replicate" data-w="replicate">${icon('image')}<span>Replicate an image</span></button><button class="welcome-action templates" data-w="templates">${icon('templates')}<span>Start from a template</span></button></div></div>`;
  $('#stage').appendChild(welcome);
  welcome.addEventListener('click', e => {
    const b = e.target.closest('[data-w]'); if (!b) return;
    if (b.dataset.w === 'draw') { welcomeDismissed = true; updateWelcome(); setPaletteCollapsed(false); $('#palSearch')?.focus(); }
    if (b.dataset.w === 'ask') openAI();
    if (b.dataset.w === 'replicate') $('#replicateBtn').click();
    if (b.dataset.w === 'templates') $('#homeBtn').click();
  });
  initInspector($('#inspector'));
  initContextToolbar($('#stage'), { onProperties: showProperties });
  aiChat = initAIChat($('#stage'), {
    highlighter, onOpen: openAI, onClose: () => { setAIExpanded(false); $('#aiLauncher').focus(); },
    templates: () => lib.templates,
    onSettings: openSettings,
    onImage: (src, label) => { $('#imgDlgImg').src = src; $('#imgDlgCap').textContent = label; $('#imgDlg').showModal(); },
    panelWidth: aiPanelWidth,
    onAttach: chooseReplicationImage,
    onRefine: () => { if (!hasKey()) return openSettings(); openAI(); refine({ rounds: 1 }); },
    onTidy: () => tidy(),
    onSend: (instructions, templateId, selection = []) => {
      if (!hasKey()) { openSettings(); return false; }
      const t = lib.templates.find(t => t.id === templateId);
      if (t) change(d => { d.page.background = t.doc.page.background; d.page.pattern = t.doc.page.pattern || null; });
      const highlights = highlighter.snapshot(); highlighter.setActive(false);
      // highlighter marks and style references need the visual editor; everything else is drawn as structure
      if (highlights.length || t) refine({ rounds: 1, instructions, style: t ? styleGuide(t.doc) : '', highlights, selection });
      else draw({ instructions, selection, viewRight: aiPanelWidth });
      return true;
    },
  });
  await initLibrary();
  initPalette($('#palette'));
  onChange(() => {
    updateTop(); updateWelcome();
  });
  onViewChanged(syncView);
  onLibraryChanged(() => { if (!$('#home').hidden) showHome(); });
  onRun(run => {
    if (run.status === 'running') highlighter.setActive(false);
    else if (run.status === 'done' && run.highlights?.length && run.docId === state.doc?.id) highlighter.clear();
    if (run.status === 'running' && !run.collapsedPanel) { run.collapsedPanel = true; setPaletteCollapsed(true, { auto: true }); }
    updateWelcome();
    updateTop();
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
  window.addEventListener('keydown', e => { if (e.shiftKey && e.key.toLowerCase() === 'v' && !e.metaKey && !e.ctrlKey && !$('#app').hidden && state.doc?.source && !/input|textarea|select/i.test(e.target.tagName)) { e.preventDefault(); e.stopImmediatePropagation(); setViewMode(view.mode === 'diagram' ? 'both' : 'diagram'); } }, true);
  $('#repGo').addEventListener('click', e => { e.preventDefault(); runReplicate(); });
  $('#tidyBtn').addEventListener('click', () => { if (current?.status !== 'running') tidy(); });
  for (const b of document.querySelectorAll('[data-export]')) b.addEventListener('click', () => { $('#exportMenu').hidden = true; exportAs(b.dataset.export); });
  $('#exportBtn').addEventListener('click', e => { e.stopPropagation(); $('#exportMenu').hidden = !$('#exportMenu').hidden; });
  document.addEventListener('click', e => { if (!e.target.closest('#exportMenu')) $('#exportMenu').hidden = true; });
  $('#settingsBtn').addEventListener('click', openSettings);
  $('#libraryBtn').addEventListener('click', openLibrary);
  const closeBoardOptions = () => { $('#boardUtilities').classList.remove('open'); $('#boardMore').setAttribute('aria-expanded', 'false'); };
  $('#boardMore').addEventListener('click', () => { const open = $('#boardUtilities').classList.toggle('open'); $('#boardMore').setAttribute('aria-expanded', String(open)); });
  document.addEventListener('pointerdown', e => { if (!e.target.closest('#boardUtilities, #boardMore')) closeBoardOptions(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeBoardOptions(); });
  $('#sideToggle').addEventListener('click', () => setSideCollapsed(!sideCollapsed));
  $('#sideClose').addEventListener('click', () => setSideCollapsed(true));

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
