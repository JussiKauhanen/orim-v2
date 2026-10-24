// Model access through one streaming interface. Keys stay in this browser
// (localStorage) and are sent only to the selected provider's API.

const LS = 'orim.ai.settings';
// Published introductory Gemini rates double on these dates (USD per million tokens).
// https://ai.google.dev/gemini-api/docs/pricing
const argonRate = Date.now() < Date.UTC(2026, 11, 1) ? 1 : 2;
const flashRate = Date.now() < Date.UTC(2027, 0, 1) ? 1 : 2;
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
  // https://developers.openai.com/api/docs/models
  openai: {
    name: 'OpenAI', keyHint: 'sk-…', console: 'https://platform.openai.com/api-keys',
    models: [
      { id: 'gpt-6.1-sol', name: 'GPT-6.1 Sol', in: 2, cached: 0.1, out: 10 },
      { id: 'gpt-6-astra', name: 'GPT-6 Astra', in: 10, cached: 1, out: 50 },
      { id: 'gpt-6-luna', name: 'GPT-6 Luna', in: 0.1, cached: 0.01, out: 0.5 },
    ],
  },
  google: {
    name: 'Google Gemini', keyHint: 'AIza…', console: 'https://aistudio.google.com/apikey',
    models: [
      { id: 'gemini-4-argon', name: 'Gemini 4 Argon', in: 2 * argonRate, cached: 0.1 * argonRate, out: 10 * argonRate },
      { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', in: 0.75 * flashRate, cached: 0.075 * flashRate, out: 3.75 * flashRate },
    ],
  },
};

export function defaultRoleModels(provider = 'anthropic') {
  const [main, sketch] = {
    anthropic: ['claude-opus-5-5', 'claude-haiku-5-5'],
    openai: ['gpt-6.1-sol', 'gpt-6-luna'],
    google: ['gemini-4-argon', 'gemini-3.8-flash'],
  }[provider] || ['claude-opus-5-5', 'claude-haiku-5-5'];
  return { analyst: main, designer: main, critic: main, editor: main, sketch };
}

// Complete, editable starting points for the simple quality picker. No keys or
// saved settings are touched; the settings dialog applies a preset to its draft.
export function qualityPreset(provider, tier = 'medium') {
  provider = Object.hasOwn(PROVIDERS, provider) ? provider : 'anthropic';
  const [cheap, balanced, strongest] = {
    anthropic: ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-fable-5-1'],
    openai: ['gpt-6-luna', 'gpt-6.1-sol', 'gpt-6-astra'],
    google: ['gemini-3.8-flash', 'gemini-4-argon', 'gemini-4-argon'],
  }[provider];
  const low = tier === 'cheap', high = tier === 'high';
  const main = low ? cheap : high ? strongest : balanced;
  return {
    roles: { analyst: main, designer: main, critic: main, editor: main, sketch: cheap },
    effort: { analyst: low ? 'medium' : 'high', designer: low ? 'low' : high ? 'high' : 'medium', critic: low ? 'low' : high ? 'high' : 'medium', editor: low ? 'low' : high ? 'high' : 'medium', sketch: 'low' },
    iterations: low ? 1 : high ? 3 : 2,
    designAttempts: low ? 1 : high ? 3 : 2,
    budget: low ? 1 : high ? 8 : 3,
    measure: true,
  };
}

const DEFAULTS = {
  provider: 'anthropic', keys: {},
  ...qualityPreset('anthropic', 'medium'), v: 2,
};
export function settings() {
  let s = {}; try { s = JSON.parse(localStorage.getItem(LS) || '{}'); } catch (_) {}
  if (!s || typeof s !== 'object' || Array.isArray(s)) s = {};
  if (s.effort && (s.v || 1) < 2) { if (s.effort.critic === 'high') s.effort.critic = 'medium'; s.v = 2; }
  const provider = Object.hasOwn(PROVIDERS, s.provider) ? s.provider : DEFAULTS.provider;
  const tuning = s.providerTuning?.[provider] || {};
  const saved = { ...(s.roles || {}), ...(s.providerRoles?.[provider] || {}) };
  const roles = qualityPreset(provider, 'medium').roles;
  for (const role of Object.keys(roles)) if (PROVIDERS[provider].models.some(m => m.id === saved[role])) roles[role] = saved[role];
  return { ...DEFAULTS, ...s, ...tuning, provider, roles, providerRoles: { ...(s.providerRoles || {}), [provider]: { ...roles } }, effort: { ...DEFAULTS.effort, ...(s.effort || {}), ...(tuning.effort || {}) }, keys: { ...(s.keys || {}) } };
}
export function saveSettings(s) { try { localStorage.setItem(LS, JSON.stringify(s)); } catch (_) {} }
export const mockMode = () => { try { if (/[?&]mock\b/.test(location.search)) sessionStorage.setItem('orim.mock', '1'); return sessionStorage.getItem('orim.mock') === '1'; } catch (_) { return false; } };
export const hasKey = () => mockMode() || !!settings().keys[settings().provider];
export const modelInfo = id => Object.values(PROVIDERS).flatMap(p => p.models).find(m => m.id === id || id?.startsWith(m.id + '-')) || { name: id, in: 4, out: 20 };
export function cost(model, usage) {
  if (!usage) return 0;
  const m = modelInfo(model);
  const input = usage.input_tokens || 0, created = usage.cache_creation_input_tokens || 0, cached = usage.cache_read_input_tokens || 0;
  // GPT-6 long-context rates apply to the whole request above 272K input tokens.
  const long = /^gpt-6/.test(model) && input + created + cached > 272000;
  return ((input * m.in + created * m.in * 1.25 + cached * (m.cached ?? m.in * 0.1)) * (long ? 2 : 1) + (usage.output_tokens || 0) * m.out * (long ? 1.5 : 1)) / 1e6;
}

