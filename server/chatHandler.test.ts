import { describe, expect, it } from 'vitest';
import { checkRequest, handleChat, publicConfig, type ProviderConfig } from './chatHandler';
import { defaultDesign } from '../src/state/defaults';
import type { ChatProvider } from '../src/ai/agent';

const okProvider: ChatProvider = {
  userMessage: (t) => [{ role: 'user', content: t }],
  toolResults: () => [],
  step: async () => ({ assistant: { role: 'assistant', content: 'hi' }, text: 'Hello', toolCalls: [], stop: 'end' }),
};
const body = (over: Record<string, unknown> = {}) => ({
  settings: { provider: 'anthropic' },
  history: [],
  message: 'make it oak',
  design: defaultDesign(),
  ...over,
});

describe('handleChat', () => {
  it('runs the agent and returns design, history and reply', async () => {
    const r = await handleChat(body(), {}, () => okProvider);
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ reply: 'Hello', changes: [] });
    expect((r.json as { history: unknown[] }).history).toHaveLength(2);
  });

  it.each([
    ['not an object', 'nope'],
    ['empty message', body({ message: '  ' })],
    ['huge message', body({ message: 'x'.repeat(10001) })],
    ['invalid design', body({ design: { version: 1 } })],
    ['history not an array', body({ history: 'x' })],
    ['unknown provider', body({ settings: { provider: 'skynet' } })],
  ])('rejects %s with 400', async (_, b) => {
    const r = await handleChat(b, {}, () => okProvider);
    expect(r.status).toBe(400);
    expect((r.json as { error: string }).error).toBeTruthy();
  });

  it('openai-compatible needs a base URL and model (from settings or env)', async () => {
    const r = await handleChat(body({ settings: { provider: 'openai-compatible' } }), {}, () => okProvider);
    expect(r.status).toBe(400);
    expect((r.json as { error: string }).error).toMatch(/base URL/);
    const r2 = await handleChat(body({ settings: { provider: 'openai-compatible' } }), { LLM_BASE_URL: 'http://x/v1', LLM_MODEL: 'm' }, () => okProvider);
    expect(r2.status).toBe(200);
  });

  it('reports provider failures as 502 with a readable message and no design change', async () => {
    const failing: ChatProvider = { ...okProvider, step: async () => { throw new Error('connection refused'); } };
    const r = await handleChat(body(), {}, () => failing);
    expect(r.status).toBe(502);
    expect((r.json as { error: string }).error).toMatch(/connection refused/);
  });

  it('passes settings and env keys to the provider factory, settings first', async () => {
    let seen: unknown;
    await handleChat(body({ settings: { provider: 'anthropic', apiKey: 'from-ui', model: 'claude-sonnet-5-5' } }), { ANTHROPIC_API_KEY: 'from-env' }, (cfg) => {
      seen = cfg;
      return okProvider;
    });
    expect(seen).toMatchObject({ provider: 'anthropic', apiKey: 'from-ui', model: 'claude-sonnet-5-5' });
  });
});

describe('publicConfig', () => {
  it('says which keys exist without revealing them', () => {
    const c = publicConfig({ ANTHROPIC_API_KEY: 'secret', LLM_BASE_URL: 'http://localhost:11434/v1', LLM_MODEL: 'qwen3' });
    expect(c).toEqual({ anthropicKey: true, llmKey: false, llmBaseUrl: 'http://localhost:11434/v1', llmModel: 'qwen3' });
    expect(JSON.stringify(c)).not.toContain('secret');
  });
});

describe('keys never follow a browser-supplied URL', () => {
  const capture = () => {
    const seen: ProviderConfig[] = [];
    return { seen, factory: (cfg: ProviderConfig) => (seen.push(cfg), okProvider) };
  };

  it('anthropic: the env key is not used with a custom base URL', async () => {
    const c = capture();
    await handleChat(body({ settings: { provider: 'anthropic', baseUrl: 'https://evil.example' } }), { ANTHROPIC_API_KEY: 'secret' }, c.factory);
    expect(c.seen[0].apiKey).toBeUndefined();
  });

  it('anthropic: the env key is used with the default URL', async () => {
    const c = capture();
    await handleChat(body(), { ANTHROPIC_API_KEY: 'secret' }, c.factory);
    expect(c.seen[0].apiKey).toBe('secret');
  });

  it('openai-compatible: LLM_API_KEY only goes to LLM_BASE_URL', async () => {
    const c = capture();
    const env = { LLM_API_KEY: 'secret', LLM_BASE_URL: 'http://localhost:11234/v1', LLM_MODEL: 'm' };
    await handleChat(body({ settings: { provider: 'openai-compatible', baseUrl: 'http://169.254.169.254/v1' } }), env, c.factory);
    await handleChat(body({ settings: { provider: 'openai-compatible' } }), env, c.factory);
    await handleChat(body({ settings: { provider: 'openai-compatible', baseUrl: 'http://localhost:11234/v1/' } }), env, c.factory);
    expect(c.seen.map((s) => s.apiKey)).toEqual([undefined, 'secret', 'secret']);
  });
});

describe('history limits', () => {
  it('rejects a conversation that is too long instead of silently dropping turns', async () => {
    const r = await handleChat(body({ history: Array.from({ length: 401 }, () => ({ role: 'user', content: 'x' })) }), {}, () => okProvider);
    expect(r.status).toBe(400);
    expect((r.json as { error: string }).error).toMatch(/New chat/);
  });
});

describe('checkRequest (cross-site protection)', () => {
  it.each([
    ['same-origin JSON', { 'content-type': 'application/json', origin: 'http://192.168.0.224:5173', host: '192.168.0.224:5173' }, null],
    ['no Origin (curl, server-side tools)', { 'content-type': 'application/json; charset=utf-8', host: 'localhost:5173' }, null],
    ['text/plain from a web page', { 'content-type': 'text/plain', origin: 'https://evil.example', host: 'localhost:5173' }, 415],
    ['JSON from another origin', { 'content-type': 'application/json', origin: 'https://evil.example', host: 'localhost:5173' }, 403],
    ['missing content type', { host: 'localhost:5173' }, 415],
  ])('%s', (_, headers, status) => {
    expect(checkRequest(headers)?.status ?? null).toBe(status);
  });
});
