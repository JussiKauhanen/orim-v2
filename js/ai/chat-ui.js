// The AI side panel: one conversation per diagram. Each request is a user bubble followed by
// a live reply that lists the agents' steps as they work (who, what, how long, what they are
// thinking right now); finished replies fold their steps away. While the panel is closed a
// small status pill shows the active step.
import { state, onChange, undo, selected, select } from '../store.js';
import { onRun, runFor, current, stop } from './replicate.js';
import { hasKey, settings, modelInfo } from './llm.js';
import { icon } from '../icons.js';
import { providerMark, providerNames, billingHelp } from './provider-ui.js';
import { stepIdentity, stepAction } from './agent-meta.js';
import { hoverStep, stepBox } from './agent-presence.js';
import { panTo, flash } from '../editor.js';
import { bounds } from '../geom.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const svg = body => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const setText = (el, v) => { const t = String(v ?? ''); if (el.textContent !== t) el.textContent = t; };
const setHtml = (el, h) => { if (el._html !== h) { el.innerHTML = h; el._html = h; } };
const clock = ms => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? s + 's' : Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const G = {
  compose: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  locate: '<circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/>',
  selection: '<rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 2.5"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  check: '<path d="m5 12 4 4L19 6"/>', tidy: '<rect x="3" y="4" width="7" height="6" rx="1.5"/><rect x="14" y="4" width="7" height="6" rx="1.5"/><rect x="8.5" y="14" width="7" height="6" rx="1.5"/><path d="M6.5 10v2h11v-2M12 12v2"/>', x: '<path d="m7 7 10 10M7 17 17 7"/>', pause: '<path d="M9 6v12m6-12v12"/>',
};
const suggestions = [
  ['templates', 'Draw a web shop on Azure', 'Draw a web shop on Azure, from the browser through the API to the database.'],
  ['rect', 'Mock up mobile screens', 'Mock up three mobile screens for a simple task manager: tasks, task details, and a new task.'],
  ['map', 'Compare two products', 'Create a clear side-by-side comparison of two products, with headings for features, price, and best fit.'],
  ['note', 'Plan a project with tickets', 'Plan a website launch with tickets grouped into To do, In progress, and Done.'],
];
const stateOf = (step, run) => step.status === 'running' && run.status !== 'running' ? run.status : step.status;
function identity(step) {
  const { agent, name, provider } = stepIdentity(step);
  return { name, color: agent.color, avatar: provider ? `<span class="aip-av model ${provider}">${providerMark(provider)}</span>` : `<span class="aip-av" style="--c:${agent.color}">${svg(agent.icon)}</span>` };
}
const action = (step, who) => stepAction(step, who);
// The freshest line of the agent's reasoning, or its last log line.
function liveLine(step) {
  const lines = (step.thinking || '').split('\n').map(l => l.replace(/[*#_`>]+/g, '').trim()).filter(l => l.length > 3);
  return lines.at(-1) || step.log?.at(-1) || '';
}
function sparkline(scores) {
  if (!scores || scores.length < 2) return '';
  const lo = Math.min(...scores) - 2, hi = Math.max(...scores) + 2, w = 64, h = 18;
  const pts = scores.map((s, i) => `${(i / (scores.length - 1) * w).toFixed(1)},${(h - (s - lo) / (hi - lo) * h).toFixed(1)}`).join(' ');
  return `<svg class="aip-spark" viewBox="-2 -2 ${w + 4} ${h + 4}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

export function initAIChat(stage, { onOpen, onClose, onSend, onAttach, onRefine, onTidy, onSettings, onImage, templates, highlighter, panelWidth }) {
  const conversations = new Map();
  let docId, conversation, timer = 0;
  const panel = document.createElement('section'); panel.id = 'aiPanel'; panel.className = 'ai-panel'; panel.hidden = true;
  panel.setAttribute('aria-label', 'AI assistant');
  panel.innerHTML = `<header class="aip-head"><button type="button" class="aip-brand" data-settings title="Provider and model settings"><span class="aip-logo"></span><span><b class="aip-provider"></b><small class="aip-model"></small></span>${icon('chevron')}</button>
      <button type="button" class="aip-icon" data-new title="New conversation" aria-label="New conversation">${svg(G.compose)}</button>
      <button type="button" class="aip-icon" data-close title="Close" aria-label="Close AI panel">${icon('close')}</button></header>
    <div class="aip-thread" role="log" aria-live="polite" aria-label="Conversation">
      <div class="aip-empty"><span class="aip-hello">${icon('ai')}</span><h3>What are we making?</h3><p>Describe a diagram, point at something to change, or give me a picture to rebuild. You can keep editing while I work.</p>
        <div class="aip-ideas">${suggestions.map(([i, label, prompt]) => `<button type="button" data-prompt="${esc(prompt)}">${icon(i)}<span>${label}</span></button>`).join('')}<button type="button" data-attach>${icon('image')}<span>Rebuild a picture as a diagram</span></button></div></div>
      <div class="aip-turns"></div></div>
    <button type="button" class="aip-connect" hidden>Connect your AI to get started ${icon('chevron')}</button>
    <form class="aip-composer"><div class="aip-chips"></div>
      <textarea id="askIn" rows="1" aria-label="Message AI" placeholder="Ask AI to draw or change something"></textarea>
      <div class="aip-tools">
        <button type="button" id="replicateBtn" title="Rebuild an image as a diagram" aria-label="Rebuild an image as a diagram">${icon('plus')}</button>
        <button type="button" id="aiHighlight" title="Highlight areas to change" aria-label="Highlight areas to change" aria-pressed="false">${icon('highlighter')}</button>
        <button type="button" id="refineBtn" title="Refine against the original image" aria-label="Refine against the original image" hidden>${icon('refine')}</button>
        <label class="aip-style" id="askStyleWrap" hidden><select id="askStyle" aria-label="Diagram style"><option value="">Any style</option></select>${icon('chevron')}</label>
        <span class="grow"></span>
        <button type="submit" id="askGo" class="aip-send" aria-label="Send" title="Send (Enter)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6"/></svg></button>
        <button type="button" id="aiStop" class="aip-send stop" aria-label="Stop" title="Stop" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor"/></svg></button>
      </div></form>`;
  stage.appendChild(panel);
  const pill = document.createElement('div'); pill.id = 'aiPill'; pill.className = 'ai-pill'; pill.hidden = true;
  pill.innerHTML = '<button type="button" class="ai-pill-open" aria-label="Open AI panel"><span class="ai-pill-av"></span><span class="ai-pill-text"><b></b><small></small></span><time></time></button><button type="button" class="ai-pill-stop" aria-label="Stop" title="Stop"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor"/></svg></button>';
  stage.appendChild(pill);
  const $ = s => panel.querySelector(s), input = $('#askIn'), thread = $('.aip-thread'), turnsEl = $('.aip-turns');
  const turnEls = new Map(), stepEls = new Map(), open = new Set(), folded = new Map();
  let useSelection = true, selKey = '';

  function remember() { if (conversation) { conversation.draft = input.value; conversation.style = $('#askStyle').value; } }
  function grow() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 180) + 'px'; }
  const atBottom = () => thread.scrollHeight - thread.scrollTop - thread.clientHeight < 80;

  // ---------- one step row ----------
  function paintStep(li, step, run) {
    const who = identity(step), st = stateOf(step, run), q = s => li.querySelector(s);
    li.className = 'aip-step ' + st; li.style.setProperty('--c', who.color);
    setHtml(q('.aip-step-av'), who.avatar);
    setText(q('.aip-step-who'), who.name); setText(q('.aip-step-what'), action(step, who.name));
    setText(q('time'), clock((step.ended || Date.now()) - step.started));
    const live = st === 'running' ? liveLine(step) : '';
    q('.aip-live').hidden = !live; setText(q('.aip-live'), live);
    const exp = open.has(step.id); q('.aip-step-row').setAttribute('aria-expanded', String(exp));
    const d = q('.aip-step-detail'); d.hidden = !exp; if (!exp) return;
    const usage = step.usage ? `${step.usage.in.toLocaleString()} in · ${step.usage.out.toLocaleString()} out${step.cost ? ' · $' + step.cost.toFixed(3) : ''}` : '';
    const box = stepBox(step);
    setHtml(d, `${step.summary ? `<p>${esc(step.summary)}</p>` : ''}${step.log?.length ? `<ul>${step.log.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}${step.images?.length ? `<div class="aip-imgs">${step.images.map(i => `<figure><img src="${esc(i.src)}" alt="${esc(i.label)}" data-full><figcaption>${esc(i.label)}</figcaption></figure>`).join('')}</div>` : ''}${step.thinking ? `<details><summary>Reasoning</summary><div class="aip-think">${esc(step.thinking)}</div></details>` : ''}<div class="aip-step-foot">${usage ? `<small>${usage}</small>` : '<span></span>'}${box ? `<button type="button" data-locate="${step.id}">${svg(G.locate)}Show on canvas</button>` : ''}</div>`);
  }
  function stepEl(step) {
    let li = stepEls.get(step.id); if (li) return li;
    li = document.createElement('li'); li.dataset.step = step.id;
    li.innerHTML = `<button type="button" class="aip-step-row" aria-expanded="false"><span class="aip-step-av"></span><span class="aip-step-text"><b class="aip-step-who"></b><span class="aip-step-what"></span></span><time></time><span class="aip-step-state" aria-hidden="true"><i class="spin"></i>${svg(G.check)}${svg(G.x)}<i class="skip"></i></span></button><p class="aip-live" hidden></p><div class="aip-step-detail" hidden></div>`;
    stepEls.set(step.id, li); return li;
  }
  // ---------- a structured draw: reads like a chat reply ----------
  // Streamed text, one activity line (expands to what changed), a thumbnail and the token count.
  function paintDraw(turn, latest) {
    const { run, prompt } = turn; let el = turnEls.get(run.id);
    if (!el) {
      el = document.createElement('article'); el.className = 'aip-turn draw'; el.dataset.run = run.id;
      el.innerHTML = `<div class="aip-user"><img class="aip-user-img" alt="Your picture" hidden><p></p><span class="aip-user-ctx" hidden></span></div><div class="aip-reply"><div class="aip-say"></div><button type="button" class="aip-activity" aria-expanded="false"><span class="aip-act-state" aria-hidden="true"><i class="spin"></i>${svg(G.check)}${svg(G.x)}</span><span class="aip-act-text"></span><time></time>${icon('chevron')}</button><ul class="aip-changes" hidden></ul><img class="aip-thumb" alt="Result" data-full hidden><p class="aip-final" hidden></p><div class="aip-help" hidden></div><div class="aip-foot"><div class="aip-actions"></div><small class="aip-tokens"></small></div></div>`;
      turnEls.set(run.id, el); turnsEl.appendChild(el);
    }
    const q = s => el.querySelector(s), working = run.status === 'running', st = run.steps[0];
    setText(q('.aip-user p'), prompt || run.prompt || 'Read this picture'); q('.aip-user p').hidden = !(prompt || run.prompt) && !!run.imageSrc;
    const ui = q('.aip-user-img'); ui.hidden = !run.imageSrc; if (run.imageSrc && ui.src !== run.imageSrc) ui.src = run.imageSrc;
    q('.aip-user-ctx').hidden = !turn.context; setText(q('.aip-user-ctx'), turn.context || '');
    q('.aip-reply').className = 'aip-reply ' + run.status;
    setHtml(q('.aip-say'), run.say ? run.say.split('\n\n').map(p => `<p>${esc(p)}</p>`).join('') : working ? `<p class="aip-thinking">${esc(liveLine(st || {}) || 'Thinking…')}</p>` : '');
    const n = c => run.changes.filter(x => x.change === c).length, shapes = run.changes.filter(x => x.change !== 'remove').length;
    const act = q('.aip-activity'); act.className = 'aip-activity ' + run.status;
    setText(q('.aip-act-text'), working ? (shapes ? `${st?.title || 'Drawing'} · ${shapes} item${shapes === 1 ? '' : 's'}` : st?.title || 'Thinking') : run.finish?.title || (run.status === 'error' ? 'Could not finish' : 'Stopped'));
    setText(q('.aip-activity time'), clock((st?.ended || Date.now()) - run.started));
    const exp = open.has(run.id); act.setAttribute('aria-expanded', String(exp));
    const list = q('.aip-changes'); list.hidden = !exp || !run.changes.length;
    if (exp) setHtml(list, run.changes.map(c => `<li class="${c.change}"><button type="button" data-goto="${esc(c.id)}" ${c.change === 'remove' ? 'disabled' : ''}><i></i>${esc(c.name)}<small>${{ add: 'added', update: 'changed', remove: 'removed' }[c.change]}</small></button></li>`).join(''));
    const th = q('.aip-thumb'); th.hidden = !run.thumb; if (run.thumb && th.src !== run.thumb) th.src = run.thumb;
    const final = working ? '' : run.error || (run.status === 'stopped' ? 'Stopped. What was drawn so far stays on the canvas.' : '');
    q('.aip-final').hidden = !final; setText(q('.aip-final'), final);
    const help = billingHelp(run); q('.aip-help').hidden = !help; setHtml(q('.aip-help'), help);
    const acts = !working && latest ? `${run.finish?.undo ? `<button type="button" data-undo ${turn.undone ? 'disabled' : ''}>${svg(G.undo)}${turn.undone ? 'Undone' : 'Undo'}</button>` : ''}${run.status === 'done' ? `<button type="button" data-tidy title="Lay the whole diagram out again">${svg(G.tidy)}Tidy up</button>` : ''}` : '';
    setHtml(q('.aip-actions'), acts);
    const u = st?.usage;
    setText(q('.aip-tokens'), u ? `${(u.in + u.cached).toLocaleString()} in · ${u.out.toLocaleString()} out${run.cost ? ' · $' + run.cost.toFixed(3) : ''}` : working && st?.outChars ? `~${Math.round(st.outChars / 4).toLocaleString()} tokens` : '');
  }

  // ---------- one request + reply ----------
  function paintTurn(turn, latest) {
    if (turn.run.kind === 'draw') return paintDraw(turn, latest);
    const { run, prompt } = turn; let el = turnEls.get(run.id);
    if (!el) {
      el = document.createElement('article'); el.className = 'aip-turn'; el.dataset.run = run.id;
      el.innerHTML = `<div class="aip-user"><p></p><span class="aip-user-ctx" hidden></span></div><div class="aip-reply"><div class="aip-reply-head"><span class="aip-faces"></span><b></b><time></time></div><button type="button" class="aip-fold" hidden></button><ol class="aip-steps"></ol><div class="aip-score" hidden></div><p class="aip-final" hidden></p><div class="aip-help" hidden></div><div class="aip-actions" hidden></div></div>`;
      turnEls.set(run.id, el); turnsEl.appendChild(el);
    }
    const q = s => el.querySelector(s), working = run.status === 'running', failed = run.status === 'error';
    setText(q('.aip-user p'), prompt);
    q('.aip-user-ctx').hidden = !turn.context; setText(q('.aip-user-ctx'), turn.context || '');
    const reply = q('.aip-reply'); reply.className = 'aip-reply ' + run.status;
    const agents = [...new Set(run.steps.map(s => s.agent))].slice(-4);
    setHtml(q('.aip-faces'), agents.map(a => identity(run.steps.findLast(s => s.agent === a)).avatar).join(''));
    const active = run.steps.findLast(s => s.status === 'running');
    setText(q('.aip-reply-head b'), working ? (active ? 'Working on it' : 'Getting started') : run.finish?.title || (failed ? 'Could not finish' : 'Stopped'));
    setText(q('.aip-reply-head time'), clock((working ? Date.now() : run.ended || run.steps.reduce((t, s) => Math.max(t, s.ended || 0), 0) || Date.now()) - run.started));
    // finished replies fold their steps into one line; the user can unfold them
    const fold = !working && run.steps.length > 1 && folded.get(run.id) !== false;
    const fb = q('.aip-fold'); fb.hidden = working || run.steps.length < 2;
    setHtml(fb, `${run.steps.length} steps${run.cost ? ` · $${run.cost.toFixed(3)}` : ''} ${icon('chevron')}`); fb.setAttribute('aria-expanded', String(!fold));
    const ol = q('.aip-steps'); ol.hidden = fold;
    if (!fold) { let prev = null; for (const step of run.steps) { const li = stepEl(step); paintStep(li, step, run); const want = prev ? prev.nextSibling : ol.firstChild; if (want !== li) ol.insertBefore(li, want); prev = li; } }
    const score = run.first != null && run.final != null;
    q('.aip-score').hidden = !score;
    if (score) setHtml(q('.aip-score'), `<span>Similarity</span><b>${run.first}</b>→<b>${run.final}</b>${sparkline(run.scores)}`);
    const final = working ? '' : run.error || run.finish?.text || (run.status === 'stopped' ? 'Stopped. The changes made so far stay on the canvas.' : '');
    q('.aip-final').hidden = !final; setText(q('.aip-final'), final);
    const help = billingHelp(run); q('.aip-help').hidden = !help; setHtml(q('.aip-help'), help);
    const acts = !working && latest ? `${run.finish?.undo ? `<button type="button" data-undo ${turn.undone ? 'disabled' : ''}>${svg(G.undo)}${turn.undone ? 'Undone' : 'Undo'}</button>` : ''}${run.finish?.refine && state.doc?.source ? `<button type="button" data-refine>${icon('refine')}Refine again</button>` : ''}` : '';
    q('.aip-actions').hidden = !acts; setHtml(q('.aip-actions'), acts);
  }

  function refresh() {
    if (!state.doc) return;
    if (docId !== state.doc.id) {
      remember(); docId = state.doc.id;
      if (!conversations.has(docId)) conversations.set(docId, { draft: '', style: '', turns: [] });
      conversation = conversations.get(docId); input.value = conversation.draft;
      turnEls.clear(); stepEls.clear(); turnsEl.replaceChildren();
      $('#askStyle').innerHTML = '<option value="">Any style</option>' + templates().map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
      $('#askStyle').value = conversation.style; grow();
    }
    const run = runFor(docId), busy = current?.status === 'running', config = settings();
    if (run && !conversation.turns.some(t => t.run.id === run.id)) conversation.turns.push({ run, prompt: run.kind === 'replicate' ? 'Copy this image as an editable diagram' : run.kind === 'draw' ? run.prompt || '' : 'Refine the diagram against the original' });
    // header
    const mark = $('.aip-logo');
    if (mark.dataset.provider !== config.provider) { mark.innerHTML = providerMark(config.provider); mark.dataset.provider = config.provider; }
    setText($('.aip-provider'), providerNames[config.provider]); setText($('.aip-model'), modelInfo(config.roles.editor).name);
    // thread
    const follow = atBottom();
    $('.aip-empty').hidden = conversation.turns.length > 0;
    conversation.turns.forEach((t, i) => paintTurn(t, i === conversation.turns.length - 1));
    if (follow) thread.scrollTop = thread.scrollHeight;
    // composer
    const blank = !state.doc.elements.length && !state.doc.source;
    input.placeholder = blank ? 'Describe a diagram to draw…' : 'Ask AI to change something…';
    $('#askGo').disabled = busy || !input.value.trim(); $('#askGo').hidden = busy; $('#aiStop').hidden = !busy;
    for (const id of ['replicateBtn', 'refineBtn', 'aiHighlight']) $('#' + id).disabled = busy;
    $('#refineBtn').hidden = !state.doc.source || !state.doc.elements.length; $('#askStyleWrap').hidden = !blank;
    $('.aip-connect').hidden = hasKey();
    $('#aiHighlight').setAttribute('aria-pressed', String(highlighter.active()));
    chips(busy);
    paintPill(run);
    clearTimeout(timer); if (busy) timer = setTimeout(refresh, 1000);
  }
  // Context the next message carries: the selection and any highlighter marks.
  function chips(busy) {
    const sel = selected().filter(e => !e.ghost), count = highlighter.count(), marking = highlighter.active();
    const key = sel.map(e => e.id).join();
    if (key !== selKey) { selKey = key; useSelection = true; }
    let h = '';
    if (sel.length) h += `<span class="aip-chip${useSelection ? '' : ' off'}">${svg(G.selection)}<button type="button" data-sel-toggle title="${useSelection ? 'The request is about the selection — click to use the whole diagram' : 'Use the selection'}">${sel.length === 1 ? esc(sel[0].text?.content?.split('\n')[0].slice(0, 24) || 'Selected shape') : sel.length + ' selected'}</button>${useSelection ? `<button type="button" class="x" data-sel-toggle aria-label="Don't use selection">${icon('close')}</button>` : ''}</span>`;
    if (count || marking) h += `<span class="aip-chip mark">${icon('highlighter')}<span>${marking && !count ? 'Mark areas on the canvas' : `${count} marked area${count === 1 ? '' : 's'}`}</span>${count && !busy ? `<button type="button" data-mark-undo title="Undo last mark">${svg(G.undo)}</button><button type="button" class="x" data-mark-clear aria-label="Clear marks">${icon('close')}</button>` : ''}</span>`;
    setHtml($('.aip-chips'), h); $('.aip-chips').hidden = !h;
  }
  function paintPill(run) {
    const show = panel.hidden && run?.status === 'running'; pill.hidden = !show; if (!show) return;
    const step = run.steps.findLast(s => s.status === 'running'), who = step ? identity(step) : { name: 'AI', avatar: '' };
    setHtml(pill.querySelector('.ai-pill-av'), who.avatar);
    setText(pill.querySelector('b'), step ? who.name : 'Getting started');
    setText(pill.querySelector('small'), step ? liveLine(step) || action(step, who.name) : '');
    setText(pill.querySelector('time'), clock(Date.now() - run.started));
  }

  panel.addEventListener('click', e => {
    const t = e.target.closest('button, img[data-full]'); if (!t) return;
    if (t.dataset.prompt) { input.value = t.dataset.prompt; remember(); grow(); refresh(); input.focus(); return; }
    if (t.matches('[data-attach], #replicateBtn')) { onAttach(); return; }
    if (t.matches('#refineBtn, [data-refine]')) { onRefine(); return; }
    if (t.matches('[data-settings], .aip-connect')) { onSettings(); return; }
    if (t.matches('[data-close]')) { onClose(); return; }
    if (t.matches('[data-new]')) { if (current?.status === 'running') return; conversation.turns = []; turnEls.clear(); stepEls.clear(); turnsEl.replaceChildren(); refresh(); input.focus(); return; }
    if (t.matches('#aiStop')) { stop(); return; }
    if (t.matches('#aiHighlight')) { highlighter.toggle(); return; }
    if (t.matches('[data-mark-undo]')) { highlighter.undo(); return; }
    if (t.matches('[data-mark-clear]')) { highlighter.clear(); return; }
    if (t.matches('[data-sel-toggle]')) { useSelection = !useSelection; selKey = selected().map(x => x.id).join(); chips(false); return; }
    if (t.matches('[data-tidy]')) { onTidy?.(); return; }
    if (t.matches('.aip-activity')) { const id = t.closest('.aip-turn').dataset.run; open.has(id) ? open.delete(id) : open.add(id); refresh(); return; }
    if (t.dataset.goto) { const el = state.doc.byId.get(t.dataset.goto); if (el) { select(el.id); panTo(bounds(el, state.doc), { right: panelWidth() }); flash([el.id], 'change'); } return; }
    if (t.matches('[data-undo]')) { const turn = conversation.turns.at(-1); undo(); if (turn) turn.undone = true; refresh(); return; }
    if (t.matches('.aip-fold')) { const id = t.closest('.aip-turn').dataset.run; folded.set(id, t.getAttribute('aria-expanded') === 'true'); refresh(); return; }
    if (t.matches('.aip-step-row')) { const id = t.closest('[data-step]').dataset.step; open.has(id) ? open.delete(id) : open.add(id); refresh(); return; }
    if (t.dataset.locate) { const step = conversation.turns.flatMap(x => x.run.steps).find(s => s.id === t.dataset.locate); const b = step && stepBox(step); if (b) panTo(b, { right: panelWidth() }); return; }
    if (t.matches('img[data-full]') && onImage) onImage(t.src, t.alt);
  });
  // hovering a step outlines what it worked on
  panel.addEventListener('pointerover', e => { const li = e.target.closest('[data-step]'); hoverStep(li ? conversation.turns.flatMap(x => x.run.steps).find(s => s.id === li.dataset.step) : null); });
  panel.addEventListener('pointerleave', () => hoverStep(null));
  pill.addEventListener('click', e => { if (e.target.closest('.ai-pill-stop')) stop(); else onOpen(); });
  input.addEventListener('input', () => { remember(); grow(); refresh(); }); $('#askStyle').addEventListener('change', remember);
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!$('#askGo').disabled) $('.aip-composer').requestSubmit(); } if (e.key === 'Escape') { e.preventDefault(); onClose(); } });
  $('.aip-composer').addEventListener('submit', e => {
    e.preventDefault(); const prompt = input.value.trim();
    const sel = useSelection ? selected().filter(x => !x.ghost) : [];
    if (!prompt || current?.status === 'running' || !onSend(prompt, $('#askStyle').value, sel.map(x => x.id))) return;
    const run = runFor(docId), context = [sel.length ? (sel.length === 1 ? '1 shape' : sel.length + ' shapes') : '', highlighter.count() ? highlighter.count() + ' marked' : ''].filter(Boolean).join(' · ');
    const existing = conversation.turns.find(t => t.run.id === run.id);
    if (existing) Object.assign(existing, { prompt, context }); else conversation.turns.push({ prompt, run, context });
    input.value = ''; $('#askStyle').value = ''; remember(); grow(); thread.scrollTop = thread.scrollHeight; refresh(); input.focus();
  });
  onChange(refresh); onRun(refresh);
  return {
    refresh, focus() { refresh(); input.focus(); thread.scrollTop = thread.scrollHeight; },
    openHistory() { refresh(); },
    setExpanded(value) { panel.hidden = !value; if (!value) hoverStep(null); refresh(); },
  };
}
