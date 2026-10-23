// Live view of what the agents are doing: one card per step with its streamed reasoning,
// logs, image attempts and scores.

import { onRun, stop, runFor } from './replicate.js';
import { state, onChange } from '../store.js';
import { modelInfo } from './llm.js';

const AGENTS = {
  eye: { name: 'Preparation', icon: '<circle cx="12" cy="12" r="3"/><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/>' },
  analyst: { name: 'Vision analyst', icon: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 17.5h7M17.5 14v7"/>' },
  ruler: { name: 'Measurer', icon: '<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>' },
  designer: { name: 'Shape designer', icon: '<path d="M12 3l2.4 5.6L20 11l-5.6 2.4L12 19l-2.4-5.6L4 11l5.6-2.4z"/>' },
  critic: { name: 'Critic', icon: '<circle cx="11" cy="11" r="7"/><path d="M20.5 20.5L16 16M8 11l2 2 4-4"/>' },
};
const open = new Set();
let root, pill, last = null, timer = 0;
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

let actions = {};
const EMPTY = '<div class="ag-empty"><b>No AI work on this diagram yet.</b><p>Replicate an image or use Ask AI, and each agent shows its work here: what the analyst reads, the measurements, every shape the designer tries and how the critic closes the gap.</p></div>';
export function initAgents(el, { onImage, onAction, pillEl } = {}) {
  actions = onAction || (() => {});
  root = el; pill = pillEl;
  root.innerHTML = EMPTY;
  onRun(run => { if (run && run.docId === state.doc?.id) { last = run; draw(); } });
  // each diagram shows its own latest run
  onChange(what => { if (what === 'doc') { last = state.doc ? runFor(state.doc.id) : null; if (last) draw(); else { root.innerHTML = EMPTY; drawPill(); } } });
  clearInterval(timer); timer = setInterval(() => { if (last?.status === 'running') draw(); }, 1000);
  root.addEventListener('click', e => {
    const t = e.target.closest('[data-toggle]'); if (t) { const id = t.dataset.toggle; open.has(id) ? open.delete(id) : open.add(id); draw(); return; }
    if (e.target.closest('[data-stop]')) { stop(); return; }
    const act = e.target.closest('[data-act]'); if (act) { actions(act.dataset.act); return; }
    const im = e.target.closest('img[data-full]'); if (im && onImage) onImage(im.src, im.alt);
  });
}

function spark(scores) {
  if (scores.length < 2) return '';
  const min = Math.min(...scores) - 2, max = Math.max(...scores, min + 5), W = 120, H = 30;
  const pts = scores.map((s, i) => `${(i / (scores.length - 1)) * W},${H - (s - min) / (max - min) * H}`).join(' ');
  return `<svg viewBox="-2 -2 ${W + 4} ${H + 4}" width="${W}" height="${H}" class="spark"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="2"/>${scores.map((s, i) => `<circle cx="${(i / (scores.length - 1)) * W}" cy="${H - (s - min) / (max - min) * H}" r="2.5" fill="currentColor"/>`).join('')}</svg>`;
}
const dur = ms => ms < 60000 ? Math.round(ms / 1000) + 's' : Math.floor(ms / 60000) + 'm ' + Math.round(ms % 60000 / 1000) + 's';

const kTok = n => n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n));
// Output tokens still streaming (≈3.6 chars per token) priced at the step's model, so the cost moves live.
function liveCost(run) {
  let est = 0;
  for (const s of run.steps) if (s.status === 'running' && s.outChars) est += s.outChars / 3.6 * modelInfo(s.model).out / 1e6;
  return run.cost + est;
}
function drawPill() {
  if (!pill) return;
  const run = last;
  if (!run || run.status !== 'running') { pill.hidden = true; return; }
  const s = run.steps.at(-1) || {};
  const thinking = s.outChars && !s.text?.length ? 'thinking' : s.outChars ? 'writing' : 'starting';
  pill.hidden = false;
  pill.innerHTML = `<span class="spin"></span><b>${esc(s.title || run.title)}</b><small>${thinking} · ${dur(Date.now() - run.started)} · ~$${liveCost(run).toFixed(3)}</small>`;
}

