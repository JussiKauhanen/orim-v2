// One settings draft, two views. Tabs only change visibility; choosing a quality
// preset is the only action that replaces the advanced model and run controls.
import { settings, saveSettings, PROVIDERS, defaultRoleModels, qualityPreset } from './ai/llm.js';
import { lib, folderSupported, connectFolder, disconnectFolder, syncAllToFolder } from './library.js';
import { icon } from './icons.js';

const ROLES = { analyst: 'Vision analyst', designer: 'Shape designer', critic: 'Critic', editor: 'AI editor', sketch: 'Quick sketch' };
const PROVIDER_NAMES = { anthropic: 'Claude', openai: 'OpenAI', google: 'Gemini' };
const TIERS = { cheap: ['Cheap', 'Quick edits, less checking'], medium: ['Medium', 'A balance of quality and cost'], high: ['High', 'More thought and careful checking'] };
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const copy = value => JSON.parse(JSON.stringify(value));
const $ = selector => dialog.querySelector(selector);
let dialog, draft, toast = () => {}, onSaved = () => {};
const tuning = s => ({ effort: { ...s.effort }, iterations: s.iterations, designAttempts: s.designAttempts, budget: s.budget, measure: s.measure });

function providerIcon(provider) {
  let body;
  if (provider === 'anthropic') body = `<g stroke="currentColor" stroke-width="2.2" stroke-linecap="round">${Array.from({ length: 12 }, (_, i) => `<path d="M12 8V2.5" transform="rotate(${i * 30} 12 12)"/>`).join('')}</g>`;
  else if (provider === 'openai') body = `<g fill="none" stroke="currentColor" stroke-width="1.5">${Array.from({ length: 6 }, (_, i) => `<path d="M12 4c5-3 10 2 7 7l-7 4-4-7Z" transform="rotate(${i * 60} 12 12)"/>`).join('')}</g>`;
  else body = '<path d="M12 1.5C13.7 8 16 10.3 22.5 12 16 13.7 13.7 16 12 22.5 10.3 16 8 13.7 1.5 12 8 10.3 10.3 8 12 1.5Z" fill="currentColor"/>';
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
}

