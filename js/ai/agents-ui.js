// Keep each step's DOM in place while it streams, so details, scroll and selected
// text stay put while the agents report their progress.
import { onRun, stop, runFor } from './replicate.js';
import { state, onChange } from '../store.js';
import { modelInfo } from './llm.js';
import { icon } from '../icons.js';

import { AGENTS } from './agent-meta.js';

const svg = (body, cls = '') => `<svg viewBox="0 0 24 24" class="${cls}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const chevron = svg('<path d="m9 5 7 7-7 7"/>', 'ag-chevron');
const avatar = a => `<span class="ag-avatar ${a.tone}" style="color:${a.color}" title="${a.name}">${svg(a.icon)}</span>`;
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dur = ms => { const n = Math.max(0, Math.round(ms / 1000)); return n < 60 ? n + 's' : Math.floor(n / 60) + 'm ' + n % 60 + 's'; };
const kTok = n => n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n));
const statusLabel = s => ({ running: 'Working', done: 'Completed', error: 'Error', stopped: 'Stopped', skipped: 'Skipped' })[s] || s;
const setText = (el, value) => { const text = String(value ?? ''); if (el.textContent !== text) el.textContent = text; };
const setHtml = (el, html) => { if (el._html !== html) { el.innerHTML = html; el._html = html; } };
let root, last = null, timer = 0, mountedRun = null, actions, imageAction, deferred = false;
const steps = new Map();

function empty() {
  mountedRun = null; steps.clear();
  root.innerHTML = toolbar() + `<div class="ag-empty"><h3>A small team, one canvas</h3><p>Send a message or replicate an image. Each agent’s work appears here.</p><div class="ag-team">${['analyst', 'designer', 'critic'].map(k => `<div>${avatar(AGENTS[k])}<span>${AGENTS[k].name}</span></div>`).join('')}</div><button type="button" class="btn" data-act="ask">Open chat</button></div>`;
  root.scrollTop = 0;
}
export function initAgents(el, { onImage, onAction } = {}) {
  root = el; actions = onAction || (() => {}); imageAction = onImage;
  root.classList.add('agent-panel'); empty();
  let shownDoc;
  onRun(run => { if (run && run.docId === state.doc?.id) { if (run.id !== last?.id) root.hidden = false; last = run; draw(); } });
  onChange(() => { if (state.doc?.id !== shownDoc) { shownDoc = state.doc?.id; last = state.doc ? runFor(state.doc.id) : null; root.hidden = true; if (last) draw(); else empty(); } });
  clearInterval(timer); timer = setInterval(() => { if (last?.status === 'running') draw(); }, 1000);
  root.addEventListener('click', e => {
    if (e.target.closest('[data-agents-close]')) { root.hidden = true; return; }
    const activity = e.target.closest('[data-activity]');
    if (activity) { const expanded = activity.getAttribute('aria-expanded') !== 'true'; activity.setAttribute('aria-expanded', expanded); root.querySelector('.ag-steps').hidden = !expanded; return; }
    const toggle = e.target.closest('[data-step-toggle], [data-toggle]');
    if (toggle) {
      const isStep = toggle.hasAttribute('data-step-toggle'), item = steps.get(isStep ? toggle.dataset.stepToggle : toggle.dataset.toggle);
      const target = item.querySelector(isStep ? '.ag-detail' : '.ag-reasoning');
      target.hidden = !target.hidden; toggle.setAttribute('aria-expanded', !target.hidden);
      if (!isStep) { item.reasoningTouched = true; toggle.querySelector('span').textContent = target.hidden ? 'Show reasoning' : 'Hide reasoning'; }
      return;
    }
    if (e.target.closest('[data-stop]')) { stop(); return; }
    const act = e.target.closest('[data-act]'); if (act) { actions(act.dataset.act); return; }
    const im = e.target.closest('img[data-full]'); if (im && imageAction) imageAction(im.src, im.alt);
  });
  document.addEventListener('selectionchange', () => { if (deferred && !hasSelection()) draw(); });
  return { show() { root.hidden = false; draw(); }, hide() { root.hidden = true; } };
}
function toolbar() { return `<div class="ag-popup-toolbar"><b>Agent activity</b><button type="button" class="ib" data-agents-close aria-label="Close agent activity">${icon('close')}</button></div>`; }
function hasSelection() {
  const s = window.getSelection();
  return s && !s.isCollapsed && (root.contains(s.anchorNode) || root.contains(s.focusNode));
}
function liveCost(run) {
  let est = 0;
  for (const s of run.steps) if (s.status === 'running' && s.outChars) est += s.outChars / 3.6 * modelInfo(s.model).out / 1e6;
  return (run.cost || 0) + est;
}
function elapsed(run) {
  const end = run.status === 'running' ? Date.now() : Math.max(run.started, ...run.steps.map(s => s.ended || s.started));
  return dur(end - run.started);
}
function spark(scores) {
  if (scores.length < 2) return '';
  const min = Math.min(...scores) - 2, max = Math.max(...scores, min + 5), w = 120, h = 28;
  const x = i => i / (scores.length - 1) * w, y = s => h - (s - min) / (max - min) * h;
  return `<svg viewBox="-3 -3 ${w + 6} ${h + 6}" class="spark" role="img" aria-label="Similarity scores: ${scores.join(', ')}"><polyline points="${scores.map((s, i) => `${x(i)},${y(s)}`).join(' ')}" fill="none" stroke="currentColor" stroke-width="1.6"/>${scores.map((s, i) => `<circle cx="${x(i)}" cy="${y(s)}" r="2" fill="currentColor"/>`).join('')}</svg>`;
}
function mount(run) {
  mountedRun = run.id; steps.clear(); root.scrollTop = 0;
  root.innerHTML = toolbar() + `<details class="ag-head ag-overview"><summary class="ag-run-heading"><b class="ag-run-title"></b><span class="ag-run-status"></span></summary><span class="ag-current"></span><dl class="ag-metrics"><div><dt>Time</dt><dd class="ag-time"></dd></div><div><dt>Cost</dt><dd class="ag-cost"></dd></div><div class="ag-score-metric" hidden><dt>Similarity</dt><dd class="ag-score"></dd></div></dl><div class="ag-chart" hidden></div></details><button type="button" class="btn ag-stop" data-stop>${svg('<rect x="7" y="7" width="10" height="10" rx="2"/>')}Stop</button><p class="err ag-error" hidden></p><section class="ag-activity"><button type="button" class="ag-section-toggle" data-activity aria-expanded="true">${svg('<path d="M4 12h4l3-7 4 14 3-7h2"/>')}<span>Activity</span><small class="ag-count"></small>${chevron}</button><div class="ag-steps" role="list"></div></section><section class="ag-finish" hidden></section>`;
}
function createStep(s) {
  const a = AGENTS[s.agent] || AGENTS.critic, el = document.createElement('article');
  el.className = 'ag-step'; el.setAttribute('role', 'listitem');
  el.innerHTML = `<button type="button" class="ag-row" data-step-toggle="${esc(s.id)}" aria-expanded="true">${avatar(a)}<span class="ag-t"><b>${a.name}</b><small class="ag-step-meta"></small></span><span class="ag-step-state"></span>${chevron}</button><div class="ag-detail"><p class="ag-step-title"></p><p class="ag-sum" hidden></p><div class="ag-pal" hidden></div><ul class="ag-log" hidden></ul><div class="ag-imgs" hidden></div><small class="ag-usage" hidden></small><div class="ag-reason" hidden><button type="button" class="ag-more" data-toggle="${esc(s.id)}" aria-expanded="false"><span>Show reasoning</span>${chevron}</button><div class="ag-reasoning" hidden><div class="ag-think"></div><div class="ag-out" hidden></div></div></div></div>`;
  root.querySelector('.ag-steps').appendChild(el); steps.set(s.id, el); return el;
}
function drawStep(s) {
  const el = steps.get(s.id) || createStep(s), a = AGENTS[s.agent] || AGENTS.critic, q = selector => el.querySelector(selector);
  el.className = `ag-step ${s.status}`;
  setText(q('.ag-step-title'), s.title);
  const details = [];
  if (s.ended || s.status === 'running') details.push(dur((s.ended || Date.now()) - s.started));
  if (s.cost) details.push('$' + s.cost.toFixed(3));
  setText(q('.ag-step-meta'), details.join(' · '));
  const status = q('.ag-step-state'); status.title = statusLabel(s.status); status.setAttribute('aria-label', statusLabel(s.status));
  setHtml(status, s.status === 'done' ? svg('<path d="m5 12 4 4L19 6"/>') : s.status === 'running' ? '<i class="ag-live-dot"></i>' : svg(s.status === 'error' ? '<path d="M12 5v9M12 18h.01"/>' : '<path d="M6 12h12"/>'));
  const summary = q('.ag-sum'); summary.hidden = !s.summary; setText(summary, s.summary);
  const pal = q('.ag-pal'); pal.hidden = !s.palette?.length;
  setHtml(pal, (s.palette || []).map(c => `<i style="background:${esc(c)}" title="${esc(c)}"></i>`).join(''));
  const logs = q('.ag-log'); logs.hidden = !s.log?.length; setHtml(logs, (s.log || []).map(l => `<li>${esc(l)}</li>`).join(''));
  const images = q('.ag-imgs'); images.hidden = !s.images?.length;
  setHtml(images, (s.images || []).map(i => `<figure><img src="${esc(i.src)}" alt="${esc(i.label)}" data-full loading="lazy"><figcaption>${esc(i.label)}</figcaption></figure>`).join(''));
  const reason = q('.ag-reason'); reason.hidden = !(s.thinking || s.text);
  if (!el.reasoningTouched) {
    const expanded = false;
    q('.ag-reasoning').hidden = !expanded; q('.ag-more').setAttribute('aria-expanded', expanded);
    setText(q('.ag-more span'), expanded ? 'Hide reasoning' : 'Show reasoning');
  }
  const thinking = q('.ag-think'), pinned = thinking.scrollHeight - thinking.scrollTop - thinking.clientHeight < 30, top = thinking.scrollTop;
  setText(thinking, s.thinking || (s.status === 'running' ? 'Thinking…' : 'No reasoning was returned.'));
  thinking.scrollTop = pinned ? thinking.scrollHeight : top;
  const output = q('.ag-out'); output.hidden = !(s.status === 'running' && s.text?.length > 40);
  setText(output, s.text?.length > 600 ? '…' + s.text.slice(-600) : s.text);
  const usage = s.usage ? `Input ${kTok(s.usage.in)}${s.usage.cached ? ` + ${kTok(s.usage.cached)} cached` : ''} · Output ${kTok(s.usage.out)}` : s.outChars ? `~${kTok(s.outChars / 3.6)} output tokens` : '';
  q('.ag-usage').hidden = !usage; setText(q('.ag-usage'), usage);
}
function draw() {
  if (!root || !last) return;
  if (mountedRun === last.id && hasSelection()) { deferred = true; return; }
  deferred = false;
  const run = last, newRun = mountedRun !== run.id;
  if (newRun) mount(run);
  // The panel itself owns scrolling, rather than the nested activity list.
  const top = root.scrollTop, follow = root.clientHeight > 0 && root.scrollHeight - top - root.clientHeight < 44, q = selector => root.querySelector(selector);
  setText(q('.ag-run-title'), run.title);
  const active = run.steps.findLast(s => s.status === 'running');
  setText(q('.ag-current'), run.status === 'running' ? active ? AGENTS[active.agent]?.name || 'Working on your diagram' : 'Getting started' : statusLabel(run.status));
  const status = q('.ag-run-status'); status.className = `ag-run-status ${run.status}`; setText(status, statusLabel(run.status));
  setText(q('.ag-time'), elapsed(run)); setText(q('.ag-cost'), (run.status === 'running' ? '~' : '') + '$' + (run.status === 'running' ? liveCost(run) : run.cost || 0).toFixed(3));
  const score = run.scores.at(-1); q('.ag-score-metric').hidden = score == null; setHtml(q('.ag-score'), score == null ? '' : `${score}<small>/100</small>`);
  const chart = q('.ag-chart'); chart.hidden = run.scores.length < 2; setHtml(chart, spark(run.scores));
  q('[data-stop]').hidden = run.status !== 'running';
  const error = q('.ag-error'); error.hidden = !run.error; setText(error, run.error);
  setText(q('.ag-count'), run.steps.length);
  for (const step of run.steps) drawStep(step);
  const finish = q('.ag-finish'); finish.hidden = !(run.finish && run.status === 'done');
  if (!finish.hidden) setHtml(finish, `<div class="ag-finish-heading">${svg('<path d="m5 12 4 4L19 6"/>')}<b>${esc(run.finish.title)}</b></div><p>${esc(run.finish.text)}</p><div class="ag-acts">${run.finish.undo ? '<button type="button" class="btn" data-act="undo">Undo</button>' : ''}</div>`);
  root.scrollTop = follow && !newRun ? root.scrollHeight : top;
}