function draw() {
  drawPill();
  const run = last; if (!root || !run) return;
  const scroller = root.querySelector('.ag-steps'); const keepBottom = scroller && scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 40; const top = scroller ? scroller.scrollTop : 0;
  const score = run.scores.length ? run.scores[run.scores.length - 1] : null;
  let h = `<div class="ag-head"><div><b>${esc(run.title)}</b><span class="pill ${run.status}">${run.status}</span></div>
    <div class="ag-meta"><span title="Cost so far (estimated while streaming)">${run.status === 'running' ? '~' : ''}$${(run.status === 'running' ? liveCost(run) : run.cost).toFixed(3)}</span><span>${dur((run.status === 'running' ? Date.now() : (run.steps.at(-1)?.ended || Date.now())) - run.started)}</span>${score != null ? `<span class="score">${score}<small>/100</small></span>` : ''}${spark(run.scores)}</div>
    ${run.status === 'running' ? '<button class="btn danger" data-stop>Stop</button>' : ''}${run.error ? `<p class="err">${esc(run.error)}</p>` : ''}</div><div class="ag-steps">`;
  for (const s of run.steps) {
    const a = AGENTS[s.agent] || AGENTS.critic, isOpen = open.has(s.id) || (s.status === 'running' && !open.has('x' + s.id));
    h += `<div class="ag-step ${s.status}"><div class="ag-row"><svg viewBox="0 0 24 24" class="ag-ic"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${a.icon}</g></svg><div class="ag-t"><b>${esc(s.title)}</b><small>${a.name}${s.cost ? ' · $' + s.cost.toFixed(3) : ''}${s.ended ? ' · ' + dur(s.ended - s.started) : s.status === 'running' ? ' · ' + dur(Date.now() - s.started) : ''}${s.usage ? ` · in ${kTok(s.usage.in)}${s.usage.cached ? ` + ${kTok(s.usage.cached)} cached` : ''} · out ${kTok(s.usage.out)}` : s.outChars ? ` · ~${kTok(s.outChars / 3.6)} out` : ''}</small></div><span class="dot ${s.status}"></span></div>`;
    if (s.palette) h += `<div class="ag-pal">${s.palette.map(c => `<i style="background:${c}" title="${c}"></i>`).join('')}</div>`;
    if (s.summary) h += `<p class="ag-sum">${esc(s.summary)}</p>`;
    if (s.log.length) h += `<ul class="ag-log">${s.log.map(l => `<li>${esc(l)}</li>`).join('')}</ul>`;
    if (s.images.length) h += `<div class="ag-imgs">${s.images.map(i => `<figure><img src="${i.src}" alt="${esc(i.label)}" data-full><figcaption>${esc(i.label)}</figcaption></figure>`).join('')}</div>`;
    if (s.thinking || s.text) {
      h += `<button class="ag-more" data-toggle="${s.id}">${open.has(s.id) ? 'Hide' : 'Show'} reasoning${s.tokens ? ` · ${s.tokens} tokens` : ''}</button>`;
      if (open.has(s.id) || s.status === 'running') {
        const think = s.thinking ? (s.status === 'running' && !open.has(s.id) ? s.thinking.slice(-700) : s.thinking) : '';
        h += `<div class="ag-think">${think ? esc(think) : '<i>thinking…</i>'}${s.status === 'running' && s.text && s.text.length > 40 ? `<div class="ag-out">${esc(s.text.length > 600 ? '…' + s.text.slice(-600) : s.text)}</div>` : ''}</div>`;
      }
    }
    h += '</div>';
  }
  if (run.finish && run.status === 'done') {
    h += `<div class="ag-finish"><div class="ag-row"><svg viewBox="0 0 24 24" class="ag-ic ok"><g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></g></svg><div class="ag-t"><b>${esc(run.finish.title)}</b><small>${dur((run.steps.at(-1)?.ended || Date.now()) - run.started)} · $${run.cost.toFixed(3)}</small></div></div><p>${esc(run.finish.text)}</p><div class="ag-acts">${run.finish.undo ? '<button class="btn" data-act="undo">Undo</button>' : ''}${run.finish.refine ? '<button class="btn" data-act="refine">Refine 1 more round</button>' : ''}<button class="btn" data-act="ask">Ask AI for a change</button></div></div>`;
  }
  h += '</div>';
  root.innerHTML = h;
  const sc = root.querySelector('.ag-steps');
  const showEnd = run.status !== 'running' && !run.shownEnd;
  if (showEnd) run.shownEnd = true;
  if (sc) sc.scrollTop = keepBottom || run.status === 'running' || showEnd ? sc.scrollHeight : top;
}