export function initSettings(options = {}) {
  toast = options.toast || (() => {}); onSaved = options.onSaved || (() => {});
  dialog = document.getElementById('setDlg');
  dialog.classList.add('settings-dialog');
  dialog.setAttribute('aria-labelledby', 'settingsTitle');
  dialog.innerHTML = `<form method="dialog" id="settingsForm" novalidate>
    <header class="settings-heading"><div><h2 id="settingsTitle">Settings</h2><p>Make orim work your way.</p></div><button type="button" class="ib settings-close" data-settings-close aria-label="Close settings">${icon('close')}</button></header>
    <div class="settings-tabs" role="tablist" aria-label="Settings views"><button type="button" role="tab" id="settingsBasicTab" data-settings-tab="basic" aria-controls="settingsBasic" aria-selected="true">Bring your AI</button><button type="button" role="tab" id="settingsAdvancedTab" data-settings-tab="advanced" aria-controls="settingsAdvanced" aria-selected="false" tabindex="-1">Advanced</button></div>
    <section class="settings-provider"><div class="settings-section-heading"><h3>Your AI provider</h3><span>Pick the one you use.</span></div>
      <div class="provider-cards" role="radiogroup" aria-label="AI provider">${Object.entries(PROVIDER_NAMES).map(([id, name]) => `<label class="provider-card ${id}"><input type="radio" name="settings-provider" value="${id}" aria-label="${name}"><span class="provider-badge">${providerIcon(id)}</span><b>${name}</b></label>`).join('')}</div>
      <select id="setProvider" aria-label="Provider" hidden>${Object.entries(PROVIDERS).map(([id, p]) => `<option value="${id}">${esc(p.name)}</option>`).join('')}</select>
      <div class="settings-key-heading"><label for="setKey" id="settingsKeyLabel">API key</label><a id="setKeyLink" target="_blank" rel="noopener">Get an API key <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M9 3h4v4M13 3 7 9M6 3H3v10h10v-3"/></svg></a></div>
      <div class="settings-key"><input id="setKey" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" aria-labelledby="settingsKeyLabel"><button type="button" data-key-toggle aria-label="Show API key" aria-pressed="false">Show</button></div>
      <p class="settings-key-note">Your key stays in this browser and is sent only to your AI provider. AI usage is billed by that provider.</p>
    </section>
    <section id="settingsBasic" class="settings-basic" role="tabpanel" aria-labelledby="settingsBasicTab">
      <div class="settings-section-heading"><h3>Quality &amp; cost</h3><span id="settingsCustom" class="settings-custom" hidden>Custom setup</span></div>
      <div class="quality-cards" role="radiogroup" aria-label="AI quality and cost">${Object.entries(TIERS).map(([id, [label, description]]) => `<label class="quality-card"><input type="radio" name="settings-quality" value="${id}" aria-label="${label}"><span class="quality-title">${label}${id === 'medium' ? '<small>Recommended</small>' : ''}</span><span class="quality-description">${description}</span><span class="quality-budget" data-quality-budget="${id}"></span></label>`).join('')}</div>
      <p id="settingsQualityHelp" class="settings-quality-help"></p>
    </section>
    <section id="settingsAdvanced" class="settings-advanced" role="tabpanel" aria-labelledby="settingsAdvancedTab" hidden>
      <div class="settings-section-heading"><h3>Models &amp; effort</h3><span id="settingsAdvancedState" class="settings-custom"></span></div>
      <div class="settings-models"><div class="settings-model-head"><span>Agent</span><span>Model</span><span>Effort</span></div>${Object.entries(ROLES).map(([id, name]) => `<div class="settings-model-row"><label for="setM-${id}">${name}</label><select id="setM-${id}" aria-label="${name} model"></select><select id="setE-${id}" aria-label="${name} effort">${(id === 'sketch' ? ['low', 'medium', 'high'] : ['low', 'medium', 'high', 'xhigh', 'max']).map(e => `<option>${e}</option>`).join('')}</select></div>`).join('')}</div>
      <p class="settings-help">Prices are input / output dollars per million tokens. Each provider uses its closest supported effort level.</p>
      <div class="settings-section-heading"><h3>Checking &amp; limits</h3></div><div class="settings-limits"><label class="f"><span>Critic rounds</span><input type="number" id="setIter" min="0" max="10" required></label><label class="f"><span>Attempts per shape</span><input type="number" id="setAttempts" min="1" max="6" required></label><label class="f"><span>Budget per run ($)</span><input type="number" id="setBudget" min="0" step="0.5" required></label></div>
      <label class="chk settings-measure"><input type="checkbox" id="setMeasure"> Snap boxes and colours to the image pixels</label>
      <div class="settings-library"><h3>Library folder</h3><p>Save learned shapes, lessons and templates to a folder so you can reuse and share them.</p><div id="folderRow"></div><p id="settingsFolderError" class="err" role="status" hidden></p></div>
    </section>
    <footer class="settings-footer"><span id="settingsSaveHint">Changes apply when you save.</span><button type="button" class="btn" data-settings-close>Cancel</button><button type="submit" class="btn primary" id="setSave">Save settings</button></footer>
  </form>`;
  dialog.addEventListener('click', handleClick);
  dialog.addEventListener('change', handleChange);
  dialog.addEventListener('input', e => { if (e.target.closest('#settingsAdvanced') && e.target.matches('input, select')) markCustom(); });
  $('#settingsForm').addEventListener('submit', e => {
    e.preventDefault();
    const invalid = $('#settingsForm').querySelector(':invalid');
    if (invalid) { if (invalid.closest('#settingsAdvanced')) setTab('advanced'); $('#settingsForm').reportValidity(); return; }
    capture(); draft.roles = { ...draft.providerRoles[draft.provider] };
    saveSettings(draft); onSaved(draft); dialog.close(); toast('Settings saved');
  });
  dialog.addEventListener('close', () => { if (!dialog.open) draft = null; });
  dialog.querySelector('.settings-tabs').addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const advanced = e.key === 'End' || (e.key !== 'Home' && e.target.dataset.settingsTab !== 'advanced');
    setTab(advanced ? 'advanced' : 'basic'); $(`[data-settings-tab="${advanced ? 'advanced' : 'basic'}"]`).focus();
  });
  return { openSettings };
}

function matchesPreset(provider, tier) {
  const p = qualityPreset(provider, tier), roles = draft.providerRoles[provider], t = draft.providerTuning[provider];
  return Object.keys(ROLES).every(r => roles[r] === p.roles[r] && t.effort[r] === p.effort[r]) && ['iterations', 'designAttempts', 'budget', 'measure'].every(k => t[k] === p[k]);
}
export function openSettings() {
  draft = copy(settings());
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
  fillProvider(); setTab('basic'); renderFolder();
  if (!dialog.open) dialog.showModal();
}

