// Properties panel. Controls for a kind's params are generated from its schema, so kinds
// the AI invents get an editing UI for free.

import { state, change, onChange, selected } from './store.js';
import { getKind, allKinds } from './kinds.js';
import { SUGGESTED_FONTS, SYSTEM_FONTS, ensureFont, sizeOptions } from './text.js';
import { CAPS } from './render.js';
import { parse as parseColor, hex } from './color.js';
import { deleteSelection, duplicateSelection, reorder, align, editText, groupSelection, ungroupSelection, selectionGroupState } from './editor.js';
import { icon } from './icons.js';

let root;
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function initInspector(el) {
  root = el;
  onChange(what => { if (what === 'doc' || what === 'selection') build(); else sync(); });
  root.addEventListener('input', onInput);
  root.addEventListener('change', onInput);
  root.addEventListener('click', onClick);
}

function getPath(o, path) { let v = o; for (const k of path.split('.')) { if (v == null) return undefined; v = v[k]; } return v; }
function setPath(o, path, val) { const ks = path.split('.'); let v = o; for (const k of ks.slice(0, -1)) { if (v[k] == null || typeof v[k] !== 'object') v[k] = {}; v = v[k]; } if (val === undefined) delete v[ks[ks.length - 1]]; else v[ks[ks.length - 1]] = val; }
// value with kind defaults
function valueOf(el, path) {
  const v = getPath(el, path); if (v !== undefined) return v;
  const kind = getKind(el.kind); if (!kind) return undefined;
  const [sec, key] = path.split('.');
  if (sec === 'params') return kind.params?.[key]?.default;
  if (sec === 'style') return kind.style?.[key];
  if (sec === 'text') return kind.text?.[key];
  return undefined;
}

