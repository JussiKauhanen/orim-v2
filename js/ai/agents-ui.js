// Active work appears as short-lived comment cards. Details stay inside each card.
import { onRun, runFor } from './replicate.js';
import { state, onChange } from '../store.js';
import { modelInfo, PROVIDERS, settings } from './llm.js';
import { providerMark, billingHelp } from './provider-ui.js';
import { AGENTS } from './agent-meta.js';

const FINISH_DELAY = 3000, EXIT_DURATION = 160;
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const svg = body => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const smile = svg('<circle cx="12" cy="12" r="8.5"/><path d="M8 14s1.3 2 4 2 4-2 4-2M8.5 9h.01M15.5 9h.01"/>');
const setText = (el, value) => { const text = String(value ?? ''); if (el.textContent !== text) el.textContent = text; };
const setHtml = (el, html) => { if (el._html !== html) { el.innerHTML = html; el._html = html; } };
const age = started => { const minutes = Math.floor((Date.now() - started) / 60000); return minutes < 1 ? 'now' : minutes < 60 ? minutes + 'm' : Math.floor(minutes / 60) + 'h'; };
const statusName = s => ({ running: 'Working', done: 'Completed', error: 'Error', stopped: 'Stopped', skipped: 'Skipped' })[s] || s;

export function initAgents(root, { onImage } = {}) {
  const stage = root.parentElement, cards = new Map(), ended = new Map();
  let last = null, shownDoc, timer = 0;
  root.innerHTML = '<div class="ag-steps" role="list" aria-label="Active agents"></div>';
  const list = root.firstElementChild;
  function identity(step) {
    const agent = AGENTS[step.agent] || AGENTS.editor;
    if (step.agent !== 'editor') return { name: agent.name, avatar: `<span class="ag-avatar" style="background:${agent.color}">${svg(agent.icon)}</span>` };
    const model = step.model || settings().roles.editor;
    const provider = Object.keys(PROVIDERS).find(p => PROVIDERS[p].models.some(m => model === m.id || model?.startsWith(m.id + '-'))) || settings().provider;
    return { name: modelInfo(model).name, avatar: `<span class="ag-avatar ag-model-avatar ${provider}">${providerMark(provider)}</span>` };
  }
  function create(step) {
    const el = document.createElement('article'); el.className = 'ag-step'; el.dataset.stepId = step.id; el.setAttribute('role', 'listitem');
    el.innerHTML = `<div class="ag-row"><span class="ag-avatar-slot"></span><b class="ag-name"></b><time class="ag-time"></time><button type="button" class="ag-details-toggle" aria-expanded="false" aria-controls="detail-${esc(step.id)}">${smile}</button></div><p class="ag-message"></p><div class="ag-detail" id="detail-${esc(step.id)}" hidden><p class="ag-status"></p><p class="ag-summary" hidden></p><ul class="ag-log" hidden></ul><div class="ag-imgs" hidden></div><p class="ag-usage" hidden></p><details class="ag-reason" hidden><summary>Reasoning</summary><div class="ag-think"></div></details></div>`;
    const help = document.createElement('div'); help.className = 'ag-help'; help.hidden = true;
    el.querySelector('.ag-message').after(help);
    cards.set(step.id, el); list.appendChild(el); return el;
  }
  function paint(step, status, leaving) {
    const el = cards.get(step.id) || create(step), who = identity(step), q = s => el.querySelector(s);
    el.className = `ag-step ${status}${leaving ? ' leaving' : ''}`;
    setHtml(q('.ag-avatar-slot'), who.avatar); setText(q('.ag-name'), who.name); q('.ag-name').title = who.name;
    setText(q('.ag-time'), age(step.started)); q('.ag-time').dateTime = new Date(step.started).toISOString();
    q('.ag-details-toggle').setAttribute('aria-label', `Details for ${who.name}`);
    const message = status === 'error' ? last.error || step.summary || step.title : step.summary || step.title.replace(/^Editing:\s*/, '');
    setText(q('.ag-message'), message);
    const help = status === 'error' ? billingHelp(last) : '';
    q('.ag-help').hidden = !help; setHtml(q('.ag-help'), help);
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && el.contains(selection.anchorNode)) return;
    setText(q('.ag-status'), statusName(status));
    q('.ag-summary').hidden = !step.summary; setText(q('.ag-summary'), step.summary);
    q('.ag-log').hidden = !step.log?.length; setHtml(q('.ag-log'), (step.log || []).map(line => `<li>${esc(line)}</li>`).join(''));
    q('.ag-imgs').hidden = !step.images?.length;
    setHtml(q('.ag-imgs'), (step.images || []).map(i => `<figure><img src="${esc(i.src)}" alt="${esc(i.label)}" data-full loading="lazy"><figcaption>${esc(i.label)}</figcaption></figure>`).join(''));
    const usage = step.usage ? `Input ${step.usage.in} · Output ${step.usage.out}${step.cost ? ' · $' + step.cost.toFixed(3) : ''}` : '';
    q('.ag-usage').hidden = !usage; setText(q('.ag-usage'), usage);
    q('.ag-reason').hidden = !step.thinking; setText(q('.ag-think'), step.thinking);
  }
  // Comments stack above chat; the minimap keeps its own fixed position.
  function position() {
    if (root.hidden) return;
    const r = stage.getBoundingClientRect(), dock = stage.querySelector('#aiComposerDock');
    const chat = dock && !dock.hidden ? dock.getBoundingClientRect() : null;
    const width = root.offsetWidth;
    let bottom = stage.querySelector('#aiLauncher:not([hidden])') ? 76 : 16;
    if (chat && chat.right > r.right - width - 16) bottom = Math.max(bottom, r.bottom - chat.top + 12);
    root.style.bottom = bottom + 'px';
    root.style.maxHeight = Math.max(80, r.height - bottom - 20) + 'px';
  }
  function draw() {
    clearTimeout(timer); const now = Date.now(), visible = new Set(); let next = 1000;
    if (last) for (const step of last.steps) {
      const status = step.status === 'running' && last.status !== 'running' ? last.status : step.status;
      let remaining = Infinity;
      if (status !== 'running') {
        if (!ended.has(step.id)) ended.set(step.id, step.ended || now);
        remaining = ended.get(step.id) + FINISH_DELAY - now;
        if (remaining <= 0) continue;
        next = Math.min(next, remaining > EXIT_DURATION ? remaining - EXIT_DURATION : remaining);
      }
      visible.add(step.id); paint(step, status, remaining <= EXIT_DURATION);
    }
    for (const [id, el] of cards) if (!visible.has(id)) { el.remove(); cards.delete(id); }
    root.hidden = visible.size === 0; position();
    if (visible.size || last?.status === 'running') timer = setTimeout(draw, Math.max(30, next));
  }
  onRun(run => { if (run.docId === state.doc?.id) { last = run; draw(); } });
  onChange(() => {
    if (state.doc?.id === shownDoc) return;
    shownDoc = state.doc?.id; last = state.doc ? runFor(state.doc.id) : null;
    cards.clear(); ended.clear(); list.replaceChildren(); draw();
  });
  root.addEventListener('click', e => {
    const toggle = e.target.closest('.ag-details-toggle');
    if (toggle) {
      const detail = toggle.closest('.ag-step').querySelector('.ag-detail'); detail.hidden = !detail.hidden;
      toggle.setAttribute('aria-expanded', String(!detail.hidden)); position();
    }
    const img = e.target.closest('img[data-full]'); if (img && onImage) onImage(img.src, img.alt);
  });
  const observer = new ResizeObserver(position);
  for (const el of [stage, root, stage.querySelector('#aiComposerDock')]) if (el) observer.observe(el);
  return { show() { draw(); return !root.hidden; } };
}