function setTab(tab) {
  for (const b of dialog.querySelectorAll('[data-settings-tab]')) {
    const selected = b.dataset.settingsTab === tab;
    b.setAttribute('aria-selected', selected); b.tabIndex = selected ? 0 : -1;
  }
  $('#settingsBasic').hidden = tab !== 'basic'; $('#settingsAdvanced').hidden = tab !== 'advanced';
}
function fillProvider() {
  const p = draft.provider, provider = PROVIDERS[p], roles = draft.providerRoles[p], tune = draft.providerTuning[p];
  $('#setProvider').value = p;
  for (const input of dialog.querySelectorAll('[name="settings-provider"]')) input.checked = input.value === p;
  $('#setKey').value = draft.keys[p] || ''; $('#setKey').placeholder = provider.keyHint || ''; $('#setKey').type = 'password';
  const reveal = $('[data-key-toggle]'); reveal.textContent = 'Show'; reveal.setAttribute('aria-label', 'Show API key'); reveal.setAttribute('aria-pressed', 'false');
  $('#settingsKeyLabel').textContent = PROVIDER_NAMES[p] + ' API key';
  $('#setKeyLink').href = provider.console; $('#setKeyLink').firstChild.textContent = `Get ${p === 'openai' ? 'an' : 'a'} ${PROVIDER_NAMES[p]} API key `;
  for (const role of Object.keys(ROLES)) {
    $('#setM-' + role).innerHTML = provider.models.map(m => `<option value="${esc(m.id)}">${esc(m.name)} · $${m.in} / $${m.out}</option>`).join('');
    $('#setM-' + role).value = provider.models.some(m => m.id === roles[role]) ? roles[role] : defaultRoleModels(p)[role];
    $('#setE-' + role).value = tune.effort[role];
  }
  $('#setIter').value = tune.iterations; $('#setAttempts').value = tune.designAttempts; $('#setBudget').value = tune.budget; $('#setMeasure').checked = tune.measure;
  updateQuality();
}
function capture() {
  const p = draft.provider;
  draft.keys[p] = $('#setKey').value.trim();
  draft.providerRoles[p] = Object.fromEntries(Object.keys(ROLES).map(r => [r, $('#setM-' + r).value]));
  const current = { effort: Object.fromEntries(Object.keys(ROLES).map(r => [r, $('#setE-' + r).value])), iterations: +$('#setIter').value, designAttempts: +$('#setAttempts').value, budget: +$('#setBudget').value, measure: $('#setMeasure').checked };
  draft.providerTuning[p] = current; Object.assign(draft, copy(current));
}
function updateQuality() {
  const p = draft.provider, quality = draft.providerQuality[p], custom = quality === 'custom';
  for (const input of dialog.querySelectorAll('[name="settings-quality"]')) input.checked = input.value === quality;
  for (const tier of Object.keys(TIERS)) $(`[data-quality-budget="${tier}"]`).textContent = `$${qualityPreset(p, tier).budget} run budget`;
  $('#settingsCustom').hidden = !custom;
  $('#settingsAdvancedState').textContent = custom ? 'Custom setup' : TIERS[quality][0] + ' preset';
  $('#settingsQualityHelp').textContent = custom ? 'Your custom Advanced settings are active. Choose an option above to replace them with a preset.' : 'This sets the models, thinking effort and checking rounds together. Fine-tune any of them in Advanced.';
}
function markCustom() {
  draft.providerQuality[draft.provider] = 'custom'; updateQuality();
}
function handleChange(e) {
  if (!draft) return;
  const target = e.target;
  if (target.name === 'settings-provider' || target.id === 'setProvider') {
    const next = target.value;
    if (next === draft.provider) return;
    capture(); draft.provider = next; fillProvider();
  } else if (target.name === 'settings-quality') {
    capture(); const p = draft.provider, preset = qualityPreset(p, target.value);
    draft.providerRoles[p] = { ...preset.roles }; draft.providerTuning[p] = tuning(preset); draft.providerQuality[p] = target.value;
    fillProvider();
  } else if (target.closest('#settingsAdvanced') && target.matches('input, select')) markCustom();
}
async function handleClick(e) {
  if (e.target.closest('[data-settings-close]')) { dialog.close(); return; }
  const tab = e.target.closest('[data-settings-tab]'); if (tab) { setTab(tab.dataset.settingsTab); return; }
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
