// Small selection controls. All edits go through the existing undo/autosave paths.
import { state, selected, onChange, change, undo, redo } from './store.js';
import { cam, view, onViewChanged, duplicateSelection, deleteSelection, reorder, editText } from './editor.js';
import { bounds, unionBounds } from './geom.js';
import { getKind } from './kinds.js';
import { parse, hex } from './color.js';
import { CAPS } from './render.js';
import { icon } from './icons.js';

const paths = {
  fill: '<path d="m7 4 11 11-7 6L1 11 8 4m-3 11h12M19 11s3 4 3 6a3 3 0 0 1-6 0c0-2 3-6 3-6Z"/>',
  stroke: '<path d="M4 18 18 4l3 3L7 21H4v-3Z"/><path d="m15 7 3 3"/>',
  bold: '<path d="M7 4h6a4 4 0 0 1 0 8H7m0 0h7a4 4 0 0 1 0 8H7V4"/>',
  textColor: '<path d="m6 16 6-12 6 12M9 11h6M4 21h16"/>',
  align: '<path d="M4 5h16M4 10h10M4 15h16M4 20h10"/>',
  layers: '<path d="m3 8 9-5 9 5-9 5-9-5Zm0 5 9 5 9-5M3 18l9 5 9-5"/>',
};
const glyph = name => paths[name] ? `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>` : icon(name);
const button = (act, name, label, extra = '') => `<button type="button" data-act="${act}" title="${label}" aria-label="${label}" ${extra}>${glyph(name)}</button>`;
const COLORS = ['#ffffff', '#1f2328', '#6a737d', '#f4d35e', '#f5a3b4', '#f07860', '#a7cfa4', '#5dc7c2', '#7b9bed', '#be9de8'];
const common = values => values.every(v => v === values[0]) ? values[0] : null;
const editable = el => !el.ghost && !!getKind(el.kind);
const canFill = el => editable(el) && !['text', 'image', 'connector'].includes(el.kind) && !getKind(el.kind).fixedColors;
const canStroke = el => editable(el) && el.kind !== 'text' && !getKind(el.kind).fixedColors;
const canText = el => editable(el) && el.kind !== 'image';
const valueOf = (el, section, key) => el[section]?.[key] ?? getKind(el.kind)?.[section]?.[key] ?? ({ size: el.kind === 'connector' ? 14 : 16, weight: 400, align: 'center', color: el.kind === 'connector' ? el.style?.stroke || '#1f2328' : '#1f2328' })[key];

