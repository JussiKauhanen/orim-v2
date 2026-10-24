// Show the regions reported by active steps; no document elements are added.
import { state, onChange } from '../store.js';
import { cam, onViewChanged } from '../editor.js';
import { bounds } from '../geom.js';
import { onRun, runFor } from './replicate.js';
import { AGENTS } from './agent-meta.js';

export function initAgentPresence(stage) {
  const cursors = document.createElement('div'); cursors.id = 'agentCursors'; cursors.setAttribute('aria-hidden', 'true'); stage.appendChild(cursors);
  const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g'); layer.id = 'agentWorkLayer'; layer.setAttribute('pointer-events', 'none');
  stage.querySelector('#world').appendChild(layer);
  const pointers = new Map();
  function draw() {
    const doc = state.doc, run = doc && runFor(doc.id);
    const active = run?.status === 'running' ? run.steps.filter(s => s.status === 'running') : [];
    const alive = new Set(), highlights = [], w = stage.clientWidth, h = stage.clientHeight;
    for (const [i, step] of active.entries()) {
      const agent = AGENTS[step.agent] || AGENTS.editor, key = step.id; alive.add(key);
      const targets = (step.targets || []).map(id => doc.byId.get(id)).filter(Boolean).map(e => bounds(e, doc));
      const focus = targets.at(-1) || step.focus || { x: 0, y: 0, w: doc.page.w, h: doc.page.h };
      const boxes = targets.length ? targets : [focus];
      for (const b of boxes) {
        if (![b.x, b.y, b.w, b.h].every(Number.isFinite)) continue;
        const wholePage = b.w >= doc.page.w * .95 && b.h >= doc.page.h * .95;
        highlights.push(`<rect x="${b.x - 4 / cam.z}" y="${b.y - 4 / cam.z}" width="${Math.max(b.w, 8 / cam.z) + 8 / cam.z}" height="${Math.max(b.h, 8 / cam.z) + 8 / cam.z}" rx="${5 / cam.z}" fill="${agent.color}" fill-opacity="${wholePage ? 0 : .09}" stroke="${agent.color}" stroke-opacity=".65" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`);
      }
      let pointer = pointers.get(key);
      if (!pointer) {
        pointer = document.createElement('div'); pointer.className = 'agent-pointer'; pointer.style.setProperty('--agent-color', agent.color);
        pointer.innerHTML = '<svg viewBox="0 0 26 30" aria-hidden="true"><path d="M3 2 23 17l-10 1-4 9Z"/></svg><span><b></b><small></small></span>';
        pointers.set(key, pointer); cursors.appendChild(pointer);
      }
      pointer.querySelector('b').textContent = agent.name;
      pointer.querySelector('small').textContent = step.targets?.length ? 'Updating shapes' : step.title;
      pointer.title = step.title;
      const x = Math.max(10, Math.min(w - 195, (focus.x + focus.w * .7 - cam.x) * cam.z + i * 12));
      const y = Math.max(14, Math.min(h - 70, (focus.y + focus.h * .4 - cam.y) * cam.z + i * 18));
      pointer.style.transform = `translate(${x}px, ${y}px)`;
    }
    for (const [key, pointer] of pointers) if (!alive.has(key)) { pointer.remove(); pointers.delete(key); }
    layer.innerHTML = highlights.join('');
  }
  onRun(draw); onChange(draw); onViewChanged(draw);
}
