import { settings } from './llm.js';

export const providerNames = { anthropic: 'Claude', openai: 'ChatGPT', google: 'Gemini' };
const logos = { anthropic: 'claude', openai: 'openai', google: 'gemini' };
export function providerMark(provider = settings().provider) {
  return `<img class="provider-mark" src="assets/providers/${logos[provider] || 'claude'}.svg" alt="" aria-hidden="true" width="36" height="36">`;
}
