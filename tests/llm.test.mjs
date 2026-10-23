import test, { beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { complete, settings, saveSettings, defaultRoleModels, hasKey, modelInfo, cost, AIError } from '../js/ai/llm.js';

// No provider calls or real keys: HTTP is replaced and the lazy Claude SDK import
// resolves to this small stand-in, so its existing request contract is checked too.
const originalFetch = globalThis.fetch;
const local = new Map(), session = new Map();
globalThis.localStorage = { getItem: k => local.get(k), setItem: (k, v) => local.set(k, v) };
globalThis.sessionStorage = { getItem: k => session.get(k), setItem: (k, v) => session.set(k, v) };
globalThis.location = { search: '' };
let sdkCalls, sdkError;
class FakeAnthropic {
  static AuthenticationError = class extends Error {};
  static PermissionDeniedError = class extends Error {};
  static RateLimitError = class extends Error {};
  static BadRequestError = class extends Error {};
  static APIUserAbortError = class extends Error {};
  static APIError = class extends Error {};
  static APIConnectionError = class extends Error {};
  constructor(options) {
    this.beta = { messages: { stream: (body, request) => {
      sdkCalls.push({ options, body, request });
      if (sdkError) throw sdkError;
      return {
        async *[Symbol.asyncIterator]() {
          yield { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'Checking the diagram.' } };
          yield { type: 'content_block_delta', delta: { type: 'text_delta', text: '{"ops":[]}' } };
        },
        async finalMessage() { return { content: [{ type: 'text', text: '{"ops":[]}' }], model: body.model, stop_reason: 'end_turn', usage: { input_tokens: 100, cache_creation_input_tokens: 50, cache_read_input_tokens: 200, output_tokens: 30 } }; },
      };
    } } };
  }
}
globalThis.__orimTestAnthropic = FakeAnthropic;
const hook = registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@')) return { url: 'data:text/javascript,export default globalThis.__orimTestAnthropic', shortCircuit: true };
    return next(specifier, context);
  },
});

beforeEach(() => {
  local.clear(); session.clear(); location.search = ''; sdkCalls = []; sdkError = null;
  globalThis.fetch = async () => { throw new Error('Unexpected network request'); };
});
after(() => { globalThis.fetch = originalFetch; hook.deregister(); delete globalThis.__orimTestAnthropic; });

const input = {
  system: 'Return JSON edits for this diagram.',
  content: [{ type: 'image', mime: 'image/png', data: 'c291cmNl', cache: true }, { type: 'text', text: 'Match the source.' }],
};
function use(provider, extra = {}) { saveSettings({ provider, keys: { [provider]: 'test-selected-key', unrelated: 'test-other-key' }, ...extra }); }
function sse(events, { bytes = 7, newline = '\r\n', pretty = false, end = true } = {}) {
  const frames = events.map(e => ': heartbeat' + newline + 'event: message' + newline + JSON.stringify(e, null, pretty ? 2 : undefined).split('\n').map(line => 'data: ' + line).join(newline) + newline + newline).join('');
  const raw = new TextEncoder().encode(frames + (end ? 'data: [DONE]' + newline + newline : ''));
  return new Response(new ReadableStream({ start(controller) { for (let n = 0; n < raw.length; n += bytes) controller.enqueue(raw.slice(n, n + bytes)); controller.close(); } }), { headers: { 'Content-Type': 'text/event-stream' } });
}
function finished(model = 'gpt-6.1-sol', extra = {}) { return { type: 'response.completed', response: { model, status: 'completed', output: [], usage: { input_tokens: 1000, input_tokens_details: { cached_tokens: 300, cache_write_tokens: 100 }, output_tokens: 200 }, ...extra } }; }
const code = expected => e => e instanceof AIError && e.code === expected;

test('settings preserve Claude roles and restore valid per-provider models', () => {
  use('anthropic', { roles: { critic: 'claude-sonnet-5-5' }, effort: { critic: 'high' }, v: 1 });
  assert.equal(settings().roles.critic, 'claude-sonnet-5-5');
  assert.equal(settings().effort.critic, 'medium');
  use('openai', { roles: defaultRoleModels('anthropic'), providerRoles: { openai: { analyst: 'gpt-6-astra', critic: 'invalid-model' }, google: { editor: 'gemini-3.8-flash' } } });
  assert.deepEqual(settings().roles, { ...defaultRoleModels('openai'), analyst: 'gpt-6-astra' });
  assert.equal(settings().providerRoles.google.editor, 'gemini-3.8-flash');
  assert.equal(hasKey(), true);
  local.set('orim.ai.settings', 'null');
  assert.equal(settings().provider, 'anthropic');
  assert.equal(hasKey(), false);
});