export class AIError extends Error { constructor(code, msg) { super(msg); this.code = code; } }

// content: array of {type:'text', text} | {type:'image', mime, data}
export async function complete({ role = 'analyst', system, content, maxTokens = 32000, signal, onText, onThinking, model }) {
  if (mockMode()) { const { mockComplete } = await import('./mock.js'); try { return await mockComplete({ role, system, content, onText, onThinking, signal }); } catch (e) { throw e.code ? new AIError(e.code, e.message) : e; } }
  const s = settings();
  const key = s.keys[s.provider];
  if (!key) throw new AIError('no_key', 'Add an API key in Settings first.');
  model = model || s.roles[role];
  if (signal?.aborted) throw new AIError('aborted', 'Stopped.');
  try {
    const args = { key, model, system, content, maxTokens, signal, onText, onThinking, effort: s.effort[role] || 'high' };
    const res = s.provider === 'openai' ? await openAI(args) : s.provider === 'google' ? await gemini(args) : await claude(args);
    return { ...res, cost: cost(res.model, res.usage) };
  } catch (e) {
    if (signal?.aborted || e.name === 'AbortError') throw new AIError('aborted', 'Stopped.');
    if (e instanceof AIError) throw e;
    if (e instanceof TypeError) throw new AIError('network', 'Could not reach the API. Check your connection and try again.');
    throw e;
  }
}

