import { settings } from './llm.js';

export const providerNames = { anthropic: 'Claude', openai: 'ChatGPT', google: 'Gemini' };
const logos = { anthropic: 'claude', openai: 'openai', google: 'gemini' };
export function providerMark(provider = settings().provider) {
  return `<img class="provider-mark" src="assets/providers/${logos[provider] || 'claude'}.svg" alt="" aria-hidden="true" width="36" height="36">`;
}

export function billingHelp(run) {
  if (run?.status !== 'error' || run.provider !== 'openai' || !['credits', 'quota'].includes(run.errorCode)) return '';
  return '<p class="ai-billing-help">API usage is billed separately from your ChatGPT subscription. <a href="https://platform.openai.com/settings/organization/billing" target="_blank" rel="noopener noreferrer">Open API billing ↗</a></p>';
}
