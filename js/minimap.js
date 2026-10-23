// A small, persistent overview. Its frame stays fixed during a navigation drag.
import { state, onChange } from './store.js';
import { bounds, unionBounds, connectorPoints } from './geom.js';
import { displayDoc } from './theme.js';
import { icon } from './icons.js';

export function initMinimap(stage, { cam, view, applyCamera, onViewChanged, beforeNavigate }) {
  const W = 180, H = 112;
  const panel = document.createElement('div'); panel.className = 'minimap';
  panel.innerHTML = `<button class="minimap-toggle" type="button" aria-controls="minimapCanvas" aria-expanded="true">${icon('map')}<span>Overview</span>${icon('collapse', 'minimap-chevron')}</button><canvas id="minimapCanvas" width="${W}" height="${H}" tabindex="0" role="img" aria-label="Diagram overview. Click or drag to navigate; use arrow keys to pan."></canvas>`;
  stage.appendChild(panel);
  const canvas = panel.querySelector('canvas'), toggle = panel.querySelector('button');
  let frame = 0, map = null, dragging = false;
  let collapsed = false;
  try { collapsed = localStorage.getItem('orim.minimapHidden') === 'true'; } catch (_) {}

  function setCollapsed(value) {
    collapsed = value; canvas.hidden = value;
    toggle.setAttribute('aria-expanded', String(!value));
    toggle.title = value ? 'Show overview' : 'Hide overview';
    panel.classList.toggle('collapsed', value);
    try { localStorage.setItem('orim.minimapHidden', String(value)); } catch (_) {}
    schedule();
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(draw); }
  function draw() {
    frame = 0;
    if (!state.doc || collapsed || !stage.getBoundingClientRect().width) return;
    const doc = displayDoc(state.doc, view.mode === 'diagram'), r = stage.getBoundingClientRect();
    const viewport = { x: cam.x, y: cam.y, w: r.width / cam.z, h: r.height / cam.z };
    const visible = doc.elements.filter(e => !e.hidden);
    const all = unionBounds([{ x: 0, y: 0, w: doc.page.w, h: doc.page.h }, viewport, ...visible.map(e => bounds(e, doc))]);
    if (!dragging || !map) {
      const pad = Math.max(20, Math.min(all.w, all.h) * 0.04);
      const s = Math.min((W - 12) / (all.w + pad * 2), (H - 12) / (all.h + pad * 2));
      map = { s, ox: (W - all.w * s) / 2 - all.x * s, oy: (H - all.h * s) / 2 - all.y * s };
    }
    const { s, ox, oy } = map, X = x => x * s + ox, Y = y => y * s + oy;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(panel), accent = css.getPropertyValue('--accent').trim() || '#4f6bff';
    const muted = css.getPropertyValue('--muted').trim() || '#6a737d';
    ctx.fillStyle = css.getPropertyValue('--stage').trim() || '#eceef1'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = doc.page.background || '#ffffff';
    ctx.fillRect(X(0), Y(0), doc.page.w * s, doc.page.h * s);
    ctx.strokeStyle = css.getPropertyValue('--line2').trim() || '#d3d8de'; ctx.lineWidth = 0.75;
    ctx.strokeRect(X(0), Y(0), doc.page.w * s, doc.page.h * s);
    for (const el of visible) {
      ctx.fillStyle = el.style?.fill && el.style.fill !== 'none' ? el.style.fill : muted;
      ctx.strokeStyle = el.style?.stroke && el.style.stroke !== 'none' ? el.style.stroke : muted;
      if (el.kind === 'connector') {
        const points = connectorPoints(el, doc).pts;
        ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))); ctx.stroke();
      } else {
        const b = bounds(el, doc);
        ctx.globalAlpha = el.kind === 'text' ? 0.45 : 0.8;
        ctx.fillRect(X(b.x), Y(b.y), Math.max(1, b.w * s), Math.max(1, b.h * s));
        ctx.strokeRect(X(b.x), Y(b.y), Math.max(1, b.w * s), Math.max(1, b.h * s));
        ctx.globalAlpha = 1;
      }
    }
    ctx.fillStyle = accent; ctx.globalAlpha = 0.1;
    ctx.fillRect(X(viewport.x), Y(viewport.y), viewport.w * s, viewport.h * s);
    ctx.globalAlpha = 1; ctx.strokeStyle = accent; ctx.lineWidth = 1.5;
    ctx.strokeRect(X(viewport.x), Y(viewport.y), viewport.w * s, viewport.h * s);
  }
  function point(e) {
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) * W / r.width - map.ox) / map.s, ((e.clientY - r.top) * H / r.height - map.oy) / map.s];
  }
  function navigate(e) {
    if (!map) return;
    const [x, y] = point(e), r = stage.getBoundingClientRect();
    cam.x = x - r.width / cam.z / 2; cam.y = y - r.height / cam.z / 2;
    applyCamera();
  }
  function finish() { dragging = false; schedule(); }
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0 || !map) return;
    e.preventDefault(); beforeNavigate(); canvas.focus({ preventScroll: true });
    dragging = true; canvas.setPointerCapture(e.pointerId); navigate(e);
  });
  canvas.addEventListener('pointermove', e => { if (dragging) navigate(e); });
  canvas.addEventListener('pointerup', finish); canvas.addEventListener('pointercancel', finish); canvas.addEventListener('lostpointercapture', finish);
  canvas.addEventListener('keydown', e => {
    const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (!directions[e.key] || !state.doc) return;
    e.preventDefault(); e.stopPropagation(); beforeNavigate();
    const [dx, dy] = directions[e.key], step = (e.shiftKey ? 160 : 50) / cam.z;
    cam.x += dx * step; cam.y += dy * step; applyCamera();
  });
  toggle.addEventListener('click', () => setCollapsed(!collapsed));
  onChange(schedule); onViewChanged(schedule); window.addEventListener('themechange', schedule);
  new ResizeObserver(schedule).observe(stage);
  setCollapsed(collapsed);
}
