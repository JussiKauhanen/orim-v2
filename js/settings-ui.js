// AI settings in one view: pick a provider (each shows whether its key is saved), paste its
// key inline, choose quality for that provider, and open Advanced only to fine-tune.
// Everything edits one draft that is applied on Save.
import { settings, saveSettings, PROVIDERS, defaultRoleModels, qualityPreset } from './ai/llm.js';
import { lib, folderSupported, connectFolder, disconnectFolder, syncAllToFolder } from './library.js';
import { icon } from './icons.js';
import { providerNames as PROVIDER_NAMES, providerMark as providerIcon } from './ai/provider-ui.js';

const ROLES = { analyst: 'Vision analyst', designer: 'Shape designer', critic: 'Critic', editor: 'AI editor', sketch: 'Quick sketch' };
const TIERS = { cheap: ['Cheap', 'Fast drafts and small edits'], medium: ['Medium', 'Balanced quality and cost'], high: ['High', 'Most careful thinking and checking'] };
const MAKERS = { anthropic: 'Anthropic', openai: 'OpenAI', google: 'Google' };
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const copy = value => JSON.parse(JSON.stringify(value));
const $ = selector => dialog.querySelector(selector);
const external = '<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M9 3h4v4M13 3 7 9M6 3H3v10h10v-3"/></svg>';
let dialog, draft, toast = () => {}, onSaved = () => {};
const tuning = s => ({ effort: { ...s.effort }, iterations: s.iterations, designAttempts: s.designAttempts, budget: s.budget, measure: s.measure });
const modelName = (p, id) => PROVIDERS[p].models.find(m => m.id === id)?.name || id;

