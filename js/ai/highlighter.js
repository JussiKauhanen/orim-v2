// Request annotations live in their own SVG layer, outside document data/exports.
import { state, onChange, clearSelection } from '../store.js';
import { cam, view, setTool, onViewChanged } from '../editor.js';

export function initHighlighter(stage, { onUpdate = () => {} } = {}) {
  const svg = stage.querySelector('#canvas'), layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  layer.id = 'aiMarks'; layer.setAttribute('pointer-events', 'none'); svg.querySelector('#world').appendChild(layer);
  const drafts = new Map(); let docId, strokes = [], active = false, drawing = null, space = false;
  function paint() {
    layer.innerHTML = strokes.map(s => `<path d="${s.points.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ')}${s.points.length === 1 ? 'l.01 0' : ''}" fill="none" stroke="#ffd52a" stroke-width="${s.width}" stroke-opacity=".4" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
    onUpdate();
  }
  function setActive(value) {
    if (value) { setTool('select'); clearSelection(); }
    active = value; drawing = null; svg.style.cursor = value ? 'crosshair' : view.tool === 'hand' ? 'grab' : '';
    stage.classList.toggle('highlighting', value); onUpdate();
  }
  const point = e => { const r = svg.getBoundingClientRect(); return [(e.clientX - r.left) / cam.z + cam.x, (e.clientY - r.top) / cam.z + cam.y]; };
  svg.addEventListener('pointerdown', e => {
    if (!active || space || e.button !== 0 || !state.doc) return;
    e.preventDefault(); e.stopImmediatePropagation();
    drawing = { width: 22 / cam.z, points: [point(e)] }; strokes.push(drawing);
    svg.setPointerCapture(e.pointerId); paint();
  }, true);
  svg.addEventListener('dblclick', e => { if (active) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  svg.addEventListener('pointermove', e => {
    if (!drawing) { if (active && !space) e.stopImmediatePropagation(); return; }
    e.preventDefault(); e.stopImmediatePropagation();
    const p = point(e), last = drawing.points.at(-1);
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) * cam.z >= 2) { drawing.points.push(p); paint(); }
  }, true);
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) svg.addEventListener(event, e => {
    if (!drawing) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (event === 'pointercancel') strokes.pop(); drawing = null; paint();
  }, true);
  window.addEventListener('keydown', e => { if (e.code === 'Space') space = true; if (e.key === 'Escape' && active) setActive(false); });
  window.addEventListener('keyup', e => { if (e.code === 'Space') { space = false; if (active) svg.style.cursor = 'crosshair'; } });
  window.addEventListener('blur', () => { space = false; drawing = null; });
  onViewChanged(() => { if (active && (view.tool !== 'select' || view.placing)) setActive(false); });
  onChange(() => {
    if (state.doc?.id === docId) return;
    setActive(false); docId = state.doc?.id;
    if (!drafts.has(docId)) drafts.set(docId, []);
    strokes = drafts.get(docId); paint();
  });
  return { setActive, toggle: () => setActive(!active), active: () => active, count: () => strokes.length,
    snapshot: () => strokes.map(s => ({ width: s.width, points: s.points.map(p => [...p]) })),
    undo() { strokes.pop(); paint(); }, clear() { strokes.splice(0); paint(); } };
}