async function claude({ key, model, system, content, maxTokens, signal, onText, onThinking, effort }) {
  // Load only for Claude requests, so the editor and mock mode work without this CDN.
  const { default: Anthropic } = await import('https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.131.0/+esm');
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 2 });
  // b.cache marks the end of a prefix worth caching (e.g. the source image reused by every critic round)
  const blocks = content.map(b => ({ ...(b.type === 'image' ? { type: 'image', source: { type: 'base64', media_type: b.mime, data: b.data } } : { type: 'text', text: b.text }), ...(b.cache ? { cache_control: { type: 'ephemeral' } } : {}) }));
  const req = {
    model, max_tokens: maxTokens,
    thinking: { type: 'adaptive', display: 'summarized' },
    output_config: { effort },
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
    return { text, usage: msg.usage, model: msg.model, stop: msg.stop_reason };
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

// Native SSE for OpenAI and Gemini. Decode incrementally: network chunks can split
// UTF-8 characters, CRLF separators and JSON in the middle of a streaming event.
async function* streamJson(url, headers, body, signal) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw apiError(response.status, error.error || error);
  }
  if (!response.body) throw new AIError('network', 'The API returned no response stream.');
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      if (signal?.aborted) throw new AIError('aborted', 'Stopped.');
      const { done, value } = await reader.read();
      if (signal?.aborted) throw new AIError('aborted', 'Stopped.');
      buffer += decoder.decode(value, { stream: !done }) + (done ? '\n\n' : '');
      let end;
      while ((end = /\r?\n\r?\n|\r\r/.exec(buffer))) {
        if (signal?.aborted) throw new AIError('aborted', 'Stopped.');
        const frame = buffer.slice(0, end.index); buffer = buffer.slice(end.index + end[0].length);
        const data = frame.split(/\r\n|\r|\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
        if (!data || data === '[DONE]') continue;
        let event; try { event = JSON.parse(data); } catch (_) { throw new AIError('bad_reply', 'The API sent an unreadable streaming event.'); }
        yield event;
      }
      if (done) break;
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

function apiError(status, error = {}) {
  const message = error.message || 'The API request failed.';
  if (status === 401 || /invalid[_ ]api[_ ]key|api key not valid/i.test(`${error.code || ''} ${message}`)) return new AIError('auth', 'The API key was rejected. Check it in Settings.');
  if (status === 403) return new AIError('permission', 'This key does not have access to the selected model.');
  if (status === 429 || error.code === 'rate_limit_exceeded') return new AIError('rate', 'Rate limited by the API. Try again in a minute.');
  if (status === 400 || status === 404) return new AIError('bad_request', 'The API rejected the request: ' + message);
  return new AIError('api', message);
}

// https://developers.openai.com/api/docs/guides/streaming-responses
async function openAI({ key, model, system, content, maxTokens, signal, onText, onThinking, effort }) {
  // All offered GPT-6 models support these efforts; Gemini maps max to high below.
  effort = ['low', 'medium', 'high', 'xhigh', 'max'].includes(effort) ? effort : 'low';
  const body = {
    model, instructions: system, stream: true, store: false,
    max_output_tokens: Math.min(maxTokens, 128000),
    reasoning: { effort, summary: 'auto' },
    text: { format: { type: 'json_object' } },
    // JSON mode validates the input messages, separately from `instructions`.
    input: [{ role: 'user', content: [...content.map(b => b.type === 'image' ? { type: 'input_image', image_url: `data:${b.mime};base64,${b.data}`, detail: 'high' } : { type: 'input_text', text: b.text }), { type: 'input_text', text: 'Return only a valid JSON object following the format in the instructions.' }] }],
  };
  let text = '', final = null;
  for await (const event of streamJson('https://api.openai.com/v1/responses', { Authorization: 'Bearer ' + key }, body, signal)) {
    if (event.type === 'response.output_text.delta') { text += event.delta; onText?.(event.delta); }
    else if (event.type === 'response.reasoning_summary_text.delta') onThinking?.(event.delta);
    else if (event.type === 'response.refusal.delta' || event.type === 'response.refusal.done') throw new AIError('refusal', 'The model declined this request.');
    else if (event.type === 'error' || event.type === 'response.failed') throw apiError(0, event.error || event.response?.error || event);
    else if (event.type === 'response.completed' || event.type === 'response.incomplete') final = event.response;
  }
  if (!final) throw new AIError('network', 'The API stream ended before the response finished.');
  const parts = (final.output || []).flatMap(item => item.content || []);
  if (parts.some(p => p.type === 'refusal') || final.incomplete_details?.reason === 'content_filter') throw new AIError('refusal', 'The model declined this request.');
  if (!text) { text = parts.filter(p => p.type === 'output_text').map(p => p.text).join(''); if (text) onText?.(text); }
  const u = final.usage || {}, cached = u.input_tokens_details?.cached_tokens || 0, created = u.input_tokens_details?.cache_write_tokens || 0;
  const usage = { input_tokens: Math.max(0, (u.input_tokens || 0) - cached - created), cache_creation_input_tokens: created, cache_read_input_tokens: cached, output_tokens: u.output_tokens || 0 };
  return { text, usage, model: final.model || model, stop: final.status === 'incomplete' ? 'max_tokens' : 'end_turn' };
}

// https://ai.google.dev/api/generate-content#method:-models.streamgeneratecontent
async function gemini({ key, model, system, content, maxTokens, signal, onText, onThinking, effort }) {
  const thinkingLevel = ['low', 'medium', 'high'].includes(effort) ? effort : ['max', 'xhigh'].includes(effort) ? 'high' : 'low';
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: content.map(b => b.type === 'image' ? { inlineData: { mimeType: b.mime, data: b.data } } : { text: b.text }) }],
    generationConfig: { maxOutputTokens: Math.min(maxTokens, 65536), responseMimeType: 'application/json', thinkingConfig: { thinkingLevel, includeThoughts: true } },
  };
  let text = '', usage = {}, stop = null, actualModel = model;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
  for await (const event of streamJson(url, { 'x-goog-api-key': key }, body, signal)) {
    if (event.error) throw apiError(event.error.code, event.error);
    if (event.promptFeedback?.blockReason) throw new AIError('refusal', 'The model declined this request: ' + event.promptFeedback.blockReason);
    const candidate = event.candidates?.[0];
    for (const part of candidate?.content?.parts || []) if (part.text) {
      if (part.thought) onThinking?.(part.text);
      else { text += part.text; onText?.(part.text); }
    }
    if (candidate?.finishReason) {
      const reason = candidate.finishReason;
      if (reason !== 'STOP' && reason !== 'MAX_TOKENS') throw new AIError('refusal', 'The model stopped this request: ' + reason);
      stop = reason === 'MAX_TOKENS' ? 'max_tokens' : 'end_turn';
    }
    if (event.modelVersion) actualModel = event.modelVersion;
    if (event.usageMetadata) {
      const u = event.usageMetadata, cached = u.cachedContentTokenCount || 0;
      usage = { input_tokens: Math.max(0, (u.promptTokenCount || 0) - cached), cache_read_input_tokens: cached, output_tokens: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0) };
    }
  }
  if (!stop) throw new AIError('network', 'The API stream ended before the response finished.');
  return { text, usage, model: actualModel, stop };
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
