// Model access. One small interface (complete) so other providers can be added beside
// Claude; for now only Anthropic is wired up. Keys stay in this browser (localStorage)
// and are sent only to the provider's API.

import Anthropic from 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.131.0/+esm';

const LS = 'orim.ai.settings';
export const PROVIDERS = {
  anthropic: {
    name: 'Anthropic Claude', keyHint: 'sk-ant-…', console: 'https://platform.claude.com/settings/keys',
    models: [
      { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', in: 4, out: 20 },
      { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', in: 2, out: 10 },
      { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5', in: 0.1, out: 0.5 },
      { id: 'claude-fable-5-1', name: 'Claude Fable 5.1', in: 10, out: 50 },
    ],
  },
  openai: { name: 'OpenAI (not wired up yet)', disabled: true, models: [] },
  google: { name: 'Google Gemini (not wired up yet)', disabled: true, models: [] },
};

const DEFAULTS = {
  provider: 'anthropic', keys: {},
  roles: { analyst: 'claude-opus-5-5', designer: 'claude-opus-5-5', critic: 'claude-opus-5-5', editor: 'claude-opus-5-5', sketch: 'claude-haiku-5-5' },
  // Medium effort for critic and editor: their work is mostly mechanical edits, and reasoning tokens are billed as output.
  effort: { analyst: 'high', designer: 'medium', critic: 'medium', editor: 'medium', sketch: 'low' },
  iterations: 3, designAttempts: 3, measure: true, budget: 3, v: 2,
};
export function settings() {
  let s = {}; try { s = JSON.parse(localStorage.getItem(LS) || '{}'); } catch (_) {}
  if (s.effort && (s.v || 1) < 2) { if (s.effort.critic === 'high') s.effort.critic = 'medium'; s.v = 2; }
  return { ...DEFAULTS, ...s, roles: { ...DEFAULTS.roles, ...(s.roles || {}) }, effort: { ...DEFAULTS.effort, ...(s.effort || {}) }, keys: { ...(s.keys || {}) } };
}
export function saveSettings(s) { try { localStorage.setItem(LS, JSON.stringify(s)); } catch (_) {} }
export const mockMode = () => { try { if (/[?&]mock\b/.test(location.search)) sessionStorage.setItem('orim.mock', '1'); return sessionStorage.getItem('orim.mock') === '1'; } catch (_) { return false; } };
export const hasKey = () => mockMode() || !!settings().keys[settings().provider];
export const modelInfo = id => Object.values(PROVIDERS).flatMap(p => p.models).find(m => m.id === id) || { name: id, in: 4, out: 20 };
export function cost(model, usage) {
  if (!usage) return 0;
  const m = modelInfo(model);
  const inTok = (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) * 1.25 + (usage.cache_read_input_tokens || 0) * 0.1;
  return (inTok * m.in + (usage.output_tokens || 0) * m.out) / 1e6;
}

export class AIError extends Error { constructor(code, msg) { super(msg); this.code = code; } }

// content: array of {type:'text', text} | {type:'image', mime, data}
export async function complete({ role = 'analyst', system, content, maxTokens = 32000, signal, onText, onThinking, model }) {
  if (mockMode()) { const { mockComplete } = await import('./mock.js'); try { return await mockComplete({ role, system, content, onText, onThinking, signal }); } catch (e) { throw e.code ? new AIError(e.code, e.message) : e; } }
  const s = settings();
  const key = s.keys[s.provider];
  if (!key) throw new AIError('no_key', 'Add an API key in Settings first.');
  model = model || s.roles[role];
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 2 });
  // b.cache marks the end of a prefix worth caching (e.g. the source image reused by every critic round)
  const blocks = content.map(b => ({ ...(b.type === 'image' ? { type: 'image', source: { type: 'base64', media_type: b.mime, data: b.data } } : { type: 'text', text: b.text }), ...(b.cache ? { cache_control: { type: 'ephemeral' } } : {}) }));
  const req = {
    model, max_tokens: maxTokens,
    thinking: { type: 'adaptive', display: 'summarized' },
    output_config: { effort: s.effort[role] || 'high' },
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: blocks }],
  };
  // Server-side refusal fallback (not offered on Haiku).
  if (!/haiku/.test(model)) { req.betas = ['server-side-fallback-2026-07-01']; req.fallbacks = 'default'; }
  let stream;
  try {
    stream = client.beta.messages.stream(req, { signal });
    for await (const ev of stream) {
      if (ev.type === 'content_block_delta') {
        if (ev.delta.type === 'text_delta') onText && onText(ev.delta.text);
        else if (ev.delta.type === 'thinking_delta') onThinking && onThinking(ev.delta.thinking);
      }
    }
    const msg = await stream.finalMessage();
    if (msg.stop_reason === 'refusal') throw new AIError('refusal', 'The model declined this request' + (msg.stop_details?.explanation ? ': ' + msg.stop_details.explanation : '.'));
    const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
    return { text, usage: msg.usage, model: msg.model, stop: msg.stop_reason, cost: cost(msg.model, msg.usage) };
  } catch (e) {
    if (e instanceof AIError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new AIError('auth', 'The API key was rejected. Check it in Settings.');
    if (e instanceof Anthropic.PermissionDeniedError) throw new AIError('permission', 'This key has no access to ' + model + '.');
    if (e instanceof Anthropic.RateLimitError) throw new AIError('rate', 'Rate limited by the API. Try again in a minute.');
    if (e instanceof Anthropic.BadRequestError) throw new AIError('bad_request', 'The API rejected the request: ' + (e.message || ''));
    if (e instanceof Anthropic.APIUserAbortError || e.name === 'AbortError') throw new AIError('aborted', 'Stopped.');
    if (e instanceof Anthropic.APIError) throw new AIError('api', `API error ${e.status || ''}: ${e.message}`);
    if (e instanceof Anthropic.APIConnectionError) throw new AIError('network', 'Could not reach the API: ' + e.message);
    throw e;
  }
}