test('OpenAI streams split UTF-8 and multiline SSE into the existing callbacks', async () => {
  use('openai', { effort: { analyst: 'high' } });
  const text = [], thinking = [], ctl = new AbortController();
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(options.headers.Authorization, 'Bearer test-selected-key');
    assert.equal(options.signal, ctl.signal);
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'gpt-6.1-sol');
    assert.equal(body.instructions, input.system);
    assert.equal(body.max_output_tokens, 128000);
    assert.deepEqual(body.reasoning, { effort: 'high', summary: 'auto' });
    assert.deepEqual(body.text, { format: { type: 'json_object' } });
    assert.equal(body.stream, true); assert.equal(body.store, false);
    assert.deepEqual(body.input[0].content, [{ type: 'input_image', image_url: 'data:image/png;base64,c291cmNl', detail: 'high' }, { type: 'input_text', text: 'Match the source.' }]);
    assert.ok(!options.body.includes('test-other-key'));
    return sse([{ type: 'response.reasoning_summary_text.delta', delta: 'Mätsätään…' }, { type: 'response.output_text.delta', delta: '{"ops":' }, { type: 'response.output_text.delta', delta: '[]}' }, finished('gpt-6.1-sol-2026-10-01')], { bytes: 1, pretty: true });
  };
  const result = await complete({ ...input, maxTokens: 500000, signal: ctl.signal, onText: t => text.push(t), onThinking: t => thinking.push(t) });
  assert.equal(result.text, '{"ops":[]}');
  assert.deepEqual(text, ['{"ops":', '[]}']);
  assert.deepEqual(thinking, ['Mätsätään…']);
  assert.deepEqual(result.usage, { input_tokens: 600, cache_creation_input_tokens: 100, cache_read_input_tokens: 300, output_tokens: 200 });
  assert.equal(result.cost, (600 * 2 + 100 * 2 * 1.25 + 300 * 0.1 + 200 * 10) / 1e6);
  assert.equal(result.stop, 'end_turn');
});

test('Gemini streams thought parts separately and bills the final cumulative usage once', async () => {
  use('google', { effort: { analyst: 'max' } });
  const text = [], thinking = [];
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-4-argon:streamGenerateContent?alt=sse');
    assert.equal(options.headers['x-goog-api-key'], 'test-selected-key');
    assert.ok(!url.includes('key='));
    const body = JSON.parse(options.body);
    assert.deepEqual(body.systemInstruction, { parts: [{ text: input.system }] });
    assert.deepEqual(body.contents[0].parts, [{ inlineData: { mimeType: 'image/png', data: 'c291cmNl' } }, { text: 'Match the source.' }]);
    assert.deepEqual(body.generationConfig, { maxOutputTokens: 65536, responseMimeType: 'application/json', thinkingConfig: { thinkingLevel: 'high', includeThoughts: true } });
    return sse([
      { candidates: [{ content: { parts: [{ thought: true, text: 'Checking colours.' }] } }], usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 1, thoughtsTokenCount: 20 } },
      { candidates: [{ content: { parts: [{ text: '{"ops":[]}' }] }, finishReason: 'STOP' }], modelVersion: 'gemini-4-argon-001' },
      { usageMetadata: { promptTokenCount: 1000, cachedContentTokenCount: 300, candidatesTokenCount: 100, thoughtsTokenCount: 200 } },
    ]);
  };
  const result = await complete({ ...input, maxTokens: 500000, onText: t => text.push(t), onThinking: t => thinking.push(t) });
  assert.equal(result.text, '{"ops":[]}');
  assert.deepEqual(text, ['{"ops":[]}']);
  assert.deepEqual(thinking, ['Checking colours.']);
  assert.deepEqual(result.usage, { input_tokens: 700, cache_read_input_tokens: 300, output_tokens: 300 });
  assert.equal(result.model, 'gemini-4-argon-001');
  assert.equal(result.cost, cost('gemini-4-argon', result.usage));
  assert.equal(result.stop, 'end_turn');
});

test('Claude retains adaptive thinking, source caching, callbacks and SDK retries', async () => {
  use('anthropic');
  const text = [], thinking = [], ctl = new AbortController();
  const result = await complete({ ...input, signal: ctl.signal, onText: t => text.push(t), onThinking: t => thinking.push(t) });
  const call = sdkCalls[0];
  assert.deepEqual(call.options, { apiKey: 'test-selected-key', dangerouslyAllowBrowser: true, maxRetries: 2 });
  assert.deepEqual(call.body.thinking, { type: 'adaptive', display: 'summarized' });
  assert.deepEqual(call.body.output_config, { effort: 'high' });
  assert.deepEqual(call.body.messages[0].content[0], { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'c291cmNl' }, cache_control: { type: 'ephemeral' } });
  assert.equal(call.request.signal, ctl.signal);
  assert.equal(call.body.fallbacks, 'default');
  assert.deepEqual(text, ['{"ops":[]}']);
  assert.deepEqual(thinking, ['Checking the diagram.']);
  assert.equal(result.cost, (100 * 4 + 50 * 4 * 1.25 + 200 * 0.4 + 30 * 20) / 1e6);
  sdkError = new FakeAnthropic.AuthenticationError();
  await assert.rejects(complete(input), code('auth'));
});