function docColors() {
  const seen = new Map();
  const add = c => { const p = parseColor(c); if (!p) return; const h = hex({ ...p, a: 1 }); seen.set(h, (seen.get(h) || 0) + 1); };
  add(state.doc.page.background);
  for (const e of state.doc.elements) { const s = e.style || {}; add(s.fill); add(s.fill2); add(s.stroke); add(e.text && e.text.color); }
  return [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(x => x[0]);
}

// ---------- control builders ----------
const num = (path, label, o = {}) => `<label class="f ${o.cls || ''}"><span>${label}</span><input type="number" data-path="${path}" step="${o.step ?? 1}"${o.min != null ? ` min="${o.min}"` : ''}${o.max != null ? ` max="${o.max}"` : ''}></label>`;
const range = (path, label, min, max, step) => `<label class="f wide"><span>${label}</span><input type="range" data-path="${path}" min="${min}" max="${max}" step="${step}"><output data-out="${path}"></output></label>`;
const sel = (path, label, options, cls = '') => `<label class="f ${cls}"><span>${label}</span><select data-path="${path}">${options.map(o => Array.isArray(o) ? `<option value="${esc(o[0])}">${esc(o[1])}</option>` : `<option>${esc(o)}</option>`).join('')}</select></label>`;
const chk = (path, label) => `<label class="chk"><input type="checkbox" data-path="${path}"> ${label}</label>`;
const color = (path, label) => `<div class="f wide color" data-cpath="${path}"><span>${label}</span><div class="crow"><input type="color" data-path="${path}" data-kind="color"><input type="text" data-path="${path}" data-kind="ctext" placeholder="none"><button data-none="${path}" title="No colour">∅</button></div><div class="chips">${docColors().map(c => `<i data-chip="${path}" data-c="${c}" style="background:${c}" title="${c}"></i>`).join('')}</div></div>`;
const seg = (path, opts) => `<div class="seg" data-seg="${path}">${opts.map(([v, l, t]) => `<button data-sv="${v}" title="${t || v}">${l}</button>`).join('')}</div>`;

function build() {
  if (!root || !state.doc) return;
  const sel = selected();
  let h = '';
  if (!sel.length) h = pagePanel();
  else {
    const shapes = sel.filter(e => e.kind !== 'connector'), conns = sel.filter(e => e.kind === 'connector');
    h += `<div class="ins-head"><b>${sel.length === 1 ? esc((getKind(sel[0].kind) || { name: sel[0].kind }).name) : sel.length + ' selected'}</b><span class="acts"><button data-act="dup" title="Duplicate (⌘D)" aria-label="Duplicate">${icon('copy')}</button><button data-act="front" title="Bring to front (⌘])" aria-label="Bring to front">${icon('front')}</button><button data-act="back" title="Send to back (⌘[)" aria-label="Send to back">${icon('back')}</button><button data-act="del" title="Delete" aria-label="Delete">${icon('trash')}</button></span></div>`;
    const gs = selectionGroupState();
    if (gs.canGroup || gs.canUngroup) h += `<section><h4>Group</h4><div class="row">${gs.canGroup ? '<button class="btn" data-act="group" title="Group (⌘G)">Group</button>' : ''}${gs.canUngroup ? '<button class="btn" data-act="ungroup" title="Ungroup (⇧⌘G)">Ungroup</button>' : ''}</div></section>`;
    if (shapes.length > 1) h += `<section><h4>Align</h4><div class="seg">${[['left', '⇤'], ['hcenter', '↔'], ['right', '⇥'], ['top', '⤒'], ['vcenter', '↕'], ['bottom', '⤓'], ['hdist', '⋯'], ['vdist', '⋮']].map(([a, l]) => `<button data-align="${a}" title="${a}">${l}</button>`).join('')}</div></section>`;
    if (shapes.length) h += shapePanel(shapes);
    if (conns.length) h += connectorPanel(conns);
  }
  root.innerHTML = h;
  sync(true);
}

function pagePanel() {
  return `<div class="ins-head"><b>Page</b></div>
  <section><label class="f wide"><span>Name</span><input type="text" data-path="name" data-target="doc"></label>
  <div class="grid2">${num('page.w', 'Width').replace('data-path', 'data-target="doc" data-path')}${num('page.h', 'Height').replace('data-path', 'data-target="doc" data-path')}</div>
  ${color('page.background', 'Background').replace(/data-path=/g, 'data-target="doc" data-path=').replace(/data-none="/, 'data-target="doc" data-none="').replace(/data-chip="/g, 'data-target="doc" data-chip="')}
  </section><section><h4>Pattern</h4>${sel('page.pattern.type', 'Type', ['none', 'dots', 'grid', 'lines']).replace('data-path', 'data-target="doc" data-path')}
  <div class="grid2">${num('page.pattern.gap', 'Spacing', { step: 1 }).replace('data-path', 'data-target="doc" data-path')}${num('page.pattern.size', 'Size', { step: 0.1 }).replace('data-path', 'data-target="doc" data-path')}</div>
  ${color('page.pattern.color', 'Pattern colour').replace(/data-path=/g, 'data-target="doc" data-path=').replace(/data-none="/, 'data-target="doc" data-none="').replace(/data-chip="/g, 'data-target="doc" data-chip="')}</section>
  <section class="hint">Double-click the canvas to write text. Drag a shape's blue dots to connect; click a dot to add a connected copy. Hold space to pan, ⌘/ctrl + scroll to zoom.</section>`;
}

function usesFill2(kinds) { return kinds.some(k => k && /fill2/.test(k.svg || '')); }
function shapePanel(els) {
  const kinds = [...new Set(els.map(e => e.kind))].map(getKind);
  const one = els.length === 1 ? els[0] : null, kind = one ? getKind(one.kind) : null;
  let h = '<section><h4>Layout</h4><div class="grid4">' + num('x', 'X') + num('y', 'Y') + num('w', 'W', { min: 1 }) + num('h', 'H', { min: 1 }) + '</div>' + num('rot', 'Rotate °', { cls: 'wide' }) + '</section>';
  // kind + params
  if (one) {
    const opts = allKinds().filter(k => k.category !== 'icons' || kind?.category === 'icons').map(k => [k.id, k.name + (k.learned ? ' ★' : '')]);
    if (!opts.find(o => o[0] === one.kind)) opts.unshift([one.kind, one.kind]);
    h += `<section><h4>Shape</h4>${sel('kind', 'Kind', [['text', 'Text'], ['image', 'Image'], ...opts], 'wide')}`;
    for (const [key, p] of Object.entries(kind?.params || {})) {
      const path = 'params.' + key, label = p.label || key;
      if (p.type === 'number') h += (p.max != null && p.max - (p.min || 0) <= 2 ? range(path, label, p.min ?? 0, p.max, p.step || 0.01) : num(path, label, { step: p.step || 1, min: p.min, max: p.max, cls: 'wide' }));
      else if (p.type === 'select') h += sel(path, label, p.options, 'wide');
      else if (p.type === 'boolean') h += chk(path, label);
      else if (p.type === 'color') h += color(path, label);
      else h += `<label class="f wide"><span>${esc(label)}</span><input type="text" data-path="${path}"></label>`;
    }
    h += '</section>';
  }
  if (!(one && one.kind === 'image')) {
    h += '<section><h4>Style</h4>' + color('style.fill', 'Fill');
    if (usesFill2(kinds)) h += color('style.fill2', 'Second fill');
    h += color('style.stroke', 'Stroke');
    h += '<div class="grid2">' + num('style.strokeWidth', 'Stroke width', { step: 0.5, min: 0 }) + sel('style.dash', 'Dash', ['solid', 'dashed', 'dotted', 'dashdot']) + '</div>';
    h += range('style.opacity', 'Opacity', 0, 1, 0.01);
    h += `<label class="f wide"><span>Shadow</span><div class="crow">${sel('style.shadow', '', [['', 'none'], ['0 2 4 rgba(0,0,0,0.12)', 'subtle'], ['0 4 8 rgba(0,0,0,0.16)', 'soft'], ['0 8 20 rgba(0,0,0,0.22)', 'large'], ['4 4 0 rgba(0,0,0,1)', 'hard']]).replace('<label class="f "><span></span>', '').replace('</label>', '')}<input type="text" data-path="style.shadow" placeholder="x y blur colour"></div></label>`;
    h += range('style.sketch', 'Hand-drawn', 0, 3, 0.05) + '</section>';
  } else {
    h += '<section><h4>Image</h4>' + color('style.stroke', 'Border') + num('style.strokeWidth', 'Border width', { step: 0.5, min: 0, cls: 'wide' }) + range('style.opacity', 'Opacity', 0, 1, 0.01) + '<button class="btn wide" data-act="replace-img">Replace image…</button></section>';
  }
  h += textPanel();
  return h;
}

function textPanel() {
  const fonts = [...new Set([...SUGGESTED_FONTS, ...SYSTEM_FONTS])];
  return `<section><h4>Text</h4><textarea data-path="text.content" rows="2" placeholder="Double-click the shape to type"></textarea>
  <label class="f wide"><span>Font</span><input type="text" list="fontList" data-path="text.font" placeholder="Inter"></label><datalist id="fontList">${fonts.map(f => `<option value="${f}">`).join('')}</datalist>
  <div class="grid2"><label class="f"><span>Font size</span><select data-path="text.size" aria-label="Font size">${sizeOptions()}</select></label>${sel('text.weight', 'Weight', [['300', 'Light'], ['400', 'Regular'], ['500', 'Medium'], ['600', 'Semibold'], ['700', 'Bold'], ['800', 'Extra bold']])}</div>
  ${color('text.color', 'Colour')}
  <div class="row">${seg('text.align', [['left', '⇤', 'Left'], ['center', '≡', 'Centre'], ['right', '⇥', 'Right']])}${seg('text.valign', [['top', '⤒', 'Top'], ['middle', '↕', 'Middle'], ['bottom', '⤓', 'Bottom']])}</div>
  <div class="grid2">${num('text.lineHeight', 'Line height', { step: 0.05, min: 0.6 })}${num('text.letterSpacing', 'Spacing', { step: 0.1 })}</div>
  <div class="row">${chk('text.italic', 'Italic')}${chk('text.upper', 'CAPS')}${chk('text.vertical', 'Vertical')}</div>
  ${num('text.pad', 'Padding', { step: 1, min: 0, cls: 'wide' })}</section>`;
}

function connectorPanel(els) {
  let h = `<section><h4>Connector</h4>${seg('route', [['straight', '╱', 'Straight'], ['curved', '∿', 'Curved'], ['elbow', '┐', 'Elbow'], ['spline', '〰', 'Spline through points']])}`;
  h += range('bend', 'Curvature', 0, 1.5, 0.01);
  h += '<div class="grid2">' + sel('start', 'Start', CAPS) + sel('end', 'End', CAPS) + '</div>';
  h += '<div class="grid2">' + num('capSize', 'Arrow size', { step: 0.1, min: 0.2 }) + num('radius', 'Corner radius', { min: 0 }) + '</div>';
  h += color('style.stroke', 'Colour');
  h += '<div class="grid2">' + num('style.strokeWidth', 'Width', { step: 0.5, min: 0.5 }) + sel('style.dash', 'Dash', ['solid', 'dashed', 'dotted']) + '</div>';
  h += range('style.sketch', 'Hand-drawn', 0, 3, 0.05);
  h += `<button class="btn wide" data-act="flip">Swap ends</button><button class="btn wide" data-act="clearpts">Remove bend points</button></section>`;
  h += `<section><h4>Label</h4><input type="text" data-path="text.content" placeholder="Double-click the line"><div class="grid2"><label class="f"><span>Font size</span><select data-path="text.size" aria-label="Label font size">${sizeOptions(14, false)}</select></label>${num('labelPos', 'Position', { step: 0.05, min: 0, max: 1 })}</div>${color('text.color', 'Colour')}</section>`;
  return h;
}

// ---------- sync values ----------
const FALLBACKS = { rot: 0, route: 'straight', bend: 0.5, labelPos: 0.5, 'style.opacity': 1, 'style.sketch': 0, 'style.dash': 'solid', start: 'none', end: 'none', capSize: 1, radius: 8, 'text.size': 16, 'text.weight': 400, 'text.lineHeight': 1.25, 'text.letterSpacing': 0, 'text.pad': 0, 'page.pattern.type': 'none' };
function targets(input) { return input.dataset.target === 'doc' ? [state.doc] : selected(); }
function sync(force) {
  if (!root || !state.doc) return;
  for (const input of root.querySelectorAll('[data-path]')) {
    if (!force && document.activeElement === input) continue;
    const t = targets(input)[0]; if (!t) continue;
    const path = input.dataset.path;
    let v = input.dataset.target === 'doc' ? getPath(t, path) : valueOf(t, path);
    if (path === 'text.size' && input.tagName === 'SELECT') {
      v = t.text?.autoSize ? 'auto' : v ?? 16;
      if (!input.querySelector(`option[value="${v}"]`) && Number.isFinite(+v) && +v > 0) input.add(new Option(v, v));
    }
    if (v == null && path in FALLBACKS) v = FALLBACKS[path];
    if (v == null && input.type === 'range') v = +input.min;
    if (input.type === 'checkbox') input.checked = !!v;
    else if (input.dataset.kind === 'color') { const p = parseColor(v); input.value = p ? hex({ ...p, a: 1 }) : '#ffffff'; input.style.opacity = p ? 1 : 0.35; }
    else if (input.type === 'number') input.value = v == null ? '' : Math.round(+v * 100) / 100;
    else if (input.tagName === 'SELECT') { input.value = v == null ? (input.options[0]?.value ?? '') : String(v); }
    else input.value = v == null ? '' : v;
    const out = root.querySelector(`[data-out="${path}"]`); if (out) out.textContent = v == null ? '' : (Math.round(+v * 100) / 100);
  }
  for (const s of root.querySelectorAll('[data-seg]')) {
    const t = selected()[0]; if (!t) continue;
    const v = valueOf(t, s.dataset.seg) ?? (s.dataset.seg === 'route' ? 'straight' : s.dataset.seg === 'text.align' ? 'center' : s.dataset.seg === 'text.valign' ? 'middle' : undefined);
    for (const b of s.querySelectorAll('button')) b.classList.toggle('on', b.dataset.sv === String(v));
  }
}

function coerce(input, path) {
  if (input.type === 'checkbox') return input.checked;
  if (input.type === 'number' || input.type === 'range') return input.value === '' ? undefined : +input.value;
  if (path === 'text.weight' || (path === 'text.size' && input.value !== 'auto')) return +input.value;
  if (input.dataset.kind === 'ctext') return input.value.trim() || 'none';
  return input.value;
}

function apply(path, val, tgt) {
  const ts = tgt === 'doc' ? [state.doc] : selected();
  change(() => {
    for (const t of ts) {
      if (path.startsWith('params.')) { const k = getKind(t.kind); if (!k || !k.params || !(path.slice(7) in k.params)) continue; }
      if (path === 'kind') { convertKind(t, val); continue; }
      if (t.kind === 'ipad' && path === 'params.orientation' && ((val === 'landscape' && t.w < t.h) || (val === 'portrait' && t.w > t.h))) [t.w, t.h] = [t.h, t.w];
      if (path === 'page.pattern.type' && !t.page.pattern) t.page.pattern = { gap: 24, size: 1.6, color: '#c8cdd4' };
      if (t.kind === 'connector' && path.startsWith('text.') && !t.text) t.text = {};
      if (path === 'text.size') {
        t.text = { ...t.text, autoSize: val === 'auto', ...(val === 'auto' ? {} : { size: val }) };
        continue;
      }
      setPath(t, path, val);
      if (path === 'text.font' && val) ensureFont(val);
    }
  });
}
function convertKind(el, kindId) {
  const k = getKind(kindId); if (!k) return;
  el.kind = kindId;
  const params = {}; for (const [key, p] of Object.entries(k.params || {})) params[key] = el.params?.[key] ?? p.default;
  el.params = params;
}

function onInput(e) {
  const input = e.target, path = input.dataset.path; if (!path) return;
  if (e.type === 'input' && (input.tagName === 'SELECT' || input.type === 'checkbox')) return;
  if (e.type === 'change' && (input.type === 'text' || input.tagName === 'TEXTAREA') && input.dataset.kind !== 'ctext' && path !== 'text.font') return;
  if (e.type === 'input' && input.dataset.kind === 'ctext') return;
  if (e.type === 'input' && path === 'text.font') return;
  const val = coerce(input, path);
  apply(path, val, input.dataset.target);
  const out = root.querySelector(`[data-out="${path}"]`); if (out) out.textContent = val;
}

function onClick(e) {
  const b = e.target.closest('button, i[data-chip]'); if (!b) return;
  const tgt = b.dataset.target;
  if (b.dataset.none) { apply(b.dataset.none, 'none', tgt); sync(true); return; }
  if (b.dataset.chip) { apply(b.dataset.chip, b.dataset.c, tgt); sync(true); return; }
  if (b.dataset.sv) { const path = b.closest('[data-seg]').dataset.seg; apply(path, b.dataset.sv); sync(true); return; }
  if (b.dataset.align) { align(b.dataset.align); return; }
  switch (b.dataset.act) {
    case 'del': deleteSelection(); break;
    case 'dup': duplicateSelection(); break;
    case 'group': groupSelection(); break;
    case 'ungroup': ungroupSelection(); break;
    case 'front': reorder('front'); break;
    case 'back': reorder('back'); break;
    case 'flip': change(() => { for (const c of selected()) if (c.kind === 'connector') { [c.from, c.to] = [c.to, c.from]; if (c.points) c.points.reverse(); } }); break;
    case 'clearpts': change(() => { for (const c of selected()) if (c.kind === 'connector') { delete c.points; delete c.elbowOffset; } }); break;
    case 'replace-img': pickImage(src => change(() => { for (const el of selected()) if (el.kind === 'image') el.props = { ...(el.props || {}), src }; })); break;
    case 'edit': editText(selected()[0]?.id); break;
  }
}

export function pickImage(cb) {
  const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*';
  i.onchange = () => { const f = i.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => cb(r.result, f); r.readAsDataURL(f); };
  i.click();
}
