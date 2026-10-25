// Agents on the canvas: a named cursor per active step plus soft outlines on what it is
// working on. Cursors live in world coordinates and move on a critically damped spring, so
// they accelerate away, ease into place, follow pans and zooms, and drift a little while
// they work. A new agent's cursor starts where the previous one was, so hand-offs read.
import { state, onChange } from '../store.js';
import { cam, onViewChanged } from '../editor.js';
import { bounds, unionBounds } from '../geom.js';
import { onRun, runFor } from './replicate.js';
import { AGENTS, stepIdentity, stepAction } from './agent-meta.js';

const OMEGA = 7.5; // spring stiffness (rad/s); settles in about 0.6 s whatever the distance
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
let hovered = null, redraw = () => {};
export function hoverStep(step) { if (step !== hovered) { hovered = step; redraw(); } }

// What a step touched: its target shapes, else its focus box.
export function stepBox(step, doc = state.doc) {
  if (!doc || !step) return null;
  const boxes = (step.targets || []).map(id => doc.byId.get(id)).filter(Boolean).map(e => bounds(e, doc));
  const b = boxes.length ? unionBounds(boxes) : step.focus;
  return b && [b.x, b.y, b.w, b.h].every(Number.isFinite) ? b : null;
}

export function initAgentPresence(stage) {
  const cursors = document.createElement('div'); cursors.id = 'agentCursors'; cursors.setAttribute('aria-hidden', 'true'); stage.appendChild(cursors);
  const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g'); layer.id = 'agentWorkLayer'; layer.setAttribute('pointer-events', 'none');
  stage.querySelector('#world').appendChild(layer);
  const pointers = new Map(); let frame = 0, last = 0, lastPos = null, active = [];

  // Where a step's cursor should rest: over its current target, walking through several.
  function aim(step, i, now) {
    const doc = state.doc, agent = AGENTS[step.agent] || AGENTS.editor;
    const targets = (step.targets || []).map(id => doc.byId.get(id)).filter(Boolean);
    const t = targets.length ? targets[Math.floor(now / 1400) % targets.length] : null;
    const b = t ? bounds(t, doc) : step.focus || { x: 0, y: 0, w: doc.page.w, h: doc.page.h };
    const page = b.w >= doc.page.w * .9 && b.h >= doc.page.h * .9;
    // whole-page work: each agent takes its own spot so cursors do not stack
    const fx = page ? .35 + ((agent.color.charCodeAt(2) + i * 3) % 7) * .05 : .62, fy = page ? .3 + (i % 3) * .15 : .55;
    return { x: b.x + b.w * fx, y: b.y + b.h * fy };
  }
  function spawnAt() {
    if (lastPos) return { ...lastPos };
    // first agent of a run arrives from the right side, where the conversation is
    const r = stage.getBoundingClientRect(), panel = stage.querySelector('#aiPanel:not([hidden])');
    const sx = r.width - (panel ? panel.offsetWidth + 40 : 60), sy = r.height * .7;
    return { x: cam.x + sx / cam.z, y: cam.y + sy / cam.z };
  }
  function pointerFor(step) {
    let p = pointers.get(step.id); if (p) return p;
    const agent = AGENTS[step.agent] || AGENTS.editor, el = document.createElement('div');
    el.className = 'agent-pointer entering'; el.style.setProperty('--agent-color', agent.color);
    el.innerHTML = '<svg viewBox="0 0 26 30" aria-hidden="true"><path d="M3 2 23 17l-10 1-4 9Z"/></svg><span><b></b><small></small></span>';
    cursors.appendChild(el); requestAnimationFrame(() => el.classList.remove('entering'));
    const s = spawnAt();
    p = { el, x: s.x, y: s.y, vx: 0, vy: 0, phase: Math.random() * 6.28, step };
    pointers.set(step.id, p); return p;
  }

  function sync() {
    const doc = state.doc, run = doc && runFor(doc.id);
    // structured draws show themselves with flashes on the shapes, not cursors
    active = run?.status === 'running' && run.kind !== 'draw' ? run.steps.filter(s => s.status === 'running') : [];
    const alive = new Set(active.map(s => s.id));
    // retire finished cursors first, so the next agent takes over from where they were
    for (const [id, p] of pointers) if (!alive.has(id) && !p.leaving) {
      p.leaving = true; lastPos = { x: p.x, y: p.y }; p.el.classList.add('leaving');
      setTimeout(() => { p.el.remove(); pointers.delete(id); }, 350);
    }
    if (run?.status !== 'running') lastPos = null;
    else if (!lastPos) { const any = [...pointers.values()].at(-1); if (any) lastPos = { x: any.x, y: any.y }; }
    active.forEach(step => { const p = pointerFor(step), who = stepIdentity(step); p.step = step;
      p.el.querySelector('b').textContent = who.name;
      p.el.querySelector('small').textContent = stepAction(step, who.name);
    });
    drawHighlights();
    if (pointers.size && !frame) { last = 0; frame = requestAnimationFrame(tick); }
  }
  function drawHighlights() {
    const doc = state.doc; if (!doc) { layer.innerHTML = ''; return; }
    const out = [], z = cam.z;
    const rect = (b, color, strong) => {
      const page = b.w >= doc.page.w * .95 && b.h >= doc.page.h * .95, pad = 5 / z;
      out.push(`<rect class="agent-glow${strong ? ' hover' : ''}" x="${b.x - pad}" y="${b.y - pad}" width="${Math.max(b.w, 8 / z) + pad * 2}" height="${Math.max(b.h, 8 / z) + pad * 2}" rx="${6 / z}" fill="${color}" fill-opacity="${page ? 0 : strong ? .12 : .07}" stroke="${color}" stroke-opacity="${strong ? .9 : .55}" stroke-width="${strong ? 2 : 1.5}" vector-effect="non-scaling-stroke"/>`);
    };
    for (const step of active) {
      const color = (AGENTS[step.agent] || AGENTS.editor).color;
      const boxes = (step.targets || []).map(id => doc.byId.get(id)).filter(Boolean).map(e => bounds(e, doc));
      for (const b of boxes.length ? boxes : step.focus ? [step.focus] : []) rect(b, color);
    }
    const hb = hovered && stepBox(hovered); if (hb) rect(hb, (AGENTS[hovered.agent] || AGENTS.editor).color, true);
    layer.innerHTML = out.join('');
  }
  redraw = drawHighlights;

  function tick(now) {
    frame = 0; if (!state.doc || !pointers.size) return;
    const dt = Math.min(.034, last ? (now - last) / 1000 : .016); last = now;
    const r = stage.getBoundingClientRect(), panel = stage.querySelector('#aiPanel:not([hidden])');
    const maxX = r.width - (panel ? panel.offsetWidth + 24 : 0) - 150;
    let i = 0;
    for (const p of pointers.values()) {
      if (!p.leaving) {
        const goal = aim(p.step, i++, now);
        // while working, a slow figure-eight drift around the goal keeps the cursor alive
        const wob = reduced() ? 0 : 7 / cam.z, t = now / 1000 + p.phase;
        // aim inside the visible area (not under the panel), so the spring glides there instead of pinning at an edge
        const vx0 = cam.x + 20 / cam.z, vx1 = cam.x + maxX / cam.z, vy0 = cam.y + 30 / cam.z, vy1 = cam.y + (r.height - 70) / cam.z;
        const gx = Math.max(vx0, Math.min(vx1, goal.x)) + Math.sin(t * 1.1) * wob, gy = Math.max(vy0, Math.min(vy1, goal.y)) + Math.sin(t * 2.2) * wob * .55;
        if (reduced()) { p.x = gx; p.y = gy; }
        else for (let k = 0; k < 2; k++) { // two half steps keep the spring stable on slow frames
          const h = dt / 2;
          p.vx += (OMEGA * OMEGA * (gx - p.x) - 2 * OMEGA * p.vx) * h; p.vy += (OMEGA * OMEGA * (gy - p.y) - 2 * OMEGA * p.vy) * h;
          p.x += p.vx * h; p.y += p.vy * h;
        }
      }
      const sx = Math.max(6, Math.min(maxX, (p.x - cam.x) * cam.z)), sy = Math.max(10, Math.min(r.height - 60, (p.y - cam.y) * cam.z));
      p.el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0)`;
    }
    frame = requestAnimationFrame(tick);
  }
  onRun(sync); onChange(sync); onViewChanged(drawHighlights);
}
