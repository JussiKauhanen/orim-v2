// Left panel: every kind (built-in and learned) with a live preview. Click to place, drag to drop.

import { allKinds, onKindsChanged, getKind } from './kinds.js';
import { elementSvg } from './render.js';
import { makeElement } from './store.js';
import { addKindAt, dropKind, setPlacing, setTool, setLineTool, view, onViewChanged } from './editor.js';
import { lib } from './library.js';
import { icon } from './icons.js';
import { displayElement } from './theme.js';
import { lineButtons, LINE_TOOLS } from './quick-insert.js';

const ORDER = ['learned', 'basic', 'flowchart', 'containers', 'wireframe', 'icons', 'decor'];
let root, query = '';
const expanded = new Set();
let collapsed = false, autoCollapsed = false;
// Collapsed = a thin Miro-style rail with the quick tools; remembered per browser.
export function setPaletteCollapsed(v, { auto = false } = {}) {
  collapsed = v; autoCollapsed = v && auto;
  document.getElementById('app').classList.toggle('pal-collapsed', v);
  if (root) {
    setShapesOpen(false);
    const b = root.querySelector('.pal-toggle');
    b.innerHTML = icon(v ? 'panel-open' : 'panel-close');
    b.setAttribute('aria-label', v ? 'Expand shapes panel' : 'Collapse shapes panel');
    b.setAttribute('aria-expanded', String(!v));
    b.title = v ? 'Expand shapes panel' : 'Collapse shapes panel';
  }
  if (!auto) try { localStorage.setItem('orim.palCollapsed', v ? '1' : '0'); } catch (_) {}
  window.dispatchEvent(new Event('resize'));
}
export const paletteAutoCollapsed = () => autoCollapsed;
export const paletteCollapsed = () => collapsed;

export function kindPreview(kindId, size = 44, override) {
  const k = getKind(kindId); if (!k) return '';
  let el = makeElement(kindId, override);
  const [w, h] = k.size || [100, 60];
  const s = Math.min((size - 6) / w, (size - 6) / h);
  el.w = w; el.h = h; el.x = 0; el.y = 0; el.id = 'pv-' + kindId;
  if (kindId !== 'text') el.text = { ...el.text, content: '' };
  if (document.documentElement.dataset.theme === 'dark') el = displayElement(el);
  const pad = 3 / s;
  return `<svg viewBox="${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">${elementSvg(el, { elements: [el], byId: new Map([[el.id, el]]), page: { background: '#fff' } })}</svg>`;
}