// ---------- JSON helpers ----------
export function extractJson(text) {
  let t = text.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t); if (fence) t = fence[1];
  const a = t.indexOf('{'); if (a < 0) throw new Error('no JSON in reply');
  t = t.slice(a);
  try { return JSON.parse(t); } catch (_) {}
  // trim trailing junk after the last balanced brace
  const end = balancedEnd(t, 0); if (end > 0) { try { return JSON.parse(t.slice(0, end + 1)); } catch (_) {} }
  return JSON.parse(t.replace(/,\s*([}\]])/g, '$1'));
}
function balancedEnd(t, from) {
  let depth = 0, inStr = false, esc = false;
  for (let i = from; i < t.length; i++) {
    const c = t[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true; else if (c === '{' || c === '[') depth++; else if (c === '}' || c === ']') { depth--; if (depth === 0) return i; }
  }
  return -1;
}
// Complete objects inside the array named `key` of a partial JSON stream.
export function partialArray(text, key) {
  const m = new RegExp('"' + key + '"\\s*:\\s*\\[').exec(text); if (!m) return [];
  const out = []; let i = m.index + m[0].length;
  for (;;) {
    while (i < text.length && /[\s,]/.test(text[i])) i++;
    if (text[i] !== '{') break;
    const e = balancedEnd(text, i); if (e < 0) break;
    try { out.push(JSON.parse(text.slice(i, e + 1))); } catch (_) { break; }
    i = e + 1;
  }
  return out;
}
export function partialObject(text, key) {
  const m = new RegExp('"' + key + '"\\s*:\\s*\\{').exec(text); if (!m) return null;
  const s = m.index + m[0].length - 1, e = balancedEnd(text, s); if (e < 0) return null;
  try { return JSON.parse(text.slice(s, e + 1)); } catch (_) { return null; }
}
