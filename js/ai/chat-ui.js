// A small conversation beside the canvas. The Agents tab owns the detailed log.
import { state, onChange, undo } from '../store.js';
import { onRun, runFor, current, stop } from './replicate.js';
import { hasKey, settings, modelInfo } from './llm.js';
import { icon } from '../icons.js';
import { providerMark, providerNames } from './provider-ui.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const suggestions = [
  ['templates', 'Draw a web shop on Azure', 'Draw a web shop on Azure, from the browser through the API to the database.'],
  ['rect', 'Mock up mobile screens', 'Mock up three mobile screens for a simple task manager: tasks, task details, and a new task.'],
  ['map', 'Compare two products', 'Create a clear side-by-side comparison of two products, with headings for features, price, and best fit.'],
  ['note', 'Plan a project with tickets', 'Plan a website launch with tickets grouped into To do, In progress, and Done.'],
];

export function initAIChat(root, { stage, onOpen, onClose, onPanel, onSend, onAttach, onRefine, onSettings, onAgents, templates }) {
  const conversations = new Map();
  let docId, conversation, lastLog = '';
  root.innerHTML = `<div class="ai-scroll"><div class="ai-thread" hidden></div><div class="ai-start">
    <div class="ai-greeting"><span class="ai-provider-logo"></span><h2>What are we building today?</h2><p>Start with an idea, then make it yours.<br>Each request is one undo step.</p></div>
    <div class="ai-suggestions">${suggestions.map(([i, label, prompt], n) => `<button type="button" data-prompt="${esc(prompt)}" class="suggestion-${n}">${icon(i)}<span>${label}</span></button>`).join('')}
    <button type="button" data-attach class="suggestion-image">${icon('image')}<span>Turn a photo into a diagram</span></button></div>
  </div></div><button type="button" class="ai-open-composer" data-open-composer>Write a message ${icon('draw')}</button>
  <div class="ai-compose-wrap" id="aiComposerDock" role="region" aria-label="AI chat" hidden><div class="ai-dock-heading"><button type="button" data-ai-brand><span class="ai-provider-logo"></span><b class="ai-provider-name"></b></button><button type="button" data-chat-panel>Chat &amp; ideas</button><button type="button" class="ai-dock-close" data-ai-collapse aria-label="Collapse AI chat">${icon('close')}</button></div>
    <button type="button" id="aiDockStatus" data-agents hidden></button>
    <div class="ai-context"><button type="button" id="refineBtn" hidden>${icon('refine')}Refine from image</button><label id="askStyleWrap" hidden>Style<select id="askStyle" aria-label="Diagram style"><option value="">Let AI choose</option></select></label></div>
    <button type="button" class="ai-connect" hidden>Connect your AI to get started ${icon('chevron')}</button>
    <form class="ai-composer"><textarea id="askIn" rows="3" aria-label="Message AI" placeholder="Where shall we start?"></textarea><div class="ai-compose-tools">
      <button type="button" id="replicateBtn" class="ai-attach" title="Replicate an image" aria-label="Replicate an image">${icon('plus')}</button>
      <button type="button" id="aiSettings" class="ai-model-choice" title="Model and quality settings" aria-label="Model and quality settings"><span class="ai-model-label"></span>${icon('chevron')}</button>
      <button type="submit" id="askGo" class="ai-send" aria-label="Send message" title="Send message"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6"/></svg></button>
      <button type="button" id="aiStop" class="ai-send" aria-label="Stop AI" title="Stop AI" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor"/></svg></button>
    </div></form></div>`;
  const dock = root.querySelector('#aiComposerDock'); stage.appendChild(dock);
  const $ = s => root.querySelector(s) || dock.querySelector(s), input = $('#askIn'), log = $('.ai-thread'), start = $('.ai-start');
  function remember() { if (conversation) { conversation.draft = input.value; conversation.style = $('#askStyle').value; } }
  function refresh() {
    if (!state.doc) return;
    if (docId !== state.doc.id) {
      remember(); docId = state.doc.id;
      if (!conversations.has(docId)) conversations.set(docId, { draft: '', style: '', turns: [] });
      conversation = conversations.get(docId); input.value = conversation.draft;
      $('#askStyle').innerHTML = '<option value="">Let AI choose</option>' + templates().map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
      $('#askStyle').value = conversation.style; lastLog = '';
    }
    const run = runFor(docId);
    if (run && !conversation.turns.some(t => t.run.id === run.id)) conversation.turns.push({ run, prompt: run.kind === 'replicate' ? 'Turn this image into an editable diagram' : 'Refine the diagram against the original' });
    const blank = !state.doc.elements.length && !state.doc.source;
    const busy = current?.status === 'running';
    const config = settings();
    for (const mark of [...root.querySelectorAll('.ai-provider-logo'), ...dock.querySelectorAll('.ai-provider-logo')]) {
      if (mark.dataset.provider !== config.provider) { mark.innerHTML = providerMark(config.provider); mark.dataset.provider = config.provider; }
    }
    $('.ai-provider-name').textContent = providerNames[config.provider];
    $('.ai-model-label').textContent = modelInfo(config.roles.editor).name;
    const status = $('#aiDockStatus'); status.hidden = !run;
    status.classList.toggle('failed', run?.status === 'error');
    status.textContent = !run ? '' : run.status === 'running' ? (run.steps.findLast(s => s.status === 'running')?.title || 'Getting started…') + ' · View agents' : run.status === 'error' ? 'Could not finish · View agents' : (run.finish?.title || 'Stopped') + ' · View agents';
    input.placeholder = blank ? 'Where shall we start?' : 'What should change?';
    $('#askGo').disabled = busy || !input.value.trim(); $('#askGo').hidden = busy; $('#aiStop').hidden = !busy;
    $('#replicateBtn').disabled = busy; $('#refineBtn').disabled = busy;
    $('#refineBtn').hidden = !state.doc.source || !state.doc.elements.length;
    $('#askStyleWrap').hidden = !blank;
    $('.ai-connect').hidden = hasKey();
    const turns = conversation.turns;
    start.hidden = !!turns.length; log.hidden = !turns.length;
    $('.ai-greeting h2').textContent = blank ? 'What are we building today?' : 'What should we do with this diagram?';
    const html = turns.map(({ run: r, prompt }) => {
      const working = r.status === 'running', failed = r.status === 'error';
      const title = working ? r.steps.findLast(s => s.status === 'running')?.title || 'Getting started…' : r.finish?.title || (failed ? 'Could not finish' : 'Stopped');
      const message = working ? 'You can keep working on the canvas.' : r.error || r.finish?.text || 'The changes made so far are on the canvas.';
      return `<article class="ai-turn"><p class="ai-user-message">${esc(prompt)}</p><div class="ai-reply ${failed ? 'failed' : ''}"><b class="${working ? 'ai-working' : ''}">${esc(title)}</b><p>${esc(message)}</p><div class="ai-reply-actions"><button type="button" data-agents>View agents ${icon('chevron')}</button>${r.finish?.undo && r.id === run?.id ? '<button type="button" data-undo>Undo</button>' : ''}</div></div></article>`;
    }).join('');
    if (html !== lastLog) {
      const scroll = $('.ai-scroll'), follow = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 64;
      log.innerHTML = html; lastLog = html;
      if (follow) scroll.scrollTop = scroll.scrollHeight;
    }
  }
  function handleClick(e) {
    const suggestion = e.target.closest('[data-prompt]');
    if (suggestion) { input.value = suggestion.dataset.prompt; remember(); refresh(); onOpen(); input.focus(); }
    if (e.target.closest('[data-attach], #replicateBtn')) onAttach();
    if (e.target.closest('#refineBtn')) onRefine();
    if (e.target.closest('#aiSettings, .ai-connect, [data-ai-brand]')) onSettings();
    if (e.target.closest('[data-ai-collapse]')) onClose();
    if (e.target.closest('[data-chat-panel]')) onPanel();
    if (e.target.closest('[data-open-composer]')) onOpen();
    if (e.target.closest('[data-agents]')) onAgents();
    if (e.target.closest('[data-undo]')) { undo(); e.target.closest('[data-undo]').disabled = true; }
    if (e.target.closest('#aiStop')) stop();
  }
  root.addEventListener('click', handleClick); dock.addEventListener('click', handleClick);
  input.addEventListener('input', () => { remember(); refresh(); });
  $('#askStyle').addEventListener('change', remember);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!$('#askGo').disabled) $('.ai-composer').requestSubmit(); }
  });
  $('.ai-composer').addEventListener('submit', e => {
    e.preventDefault(); const prompt = input.value.trim();
    if (!prompt || current?.status === 'running' || !onSend(prompt, $('#askStyle').value)) return;
    const run = runFor(docId);
    conversation.turns.push({ prompt, run }); input.value = ''; $('#askStyle').value = ''; remember(); refresh();
    $('.ai-scroll').scrollTop = $('.ai-scroll').scrollHeight; input.focus();
  });
  onChange(refresh); onRun(refresh);
  return { refresh, focus() { refresh(); input.focus(); }, setExpanded(value) { dock.hidden = !value; $('.ai-open-composer').hidden = value; } };
}
