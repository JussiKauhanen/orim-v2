// A small manual drawing picker, shared with the shape rail's line tools.
import { getKind } from './kinds.js';
import { makeElement } from './store.js';
import { elementSvg } from './render.js';
import { displayElement } from './theme.js';
import { icon } from './icons.js';

export const LINE_TOOLS = [
  ['line', 'Line', 'straight', 'none', 'M4 20 24 4'],
  ['arrow', 'Arrow', 'straight', 'arrow', 'M4 20 24 4M15 4h9v9'],
  ['elbow', 'Elbow arrow', 'elbow', 'arrow', 'M4 20h10V5h10M19 1l5 4-5 4'],
  ['curved', 'Curved arrow', 'curved', 'arrow', 'M4 20C4 5 24 22 24 4M19 8l5-4 2 6'],
];
export const lineButtons = () => LINE_TOOLS.map(([id, name, , , path]) => `<button type="button" data-line="${id}" title="${name}" aria-label="${name}"><svg viewBox="0 0 28 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg><span>${name}</span></button>`).join('');

export function initQuickInsert(stage, { onShape, onLine }) {
  const picker = document.createElement('div'); picker.id = 'quickInsert'; picker.className = 'quick-insert'; picker.hidden = true;
  picker.setAttribute('role', 'dialog'); picker.setAttribute('aria-label', 'Insert a shape or line');
  stage.appendChild(picker);
  let point = [0, 0];
  function close() { picker.hidden = true; }
  function open(clientX, clientY, wx, wy) {
    point = [wx, wy];
    const shapes = [['rect', 'Rectangle'], ['rounded', 'Rounded rectangle'], ['ellipse', 'Ellipse'], ['diamond', 'Diamond'], ['note', 'Sticky note'], ['text', 'Text'], ['subprocess', 'Subprocess'], ['manual-input', 'Manual input'], ['delay', 'Delay'], ['cylinder', 'Database'], ['desktop', 'Desktop'], ['ipad', 'iPad']];
    picker.innerHTML = '<div class="quick-insert-title">Shapes &amp; lines</div><div class="quick-shapes">' + shapes.filter(([id]) => getKind(id === 'rounded' ? 'rect' : id)).map(([id, name]) => {
      if (id === 'text') return `<button type="button" data-shape="text" title="Text" aria-label="Text">${icon('text')}</button>`;
      const kind = getKind(id === 'rounded' ? 'rect' : id), el = makeElement(kind.id, id === 'rounded' ? { params: { radius: 16 } } : {});
      el.x = el.y = 0; el.text.content = '';
      const shown = document.documentElement.dataset.theme === 'dark' ? displayElement(el) : el;
      return `<button type="button" data-shape="${id}" title="${name}" aria-label="${name}"><svg viewBox="-6 -6 ${el.w + 12} ${el.h + 12}" aria-hidden="true">${elementSvg(shown, { elements: [shown], page: { background: '#fff' } })}</svg></button>`;
    }).join('') + '</div><div class="quick-lines">' + lineButtons() + '</div><small>Choose a shape, or choose a line and drag.</small>';
    picker.hidden = false;
    const r = stage.getBoundingClientRect();
    picker.style.left = Math.max(8, Math.min(clientX - r.left, r.width - picker.offsetWidth - 8)) + 'px';
    picker.style.top = Math.max(8, Math.min(clientY - r.top, r.height - picker.offsetHeight - 8)) + 'px';
    picker.querySelector('button')?.focus({ preventScroll: true });
  }
  picker.addEventListener('click', e => {
    const shape = e.target.closest('[data-shape]'), line = e.target.closest('[data-line]');
    if (!shape && !line) return;
    close();
    if (shape) { const id = shape.dataset.shape; onShape(id === 'rounded' ? 'rect' : id, ...point, id === 'rounded' ? { params: { radius: 16 } } : {}); }
    else { const [, , route, end] = LINE_TOOLS.find(t => t[0] === line.dataset.line); onLine(route, end); }
  });
  picker.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); stage.querySelector('#canvas').focus({ preventScroll: true }); }
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault(); e.stopPropagation(); const buttons = [...picker.querySelectorAll('button')], index = buttons.indexOf(document.activeElement);
      const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -4, ArrowDown: 4 }[e.key];
      buttons[(index + delta + buttons.length) % buttons.length].focus();
    }
  });
  document.addEventListener('pointerdown', e => { if (!picker.contains(e.target)) close(); });
  return { open, close };
}