export function initContextToolbar(stage, { onProperties } = {}) {
  const toolbar = document.createElement('div');
  toolbar.id = 'contextToolbar'; toolbar.className = 'context-toolbar'; toolbar.hidden = true;
  toolbar.setAttribute('role', 'toolbar'); toolbar.setAttribute('aria-label', 'Selection editing');
  stage.appendChild(toolbar);
  let frame = 0, signature = '', popup = null;

  function schedule() { if (!frame) frame = requestAnimationFrame(update); }
  function closePopup() { if (popup) popup.hidden = true; popup = null; }
  function commitInlineText() { const input = stage.querySelector('#textEd'); if (input && !input.hidden) input.blur(); }
  function colorTargets(key) { return selected().filter(key === 'fill' ? canFill : key === 'stroke' ? canStroke : canText); }
  function colorValue(key) {
    return common(colorTargets(key).map(el => key === 'textColor' ? valueOf(el, 'text', 'color') : valueOf(el, 'style', key))) || 'none';
  }
  function update() {
    cancelAnimationFrame(frame); frame = 0;
    const els = selected(), r = stage.getBoundingClientRect();
    if (!els.length || !r.width || view.locked || view.mode === 'source') { toolbar.hidden = true; closePopup(); return; }
    const fill = els.some(canFill), stroke = els.some(canStroke), text = els.some(canText);
    const formatText = text && els.some(el => canText(el) && (el.kind === 'text' || el.text?.content));
    const lines = els.some(el => el.kind === 'connector');
    const next = JSON.stringify([els.map(el => el.id), fill, stroke, text, formatText, lines]);
    if (next !== signature) {
      closePopup(); signature = next;
      const colorButton = (key, label) => button('color-' + key, key, label, `class="ctx-color" data-color="${key}"`).replace('</button>', '<span class="ctx-swatch"></span></button>');
      const select = (key, label, options) => `<select data-field="${key}" aria-label="${label}" title="${label}"><option value="" disabled>${label}</option>${options.map(([v, name]) => `<option value="${v}">${name}</option>`).join('')}</select>`;
      toolbar.innerHTML = `<div class="ctx-controls">${els.length > 1 ? `<span class="ctx-count">${els.length}</span>` : ''}${fill ? colorButton('fill', 'Fill color') : ''}${stroke ? colorButton('stroke', 'Stroke color') : ''}${formatText ? colorButton('textColor', 'Text color') + '<span class="ctx-separator"></span><input type="number" data-field="size" min="6" max="240" step="1" aria-label="Text size" title="Text size">' + button('bold', 'bold', 'Bold', 'aria-pressed="false"') + select('align', 'Text alignment', [['left', 'Left'], ['center', 'Center'], ['right', 'Right']]) : ''}${text && els.length === 1 ? button('edit', 'text', els[0].text?.content ? 'Edit text' : 'Add text') : ''}${lines ? '<span class="ctx-separator"></span>' + select('route', 'Line route', [['straight', 'Straight'], ['curved', 'Curved'], ['elbow', 'Elbow'], ['spline', 'Spline']]) + select('start', 'Start cap', CAPS.map(c => [c, c === 'none' ? 'Start: none' : 'Start: ' + c])) + select('end', 'End cap', CAPS.map(c => [c, c === 'none' ? 'End: none' : 'End: ' + c])) : ''}<span class="ctx-separator"></span>${button('duplicate', 'copy', 'Duplicate')}${button('layers', 'layers', 'Layers')}${button('delete', 'trash', 'Delete', 'class="ctx-delete"')}<span class="ctx-separator"></span>${button('properties', 'panel-open', 'Properties')}</div><div class="ctx-popup ctx-colors" hidden><div class="ctx-color-grid">${COLORS.map(c => `<button type="button" data-value="${c}" title="${c}" aria-label="${c}" style="background:${c}"></button>`).join('')}</div><div class="ctx-color-custom"><button type="button" data-value="none">No color</button><label>Custom<input type="color" aria-label="Custom color"></label></div></div><div class="ctx-popup ctx-layers" hidden>${button('front', 'front', 'Bring to front')}<span>Bring to front</span>${button('back', 'back', 'Send to back')}<span>Send to back</span></div>`;
      // The row itself is clickable as well as the layer icon.
      toolbar.querySelectorAll('.ctx-layers span').forEach(label => { label.dataset.act = label.previousElementSibling.dataset.act; });
    }
    toolbar.hidden = false;
    for (const b of toolbar.querySelectorAll('button[data-color]')) {
      const c = parse(colorValue(b.dataset.color));
      b.querySelector('.ctx-swatch').style.background = c ? hex(c) : '';
      b.classList.toggle('is-none', !c);
    }
    const textEls = els.filter(canText), connectors = els.filter(el => el.kind === 'connector');
    for (const input of toolbar.querySelectorAll('[data-field]')) {
      if (document.activeElement === input) continue;
      const key = input.dataset.field;
      const v = ['size', 'align'].includes(key) ? common(textEls.map(el => valueOf(el, 'text', key))) : common(connectors.map(el => el[key] ?? (key === 'route' ? 'straight' : key === 'end' ? 'arrow' : 'none')));
      input.value = v ?? ''; if (input.type === 'number') input.placeholder = v == null ? '–' : '';
    }
    const bold = toolbar.querySelector('[data-act="bold"]');
    if (bold) { const weights = textEls.map(el => valueOf(el, 'text', 'weight') >= 600); bold.setAttribute('aria-pressed', common(weights) == null ? 'mixed' : String(weights[0])); }
    position();
  }
  function position() {
    const els = selected(); if (!els.length || toolbar.hidden) return;
    const b = unionBounds(els.map(el => bounds(el, state.doc))), r = stage.getBoundingClientRect(); if (!b || !r.width) return;
    const w = toolbar.offsetWidth, h = toolbar.offsetHeight, gap = 12;
    const clamp = (v, max) => Math.max(8, Math.min(v, Math.max(8, max - 8)));
    let x = clamp((b.x + b.w / 2 - cam.x) * cam.z - w / 2, r.width - w);
    let y = (b.y - cam.y) * cam.z - h - gap;
    if (y < 8) y = (b.y + b.h - cam.y) * cam.z + gap;
    y = clamp(y, r.height - h);
    const blockers = [...stage.querySelectorAll('.minimap, #aiLauncher, #aiPill')].filter(el => !el.hidden).map(el => el.getBoundingClientRect()).filter(br => br.width && br.height).sort((a, b) => b.top - a.top);
    for (const br of blockers) {
      const left = br.left - r.left, top = br.top - r.top;
      if (x < left + br.width + 8 && x + w > left - 8 && y < top + br.height + 8 && y + h > top - 8) {
        if (top - h - gap >= 8) y = top - h - gap;
        else if (left - w - gap >= 8) x = left - w - gap;
        else y = 8;
      }
    }
    toolbar.style.left = x + 'px'; toolbar.style.top = y + 'px';
    if (popup) {
      const pw = popup.offsetWidth, ph = popup.offsetHeight;
      popup.style.left = Math.max(8 - x, Math.min(0, r.width - x - pw - 8)) + 'px';
      popup.classList.toggle('above', y + h + ph + 8 > r.height && y - ph - 8 >= 0);
    }
  }
  function openPopup(element) { const wasOpen = popup === element; closePopup(); if (!wasOpen) { popup = element; popup.hidden = false; position(); } }
  function applyColor(value) {
    const key = popup?.dataset.color; if (!key) return;
    change(() => { for (const el of colorTargets(key)) {
      if (key === 'textColor') el.text = { ...el.text, color: value };
      else { el.style = { ...el.style, [key]: value }; if (key === 'stroke' && value !== 'none' && !valueOf(el, 'style', 'strokeWidth')) el.style.strokeWidth = 1; }
    } });
    if (popup) popup.querySelector('input').value = value === 'none' ? '#ffffff' : value;
    schedule();
  }
  toolbar.addEventListener('pointerdown', e => {
    e.stopPropagation();
    // Keep the inline editor focused until the action's click has been received.
    if (e.target.closest('button')) e.preventDefault();
  });
  toolbar.addEventListener('click', e => {
    const target = e.target.closest('[data-act], [data-value]'); if (!target) return;
    const act = target.dataset.act, color = target.dataset.value;
    commitInlineText(); update();
    if (color) { applyColor(color); return; }
    if (act.startsWith('color-')) {
      const key = act.slice(6), pop = toolbar.querySelector('.ctx-colors'); pop.dataset.color = key;
      pop.querySelector('[data-value="none"]').hidden = key === 'textColor';
      const c = parse(colorValue(key)); pop.querySelector('input').value = c ? hex({ ...c, a: 1 }) : '#ffffff';
      openPopup(pop); return;
    }
    if (act === 'layers') { openPopup(toolbar.querySelector('.ctx-layers')); return; }
    closePopup();
    if (act === 'duplicate') duplicateSelection();
    else if (act === 'delete') deleteSelection();
    else if (act === 'front' || act === 'back') reorder(act);
    else if (act === 'properties') onProperties?.();
    else if (act === 'edit') editText(selected()[0]?.id);
    else if (act === 'bold') { const weight = selected().filter(canText).every(el => valueOf(el, 'text', 'weight') >= 600) ? 400 : 700; change(() => { for (const el of selected().filter(canText)) el.text = { ...el.text, weight }; }); }
  });
  toolbar.addEventListener('change', e => {
    if (e.target.type === 'color') { applyColor(e.target.value); return; }
    const field = e.target.dataset.field; if (!field) return;
    commitInlineText();
    let val = e.target.value;
    if (field === 'size') { if (val === '' || !Number.isFinite(+val)) return; val = Math.max(6, Math.min(240, +val)); e.target.value = val; }
    change(() => { for (const el of selected()) {
      if (['size', 'align'].includes(field) && canText(el)) el.text = { ...el.text, [field]: val };
      else if (el.kind === 'connector' && ['route', 'start', 'end'].includes(field)) el[field] = val;
    } });
  });
  toolbar.addEventListener('keydown', e => {
    e.stopPropagation();
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) {
      e.preventDefault(); e.shiftKey ? redo() : undo(); return;
    }
    if (e.key === 'Escape') { closePopup(); toolbar.querySelector('button')?.focus(); }
  });
  document.addEventListener('pointerdown', e => { if (!toolbar.contains(e.target)) closePopup(); });
  toolbar.addEventListener('focusout', schedule);
  onChange(schedule); onViewChanged(schedule); window.addEventListener('themechange', schedule);
  new ResizeObserver(schedule).observe(stage);
  return { refresh: schedule };
}
