// Left panel: every kind (built-in and learned) with a live preview. Click to place, drag to drop.

import { allKinds, onKindsChanged, getKind } from './kinds.js';
import { elementSvg } from './render.js';
import { makeElement } from './store.js';
import { addKindAt, dropKind, setPlacing } from './editor.js';
import { lib } from './library.js';

const ORDER = ['learned', 'basic', 'flowchart', 'containers', 'wireframe', 'icons', 'decor'];
let root, query = '';
const expanded = new Set();
let collapsed = false, autoCollapsed = false;
// Collapsed = a thin Miro-style rail with the quick tools; remembered per browser.
export function setPaletteCollapsed(v, { auto = false } = {}) {
  collapsed = v; autoCollapsed = v && auto;
  document.getElementById('app').classList.toggle('pal-collapsed', v);
  if (root) root.querySelector('.pal-toggle').textContent = v ? '»' : '«';
  if (!auto) try { localStorage.setItem('orim.palCollapsed', v ? '1' : '0'); } catch (_) {}
  window.dispatchEvent(new Event('resize'));
}
export const paletteAutoCollapsed = () => autoCollapsed;
export const paletteCollapsed = () => collapsed;

export function kindPreview(kindId, size = 44, override) {
  const k = getKind(kindId); if (!k) return '';
  const el = makeElement(kindId, override);
  const [w, h] = k.size || [100, 60];
  const s = Math.min((size - 6) / w, (size - 6) / h);
  el.w = w; el.h = h; el.x = 0; el.y = 0; el.id = 'pv-' + kindId;
  if (kindId !== 'text') el.text = { ...el.text, content: '' };
  const pad = 3 / s;
  return `<svg viewBox="${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">${elementSvg(el, { elements: [el], byId: new Map([[el.id, el]]), page: { background: '#fff' } })}</svg>`;
}

export function initPalette(el) {
  root = el;
  root.innerHTML = `<button class="pal-toggle" title="Collapse or expand the shapes panel">«</button><div class="pal-search"><input type="search" placeholder="Search shapes…" id="palSearch"></div><div class="pal-quick"><button data-k="text" title="Text (T)">T</button><button data-k="rect" title="Rectangle (R)">▭</button><button data-k="ellipse" title="Ellipse (O)">◯</button><button data-k="diamond" title="Diamond (D)">◇</button><button data-k="note" title="Sticky (N)">▢</button><button data-img="1" title="Image">🖼</button><button data-expand="1" class="only-rail" title="All shapes and icons">⊞</button></div><div class="pal-list"></div>`;
  root.querySelector('#palSearch').addEventListener('input', e => { query = e.target.value.trim().toLowerCase(); list(); });
  root.addEventListener('click', e => {
    if (e.target.closest('.pal-toggle')) { setPaletteCollapsed(!collapsed); return; }
    if (e.target.closest('[data-expand]')) { setPaletteCollapsed(false); root.querySelector('#palSearch')?.focus(); return; }
    const b = e.target.closest('[data-k]'); if (b) { setPlacing(b.dataset.k); return; }
    if (e.target.closest('[data-img]')) import('./inspector.js').then(m => m.pickImage((src) => { const img = new Image(); img.onload = () => { const s = Math.min(1, 400 / Math.max(img.width, img.height)); addKindAt('image', null, null, { w: img.width * s, h: img.height * s, props: { src } }); }; img.src = src; }));
    const more = e.target.closest('[data-more]'); if (more) { expanded.add(more.dataset.more); list(); return; }
    const it = e.target.closest('[data-kind]'); if (it) addKindAt(it.dataset.kind);
  });
  root.addEventListener('dragstart', e => { const it = e.target.closest('[data-kind]'); if (it) e.dataTransfer.setData('text/orim-kind', it.dataset.kind); });
  const stage = document.getElementById('stage');
  stage.addEventListener('drop', e => { const k = e.dataTransfer.getData('text/orim-kind'); if (k) { e.preventDefault(); dropKind(k, e.clientX, e.clientY); } });
  onKindsChanged(list);
  list();
  let pref = null; try { pref = localStorage.getItem('orim.palCollapsed'); } catch (_) {}
  if (pref === '1') setPaletteCollapsed(true);
}

const captioned = k => !!(k && (k.pack || k.category === 'icons'));

function list() {
  if (!root) return;
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
}