export function initSettings(options = {}) {
  toast = options.toast || (() => {}); onSaved = options.onSaved || (() => {});
  dialog = document.getElementById('setDlg');
  dialog.classList.add('settings-dialog');
  dialog.setAttribute('aria-labelledby', 'settingsTitle');
  dialog.innerHTML = `<form method="dialog" id="settingsForm" novalidate>
    <header class="settings-heading"><div><h2 id="settingsTitle">AI settings</h2><p>Choose the AI that draws with you. Your key stays in this browser; usage is billed by the provider.</p></div><button type="button" class="ib settings-close" data-settings-close aria-label="Close settings">${icon('close')}</button></header>
    <section class="settings-section" aria-labelledby="settingsAiTitle">
      <h3 id="settingsAiTitle">Your AI</h3>
      <div class="provider-list" role="radiogroup" aria-labelledby="settingsAiTitle">${Object.entries(PROVIDER_NAMES).map(([id, name]) => `
        <div class="provider-row" data-provider="${id}">
          <button type="button" class="provider-pick" role="radio" aria-checked="false" data-provider-select="${id}">
            <span class="provider-radio" aria-hidden="true"></span>
            <span class="provider-badge">${providerIcon(id)}</span>
            <span class="provider-text"><b>${name}</b><small>${MAKERS[id]}</small></span>
            <span class="provider-status" data-provider-status="${id}"></span>
          </button>
          <button type="button" class="provider-delete" data-provider-delete="${id}" aria-label="Delete ${name} key" title="Delete key" hidden>${icon('trash')}</button>
          <div class="provider-key" data-provider-key="${id}" hidden></div>
        </div>`).join('')}</div>
    </section>
    <section class="settings-section" aria-labelledby="settingsQualityTitle">
      <div class="settings-section-heading"><h3 id="settingsQualityTitle">Quality &amp; cost</h3><span id="settingsCustom" class="settings-custom" hidden>Custom setup · <button type="button" data-quality-reset>Use Medium</button></span></div>
      <div class="quality-cards" role="radiogroup" aria-labelledby="settingsQualityTitle">${Object.entries(TIERS).map(([id, [label, help]]) => `
        <button type="button" class="quality-card" role="radio" aria-checked="false" data-quality="${id}"><b>${label}</b><span class="quality-model"></span><small>${help}</small><span class="quality-limit"></span></button>`).join('')}</div>
    </section>
    <details class="settings-advanced" id="settingsAdvanced"><summary><span>Advanced</span><small>Models per agent, effort, checking and the library folder</small>${icon('chevron')}</summary>
      <div class="settings-advanced-body">
        <div class="settings-models"><div class="settings-model-head"><span>Agent</span><span>Model</span><span>Effort</span></div>${Object.entries(ROLES).map(([id, name]) => `<div class="settings-model-row"><label for="setM-${id}">${name}</label><select id="setM-${id}" aria-label="${name} model"></select><select id="setE-${id}" aria-label="${name} effort">${(id === 'sketch' ? ['low', 'medium', 'high'] : ['low', 'medium', 'high', 'xhigh', 'max']).map(e => `<option>${e}</option>`).join('')}</select></div>`).join('')}</div>
        <p class="settings-help">Prices are input / output dollars per million tokens. Each provider uses its closest supported effort level.</p>
        <div class="settings-limits"><label class="f"><span>Critic rounds</span><input type="number" id="setIter" min="0" max="10" required></label><label class="f"><span>Attempts per shape</span><input type="number" id="setAttempts" min="1" max="6" required></label><label class="f"><span>Budget per run ($)</span><input type="number" id="setBudget" min="0" step="0.5" required></label></div>
        <label class="chk settings-measure"><input type="checkbox" id="setMeasure"> Snap boxes and colours to the image pixels</label>
        <div class="settings-library"><h3>Library folder</h3><p>Save learned shapes, lessons and templates to a folder so you can reuse and share them.</p><div id="folderRow"></div><p id="settingsFolderError" class="err" role="status" hidden></p></div>
      </div>
    </details>
    <footer class="settings-footer"><span id="settingsSaveHint">Changes apply when you save.</span><button type="button" class="btn" data-settings-close>Cancel</button><button type="submit" class="btn primary" id="setSave">Save</button></footer>
  </form>`;
  dialog.addEventListener('click', handleClick);
  dialog.addEventListener('input', e => {
    if (e.target.id === 'setKey') { draft.keys[draft.provider] = e.target.value.trim(); if (!draft.keys[draft.provider]) delete draft.keys[draft.provider]; paintProviders(); }
    else if (e.target.closest('#settingsAdvanced') && e.target.matches('input, select')) markCustom();
  });
  dialog.addEventListener('change', e => { if (e.target.closest('#settingsAdvanced') && e.target.matches('input, select')) markCustom(); });
  $('#settingsForm').addEventListener('submit', e => {
    e.preventDefault();
    const invalid = $('#settingsForm').querySelector(':invalid');
    if (invalid) { $('#settingsAdvanced').open = true; $('#settingsForm').reportValidity(); return; }
    capture(); draft.roles = { ...draft.providerRoles[draft.provider] };
    saveSettings(draft); onSaved(draft); dialog.close(); toast('Settings saved');
  });
  dialog.addEventListener('close', () => { if (!dialog.open) draft = null; });
  // arrow keys move between providers and between quality levels, like radio buttons
  dialog.addEventListener('keydown', e => {
    const group = e.target.closest('[role=radiogroup]'); if (!group || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const items = [...group.querySelectorAll('[role=radio]')], i = items.indexOf(e.target.closest('[role=radio]')); if (i < 0) return;
    e.preventDefault(); const next = items[(i + (['ArrowUp', 'ArrowLeft'].includes(e.key) ? -1 : 1) + items.length) % items.length];
    next.click(); next.focus();
  });
  return { openSettings };
}

function matchesPreset(provider, tier) {
  const p = qualityPreset(provider, tier), roles = draft.providerRoles[provider], t = draft.providerTuning[provider];
  return Object.keys(ROLES).every(r => roles[r] === p.roles[r] && t.effort[r] === p.effort[r]) && ['iterations', 'designAttempts', 'budget', 'measure'].every(k => t[k] === p[k]);
}
export function openSettings() {
  draft = copy(settings());
  $('#settingsSaveHint').textContent = 'Changes apply when you save.';
  draft.providerRoles ||= {}; draft.providerTuning ||= {}; draft.providerQuality ||= {};
  draft.providerRoles[draft.provider] = { ...draft.roles };
  draft.providerTuning[draft.provider] = tuning(draft);
  const inherited = tuning(draft);
  for (const provider of Object.keys(PROVIDERS)) {
    const hadRoles = !!draft.providerRoles[provider], preset = qualityPreset(provider, 'medium');
    draft.providerRoles[provider] ||= { ...preset.roles };
    const base = hadRoles ? inherited : tuning(preset), saved = draft.providerTuning[provider] || {};
    draft.providerTuning[provider] = { ...copy(base), ...saved, effort: { ...base.effort, ...saved.effort } };
    draft.providerQuality[provider] = Object.keys(TIERS).find(tier => matchesPreset(provider, tier)) || 'custom';
  }
  $('#settingsAdvanced').open = false;
  fillProvider(); renderFolder();
  if (!dialog.open) dialog.showModal();
  if (!draft.keys[draft.provider]) $('#setKey')?.focus();
}

// The provider list: selection, key status and the key field under the selected row.
function paintProviders() {
  const p = draft.provider;
  for (const row of dialog.querySelectorAll('.provider-row')) {
    const id = row.dataset.provider, on = id === p, has = !!draft.keys[id], saved = has && settings().keys[id] === draft.keys[id];
    row.classList.toggle('selected', on);
    row.querySelector('.provider-pick').setAttribute('aria-checked', String(on));
    row.querySelector('.provider-pick').tabIndex = on ? 0 : -1;
    const status = row.querySelector('.provider-status');
    status.className = 'provider-status ' + (saved ? 'saved' : has ? 'ready' : 'missing');
    status.textContent = saved ? 'Key saved' : has ? 'Key added · save to apply' : on ? 'Paste your key below' : 'No key';
    row.querySelector('.provider-delete').hidden = !has;
  }
}
function fillProvider() {
  const p = draft.provider, provider = PROVIDERS[p], roles = draft.providerRoles[p], tune = draft.providerTuning[p];
  for (const box of dialog.querySelectorAll('[data-provider-key]')) { box.hidden = true; box.innerHTML = ''; }
  const keyName = p === 'openai' ? 'OpenAI' : PROVIDER_NAMES[p];
  const box = $(`[data-provider-key="${p}"]`); box.hidden = false;
  box.innerHTML = `<div class="settings-key-heading"><label for="setKey">${esc(keyName)} API key</label><a href="${esc(provider.console)}" target="_blank" rel="noopener">Get ${p === 'openai' ? 'an' : 'a'} key ${external}</a></div>
    <div class="settings-key"><input id="setKey" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(provider.keyHint || '')}"><button type="button" data-key-toggle aria-label="Show API key" aria-pressed="false">Show</button></div>${p === 'openai' ? '<p class="settings-help">ChatGPT models through the OpenAI API, billed separately from a ChatGPT subscription.</p>' : ''}`;
  $('#setKey').value = draft.keys[p] || '';
  for (const role of Object.keys(ROLES)) {
    $('#setM-' + role).innerHTML = provider.models.map(m => `<option value="${esc(m.id)}">${esc(m.name)} · $${m.in} / $${m.out}</option>`).join('');
    $('#setM-' + role).value = provider.models.some(m => m.id === roles[role]) ? roles[role] : defaultRoleModels(p)[role];
    $('#setE-' + role).value = tune.effort[role];
  }
  $('#setIter').value = tune.iterations; $('#setAttempts').value = tune.designAttempts; $('#setBudget').value = tune.budget; $('#setMeasure').checked = tune.measure;
  paintProviders(); updateQuality();
}
function capture() {
  const p = draft.provider, key = $('#setKey')?.value.trim();
  if (key) draft.keys[p] = key; else delete draft.keys[p];
  draft.providerRoles[p] = Object.fromEntries(Object.keys(ROLES).map(r => [r, $('#setM-' + r).value]));
  const current = { effort: Object.fromEntries(Object.keys(ROLES).map(r => [r, $('#setE-' + r).value])), iterations: +$('#setIter').value, designAttempts: +$('#setAttempts').value, budget: +$('#setBudget').value, measure: $('#setMeasure').checked };
  draft.providerTuning[p] = current; Object.assign(draft, copy(current));
}
// Quality cards show what each level means for the selected provider.
function updateQuality() {
  const p = draft.provider, quality = draft.providerQuality[p];
  for (const card of dialog.querySelectorAll('[data-quality]')) {
    const tier = card.dataset.quality, preset = qualityPreset(p, tier), on = tier === quality;
    card.classList.toggle('selected', on); card.setAttribute('aria-checked', String(on)); card.tabIndex = on || (quality === 'custom' && tier === 'medium') ? 0 : -1;
    card.querySelector('.quality-model').textContent = modelName(p, preset.roles.editor);
    card.querySelector('.quality-limit').textContent = `Up to $${preset.budget} per run`;
  }
  $('#settingsCustom').hidden = quality !== 'custom';
}
function chooseQuality(tier) {
  capture(); const p = draft.provider, preset = qualityPreset(p, tier);
  draft.providerRoles[p] = { ...preset.roles }; draft.providerTuning[p] = tuning(preset); draft.providerQuality[p] = tier;
  fillProvider();
}
function markCustom() { draft.providerQuality[draft.provider] = 'custom'; updateQuality(); }

async function handleClick(e) {
  if (e.target.closest('[data-settings-close]')) { dialog.close(); return; }
  const tier = e.target.closest('[data-quality]'); if (tier) { chooseQuality(tier.dataset.quality); return; }
  if (e.target.closest('[data-quality-reset]')) { chooseQuality('medium'); return; }
  const remove = e.target.closest('[data-provider-delete]');
  if (remove) {
    capture(); delete draft.keys[remove.dataset.providerDelete]; fillProvider();
    $('#settingsSaveHint').textContent = 'Key removed. Save to apply.';
    return;
  }
  const pick = e.target.closest('[data-provider-select]');
  if (pick) {
    const next = pick.dataset.providerSelect; if (next === draft.provider) return;
    capture(); draft.provider = next; fillProvider();
    if (!draft.keys[next]) $('#setKey').focus();
    return;
  }
  const reveal = e.target.closest('[data-key-toggle]');
  if (reveal) { const show = $('#setKey').type === 'password'; $('#setKey').type = show ? 'text' : 'password'; reveal.textContent = show ? 'Hide' : 'Show'; reveal.setAttribute('aria-label', show ? 'Hide API key' : 'Show API key'); reveal.setAttribute('aria-pressed', show); return; }
  const folder = e.target.closest('#folderOn, #folderOff, #folderSync'); if (!folder) return;
  folder.disabled = true; $('#settingsFolderError').hidden = true;
  try {
    if (folder.id === 'folderOn') { await connectFolder(); toast('Library folder connected'); }
    else if (folder.id === 'folderOff') { await disconnectFolder(); toast('Library folder disconnected'); }
    else { const count = await syncAllToFolder(); toast(`Wrote ${count} items to the library folder`); }
    renderFolder();
  } catch (error) {
    if (error.name !== 'AbortError') { $('#settingsFolderError').textContent = 'Could not use this folder. Try again.'; $('#settingsFolderError').hidden = false; }
  } finally { folder.disabled = false; }
}
function renderFolder() {
  $('#settingsFolderError').hidden = true;
  $('#folderRow').innerHTML = !folderSupported() ? '<span class="settings-help">Folder saving works in Chrome or Edge. You can also export your library.</span>' : lib.folder ? `<span class="settings-folder-name">Connected to <b>${esc(lib.folderName)}</b></span><div class="settings-folder-actions"><button type="button" class="btn" id="folderSync">Write library now</button><button type="button" class="btn" id="folderOff">Disconnect</button></div>` : '<button type="button" class="btn" id="folderOn">Connect library folder…</button>';
}