export function initPalette(el) {
  root = el;
  const quick = [['text', 'Text (T)'], ['rect', 'Rectangle (R)'], ['ellipse', 'Ellipse (O)'], ['diamond', 'Diamond (D)'], ['note', 'Sticky note (N)']];
  const button = (attrs, title, svg) => `<button type="button" ${attrs} title="${title}" aria-label="${title}">${svg}</button>`;
  const toolIcon = paths => `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  root.innerHTML = `<button class="pal-toggle" title="Collapse shapes panel" aria-label="Collapse shapes panel" aria-expanded="true">${icon('panel-close')}</button><div class="pal-search"><input type="search" placeholder="Search shapes…" aria-label="Search shapes" id="palSearch"></div><div class="pal-quick">${quick.map(([k, title]) => button(`data-k="${k}"`, title, icon(k))).join('')}${button('data-img="1"', 'Add image', icon('image'))}</div>
    <div class="pal-rail" role="toolbar" aria-label="Canvas tools" aria-orientation="vertical">
      ${button('data-tool="select"', 'Select (V)', toolIcon('<path d="m5 3 14 9-7 1.5L9 20Z"/>'))}
      ${button('data-tool="hand"', 'Hand (H or Space)', toolIcon('<path d="M8 12V6.5a1.5 1.5 0 0 1 3 0v4M11 9V4.5a1.5 1.5 0 0 1 3 0V11m0-4.5a1.5 1.5 0 0 1 3 0V12m0-3.5a1.5 1.5 0 0 1 3 0V14c0 4-2.5 7-6 7h-1c-2 0-3.4-.8-4.5-2.5L4 12.8a1.5 1.5 0 0 1 2.3-1.9L8 13"/>'))}
      <span class="pal-rail-sep" role="separator"></span>
      ${button('data-k="note"', 'Sticky note (N)', icon('note'))}
      ${button('data-k="text"', 'Text (T)', icon('text'))}
      ${button('data-shapes="1" class="pal-shapes-btn" aria-controls="palShapes" aria-expanded="false"', 'Shapes', toolIcon('<rect x="3" y="10" width="10" height="10" rx="1.5"/><circle cx="16" cy="8" r="5"/>') + '<span class="pal-caret"></span>')}
      ${button('data-img="1"', 'Add image', icon('image'))}
      <span class="pal-rail-sep" role="separator"></span>
      ${button('data-expand="1"', 'All shapes and icons', icon('templates'))}
    </div>
    <div id="palShapes" class="pal-flyout" role="group" aria-label="Shapes" hidden><div class="pal-flyout-heading"><b>Shapes</b>${button('data-shapes-close="1"', 'Close shapes', icon('close'))}</div><div class="pal-shape-grid"></div><button class="pal-all-shapes" data-expand="1">All shapes and icons ${icon('chevron')}</button></div><div class="pal-list"></div>`;
  root.querySelector('#palSearch').addEventListener('input', e => { query = e.target.value.trim().toLowerCase(); list(); });
  root.addEventListener('click', e => {
    if (e.target.closest('.pal-toggle')) { setPaletteCollapsed(!collapsed); return; }
    if (e.target.closest('[data-expand]')) { setPaletteCollapsed(false); root.querySelector('#palSearch')?.focus(); return; }
    if (e.target.closest('[data-shapes]')) { setShapesOpen(root.querySelector('#palShapes').hidden); return; }
    if (e.target.closest('[data-shapes-close]')) { setShapesOpen(false); root.querySelector('[data-shapes]')?.focus(); return; }
    const line = e.target.closest('[data-line]');
    if (line) { const [, , route, end] = LINE_TOOLS.find(t => t[0] === line.dataset.line); setLineTool(route, end); setShapesOpen(false); return; }
    const tool = e.target.closest('[data-tool]'); if (tool) { setTool(tool.dataset.tool); setShapesOpen(false); return; }
    const b = e.target.closest('[data-k]'); if (b) { setPlacing(b.dataset.k); setShapesOpen(false); return; }
    if (e.target.closest('[data-img]')) import('./inspector.js').then(m => m.pickImage((src) => { const img = new Image(); img.onload = () => { const s = Math.min(1, 400 / Math.max(img.width, img.height)); addKindAt('image', null, null, { w: img.width * s, h: img.height * s, props: { src } }); setTool('select'); }; img.src = src; }));
    const more = e.target.closest('[data-more]'); if (more) { expanded.add(more.dataset.more); list(); return; }
    const it = e.target.closest('[data-kind]'); if (it) { addKindAt(it.dataset.kind); setTool('select'); }
  });
  root.addEventListener('dragstart', e => { const it = e.target.closest('[data-kind]'); if (it) e.dataTransfer.setData('text/orim-kind', it.dataset.kind); });
  const stage = document.getElementById('stage');
  stage.addEventListener('drop', e => { const k = e.dataTransfer.getData('text/orim-kind'); if (k) { e.preventDefault(); dropKind(k, e.clientX, e.clientY); setTool('select'); } });
  onKindsChanged(list);
  onViewChanged(syncTools);
  window.addEventListener('themechange', list);
  document.addEventListener('pointerdown', e => { if (!root.contains(e.target)) setShapesOpen(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setShapesOpen(false); });
  list();
  syncTools();
  let pref = null; try { pref = localStorage.getItem('orim.palCollapsed'); } catch (_) {}
  if (pref === '1') setPaletteCollapsed(true);
}

function setShapesOpen(open) {
  if (!root) return;
  root.querySelector('#palShapes').hidden = !open;
  root.querySelector('[data-shapes]').setAttribute('aria-expanded', String(open));
}

function syncTools() {
  if (!root) return;
  for (const b of root.querySelectorAll('[data-k], [data-tool], [data-shapes]')) {
    const on = b.dataset.k ? view.placing === b.dataset.k : b.dataset.tool ? !view.placing && view.tool === b.dataset.tool : !!view.placing && !['note', 'text'].includes(view.placing);
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  }
}

const captioned = k => !!(k && (k.pack || k.category === 'icons'));

function list() {
  if (!root) return;
  root.querySelector('.pal-shape-grid').innerHTML = ['rect', 'ellipse', 'diamond', 'triangle', 'pill', 'hexagon', 'subprocess', 'manual-input', 'delay', 'phone', 'desktop', 'ipad'].filter(getKind).map(k => `<button type="button" data-k="${k}" title="${getKind(k).name}" aria-label="${getKind(k).name}">${kindPreview(k, 38)}</button>`).join('') + '<div class="pal-lines">' + lineButtons() + '</div>';
  const groups = new Map();
  for (const k of allKinds()) {
    if (query && !(`${k.id} ${k.name} ${(k.tags || []).join(' ')} ${k.description || ''}`.toLowerCase().includes(query))) continue;
    const cat = k.learned || lib.learnedIds.has(k.id) ? 'learned' : (k.pack || k.category || 'other');
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(k);
  }
  const cats = [...groups.keys()].sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99));
  const LIMIT = 24;
  root.querySelector('.pal-list').innerHTML = cats.map(c => { const all = groups.get(c), list = query || expanded.has(c) || all.length <= LIMIT + 8 ? all : all.slice(0, LIMIT); return `<div class="pal-cat"><h5>${c === 'learned' ? '★ Learned' : c}<small>${all.length}</small></h5><div class="pal-grid${captioned(all[0]) ? ' captions' : ''}">${list.map(k => `<div class="pal-item${k.learned ? ' learned' : ''}" data-kind="${k.id}" draggable="true" title="${(k.name + ' — ' + (k.description || '')).replace(/"/g, '&quot;')}">${kindPreview(k.id, captioned(k) ? 36 : 44)}${captioned(k) ? `<span class="cap">${k.name.replace(/</g, '&lt;')}</span>` : ''}</div>`).join('')}</div>${list.length < all.length ? `<button class="pal-more" data-more="${c}">Show all ${all.length}</button>` : ''}</div>`; }).join('') || '<p class="muted">No shapes match.</p>';
  syncTools();
}