test('Haiku sketch keeps the refusal-fallback omission', async () => {
  use('anthropic');
  await complete({ ...input, role: 'sketch' });
  assert.equal(sdkCalls[0].body.model, 'claude-haiku-5-5');
  assert.equal(sdkCalls[0].body.fallbacks, undefined);
});

test('provider token-limit stops preserve complete partial JSON for the pipeline', async () => {
  use('openai');
  globalThis.fetch = async () => sse([{ type: 'response.output_text.delta', delta: '{"ops":[]}' }, { type: 'response.incomplete', response: { status: 'incomplete', model: 'gpt-6.1-sol', incomplete_details: { reason: 'max_output_tokens' }, usage: { input_tokens: 10, output_tokens: 20 } } }]);
  assert.equal((await complete(input)).stop, 'max_tokens');
  use('google');
  globalThis.fetch = async () => sse([{ candidates: [{ content: { parts: [{ text: '{"ops":[]}' }] }, finishReason: 'MAX_TOKENS' }] }]);
  assert.equal((await complete(input)).stop, 'max_tokens');
});

test('HTTP auth, permission, rate and request errors have consistent codes', async () => {
  for (const provider of ['openai', 'google']) for (const [status, message, expected] of [[401, 'Unauthorized', 'auth'], [403, 'Permission denied', 'permission'], [429, 'Too many requests', 'rate'], [400, 'Bad request', 'bad_request'], [400, 'API key not valid. Please pass a valid API key.', 'auth'], [503, 'Unavailable', 'api']]) {
    use(provider);
    globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: status, message } }), { status });
    await assert.rejects(complete(input), code(expected));
  }
});

test('streamed failures and refusals stop both providers', async () => {
  use('openai');
  for (const event of [{ type: 'error', code: 'rate_limit_exceeded', message: 'Slow down' }, { type: 'response.failed', response: { error: { message: 'Unavailable' } } }, { type: 'response.refusal.delta', delta: 'Declined' }]) {
    globalThis.fetch = async () => sse([event]);
    await assert.rejects(complete(input), code(event.type === 'response.refusal.delta' ? 'refusal' : event.code ? 'rate' : 'api'));
  }
  use('google');
  for (const event of [{ error: { code: 429, message: 'Slow down' } }, { promptFeedback: { blockReason: 'SAFETY' } }, { candidates: [{ finishReason: 'SAFETY' }] }]) {
    globalThis.fetch = async () => sse([event]);
    await assert.rejects(complete(input), code(event.error ? 'rate' : 'refusal'));
  }
});

test('broken or incomplete streams report errors instead of a false success', async () => {
  for (const provider of ['openai', 'google']) {
    use(provider);
    globalThis.fetch = async () => sse([]);
    await assert.rejects(complete(input), code('network'));
    globalThis.fetch = async () => new Response('data: {broken}\n\n');
    await assert.rejects(complete(input), code('bad_reply'));
    globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
    await assert.rejects(complete(input), code('network'));
  }
});

test('aborting before or during a stream prevents later callbacks', async () => {
  for (const provider of ['openai', 'google']) {
    use(provider);
    const before = new AbortController(); before.abort();
    await assert.rejects(complete({ ...input, signal: before.signal }), code('aborted'));
    const ctl = new AbortController(), text = [];
    globalThis.fetch = async () => sse(provider === 'openai' ? [{ type: 'response.reasoning_summary_text.delta', delta: 'Thinking' }, { type: 'response.output_text.delta', delta: '{}' }, finished()] : [{ candidates: [{ content: { parts: [{ thought: true, text: 'Thinking' }] } }] }, { candidates: [{ content: { parts: [{ text: '{}' }] }, finishReason: 'STOP' }] }], { bytes: 100000 });
    await assert.rejects(complete({ ...input, signal: ctl.signal, onThinking: () => ctl.abort(), onText: t => text.push(t) }), code('aborted'));
    assert.deepEqual(text, []);
  }
});

test('missing keys fail locally and mock mode uses no provider or CDN', async () => {
  saveSettings({ provider: 'openai' });
  await assert.rejects(complete(input), code('no_key'));
  location.search = '?mock';
  assert.equal(hasKey(), true);
  const result = await complete({ ...input, role: 'sketch' });
  assert.equal(result.model, 'mock');
  assert.equal(result.cost, 0);
  assert.equal(sdkCalls.length, 0);
  assert.ok(JSON.parse(result.text).boxes.length);
});

test('costs recognize returned model versions and GPT-6 long-context pricing', () => {
  assert.equal(modelInfo('gpt-6.1-sol-2026-10-01').id, 'gpt-6.1-sol');
  assert.equal(cost('gpt-6.1-sol', { input_tokens: 300000, output_tokens: 1000 }), (300000 * 4 + 1000 * 15) / 1e6);
  assert.equal(cost('claude-opus-5-5', { input_tokens: 300000, output_tokens: 1000 }), (300000 * 4 + 1000 * 20) / 1e6);
});
