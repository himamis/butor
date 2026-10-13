import { describe, expect, it, vi } from 'vitest';
import { noNewIds, rebase, type Design } from '../../src/core';
import { catalog } from '../../src/catalog';
import { newDesign } from '../../src/app/store';
import { createApp } from '../app';
import { MAX_MODEL_CALLS, runTurn } from './agent';
import { TOOL_NAME, systemPrompt, toolDef } from './prompt';
import { anthropicAdapter, anthropicRequest } from './providers/anthropic';
import { openAiAdapter, openAiRequest, thinkFilter } from './providers/openai';
import type { ModelTurn, ProviderAdapter, ToolCall } from './providers/types';
import { resolveCredentials } from './security';

/* ───────────── a scripted provider: each call returns the next scripted turn ───────────── */

type Script = (step: number, history: unknown[]) => Partial<ModelTurn> & { toolCalls?: ToolCall[] };
function fake(script: Script): ProviderAdapter & { calls: number } {
  const p = {
    id: 'openai' as const,
    calls: 0,
    async call(history: unknown[], _s: string, _t: unknown, _sig: AbortSignal, onText: (d: string) => void) {
      const t = script(p.calls++, history);
      if (t.text) onText(t.text);
      return {
        assistant: { role: 'assistant', step: p.calls },
        text: t.text ?? '',
        toolCalls: t.toolCalls ?? [],
        stop: t.stop ?? (t.toolCalls?.length ? 'tool_use' : 'end'),
      } as ModelTurn;
    },
    userMessage: (text: string) => [{ role: 'user', content: text }],
    toolResults: (rs: { id: string; content: string; isError: boolean }[]) =>
      rs.map((r) => ({ role: 'tool', id: r.id, content: r.content, isError: r.isError })),
  };
  return p;
}
const call = (operations: unknown, id = 't1', name = TOOL_NAME): ToolCall => ({ id, name, input: { operations } });
const addUnit = {
  type: 'entity.add',
  entity: {
    kind: 'unit',
    template: { id: 'unit.standard' },
    position: { x: 1000, z: 300 },
    size: { w: 800, h: 2000, d: 600 },
  },
};
const design = (): Design => ({ ...newDesign(), id: 'd1' });
const run = (p: ProviderAdapter, d = design(), history: unknown[] = []) =>
  runTurn(p, { message: 'add a unit', design: d, history }, new AbortController().signal, () => undefined);
const lastResult = (h: unknown[]) =>
  h.filter((m) => (m as { role: string }).role === 'tool').at(-1) as { content: string; isError: boolean };

describe('agent loop', () => {
  it('applies a tool call, answers it, and returns one transaction that replays with the same ids', async () => {
    const p = fake((step) => (step === 0 ? { toolCalls: [call([addUnit])] } : { text: 'Added a unit.' }));
    const d = design();
    const out = await run(p, d);
    expect(out.reply).toBe('Added a unit.');
    expect(out.transaction.ops).toHaveLength(1);
    expect(out.changes).toHaveLength(1);
    expect(out.history).toHaveLength(4); // user, assistant, tool result, assistant
    const created = JSON.parse(lastResult(out.history).content).results[0].created[0];
    // the browser replays it without making any id: the ops carry them all
    const r = rebase(d, out.transaction, out.baseRevision, {
      newId: noNewIds,
      now: () => '',
      catalog,
      mode: 'strict',
    });
    expect(r.ok).toBe(true);
    expect(r.doc.order).toEqual([created]);
  });

  it('malformed operations change nothing and are reported to the model with the problem', async () => {
    const bad = {
      type: 'entity.add',
      entity: { kind: 'unit', template: { id: 'unit.standard' }, position: { x: 'left' } },
    };
    const p = fake((step) => (step === 0 ? { toolCalls: [call([addUnit, bad])] } : { text: 'Sorry.' }));
    const out = await run(p);
    expect(out.transaction.ops).toEqual([]);
    const res = lastResult(out.history);
    expect(res.isError).toBe(true);
    expect(JSON.parse(res.content)).toMatchObject({ applied: 0, invalid: [{ index: 1, type: 'entity.add' }] });
  });

  it('operations that do not apply are reported per operation; the others still apply', async () => {
    const p = fake((step) =>
      step === 0 ? { toolCalls: [call([addUnit, { type: 'entity.remove', ids: ['nope'] }])] } : {},
    );
    const out = await run(p);
    expect(out.transaction.ops).toHaveLength(1);
    const res = JSON.parse(lastResult(out.history).content);
    expect(res.applied).toBe(1);
    expect(res.results[1]).toMatchObject({ ok: false, message: expect.stringContaining('nope') });
  });

  it('unknown tools, invalid JSON and cut-off replies are answered with errors', async () => {
    const p = fake((step) =>
      step === 0
        ? {
            toolCalls: [
              call([addUnit], 'a', 'delete_everything'),
              { id: 'b', name: TOOL_NAME, input: null, inputError: 'Unexpected end' },
            ],
          }
        : step === 1
          ? { toolCalls: [call([addUnit], 'c')], stop: 'max_tokens' }
          : {},
    );
    const out = await run(p);
    const tools = out.history.filter((m) => (m as { role: string }).role === 'tool') as {
      id: string;
      content: string;
    }[];
    expect(tools.map((t) => t.id)).toEqual(['a', 'b', 'c']);
    expect(tools[0]!.content).toContain(`only tool is ${TOOL_NAME}`);
    expect(tools[1]!.content).toContain('not valid JSON');
    expect(tools[2]!.content).toContain('cut off');
    expect(out.transaction.ops).toEqual([]);
  });

  it('a refusal applies nothing and leaves the history exactly as it was', async () => {
    const before = [
      { role: 'user', content: 'earlier' },
      { role: 'assistant', content: 'ok' },
    ];
    const p = fake(() => ({ stop: 'refusal', toolCalls: [call([addUnit])] }));
    const out = await run(p, design(), before);
    expect(out.stopped).toBe('refusal');
    expect(out.history).toBe(before);
    expect(out.transaction.ops).toEqual([]);
    expect(out.reply).toContain('declined');
  });

  it(`stops after ${MAX_MODEL_CALLS} model calls`, async () => {
    const p = fake((step) => ({
      toolCalls: [
        call([{ ...addUnit, entity: { ...addUnit.entity, position: { x: 500 + step * 50, z: 300 } } }], `s${step}`),
      ],
    }));
    const out = await run(p);
    expect(p.calls).toBe(MAX_MODEL_CALLS);
    expect(out.stopped).toBe('limit');
  });

  it('the design goes with the user message; prompt and tool are generated from the catalog', async () => {
    const p = fake(() => ({ text: 'ok' }));
    const out = await run(p);
    expect((out.history[0] as { content: string }).content).toMatch(/<design>\n\{"name":"Untitled design","room":/);
    const sys = systemPrompt();
    for (const t of catalog.all()) expect(sys).toContain(`- ${t.id} (`);
    expect(sys).toBe(systemPrompt()); // deterministic (keeps thinking blocks and caches valid)
    const schema = JSON.stringify(toolDef().schema);
    expect(schema).toContain('"entity.add"');
    expect(schema).toContain('"unit.front.add"');
  });
});

/* ───────────── adapters ───────────── */

describe('Anthropic adapter', () => {
  it('request: opus 5.5 gets effort and the fallback beta; no tool_choice, no thinking; eager input streaming', () => {
    const r = anthropicRequest({ model: 'claude-opus-5-5', effort: 'medium' }, [], 'sys', toolDef());
    expect(r).toMatchObject({
      model: 'claude-opus-5-5',
      max_tokens: 64000,
      output_config: { effort: 'medium' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    expect(r.tools[0]).toMatchObject({ name: TOOL_NAME, eager_input_streaming: true });
    expect(r).not.toHaveProperty('tool_choice');
    expect(r).not.toHaveProperty('thinking');
    const old = anthropicRequest({ model: 'claude-3-5-haiku-latest', effort: 'high' }, [], 'sys', toolDef());
    expect(old).not.toHaveProperty('output_config');
    expect(old).not.toHaveProperty('fallbacks');
    expect(old).not.toHaveProperty('betas');
  });

  it('maps the final message: tool calls, text, stop reason; tool results answer by id', async () => {
    const content = [
      { type: 'thinking', thinking: '', signature: 'sig' },
      { type: 'text', text: 'Adding.' },
      { type: 'tool_use', id: 'toolu_1', name: TOOL_NAME, input: { operations: [addUnit] } },
    ];
    const client = {
      beta: {
        messages: {
          stream: vi.fn(() => ({
            on: () => undefined,
            finalMessage: async () => ({ content, stop_reason: 'tool_use' }),
          })),
        },
      },
    };
    const a = anthropicAdapter({
      apiKey: 'k',
      baseURL: 'https://api.anthropic.com',
      model: 'claude-opus-5-5',
      effort: 'medium',
      client: client as never,
    });
    const t = await a.call([], 'sys', toolDef(), new AbortController().signal, () => undefined);
    expect(t).toMatchObject({ text: 'Adding.', stop: 'tool_use', toolCalls: [{ id: 'toolu_1', name: TOOL_NAME }] });
    expect(t.assistant).toEqual({ role: 'assistant', content }); // echoed unchanged (thinking included)
    expect(a.toolResults([{ id: 'toolu_1', content: 'done', isError: false }])).toEqual([
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'done' }] },
    ]);
  });

  it('never sends environment credentials: only the key it was given, to the URL it was given', async () => {
    const seen: { url: string; headers: Headers }[] = [];
    const prev = {
      auth: process.env.ANTHROPIC_AUTH_TOKEN,
      key: process.env.ANTHROPIC_API_KEY,
      base: process.env.ANTHROPIC_BASE_URL,
    };
    process.env.ANTHROPIC_AUTH_TOKEN = 'env-bearer-secret';
    process.env.ANTHROPIC_API_KEY = 'env-key-secret';
    process.env.ANTHROPIC_BASE_URL = 'https://env.example';
    try {
      const a = anthropicAdapter({
        apiKey: 'typed-key',
        baseURL: 'https://proxy.example',
        model: 'claude-opus-5-5',
        effort: 'medium',
        fetch: (async (url: string, init: RequestInit) => {
          seen.push({ url: String(url), headers: new Headers(init.headers) });
          return new Response(
            JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'no' } }),
            { status: 401, headers: { 'content-type': 'application/json' } },
          );
        }) as never,
      });
      await expect(
        a.call([{ role: 'user', content: 'hi' }], 'sys', toolDef(), new AbortController().signal, () => undefined),
      ).rejects.toThrow('rejected');
    } finally {
      process.env.ANTHROPIC_AUTH_TOKEN = prev.auth;
      process.env.ANTHROPIC_API_KEY = prev.key;
      process.env.ANTHROPIC_BASE_URL = prev.base;
      for (const [k, v] of Object.entries({
        ANTHROPIC_AUTH_TOKEN: prev.auth,
        ANTHROPIC_API_KEY: prev.key,
        ANTHROPIC_BASE_URL: prev.base,
      }))
        if (v === undefined) delete process.env[k];
    }
    expect(seen.length).toBeGreaterThan(0);
    for (const s of seen) {
      expect(s.url.startsWith('https://proxy.example/')).toBe(true);
      expect(s.headers.get('x-api-key')).toBe('typed-key');
      expect(s.headers.get('authorization')).toBeNull();
    }
  });
});

describe('OpenAI-compatible adapter', () => {
  const sse = (chunks: unknown[]) =>
    new Response(chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n', {
      headers: { 'content-type': 'text/event-stream' },
    });

  it('request: function tool, streaming, no tool_choice', () => {
    const r = openAiRequest('qwen', [], 'sys', toolDef());
    expect(r).toMatchObject({
      model: 'qwen',
      stream: true,
      messages: [{ role: 'system', content: 'sys' }],
      tools: [{ type: 'function', function: { name: TOOL_NAME } }],
    });
    expect(r).not.toHaveProperty('tool_choice');
  });

  it('streams text (hiding <think>), joins split arguments and generates missing tool-call ids', async () => {
    const args = JSON.stringify({ operations: [addUnit] });
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) =>
      sse([
        { choices: [{ delta: { content: '<thi' } }] },
        { choices: [{ delta: { content: 'nk>hmm</think>Sure' } }] },
        {
          choices: [
            { delta: { tool_calls: [{ index: 0, function: { name: TOOL_NAME, arguments: args.slice(0, 10) } }] } },
          ],
        },
        {
          choices: [
            {
              delta: { tool_calls: [{ index: 0, function: { arguments: args.slice(10) } }] },
              finish_reason: 'tool_calls',
            },
          ],
        },
      ]),
    );
    const a = openAiAdapter({ baseUrl: 'http://localhost:11234/v1/', model: 'qwen', fetch: fetch as never });
    let streamed = '';
    const t = await a.call([], 'sys', toolDef(), new AbortController().signal, (d) => (streamed += d));
    expect(streamed).toBe('Sure');
    expect(t.text).toBe('Sure');
    expect(t.stop).toBe('tool_use');
    expect(t.toolCalls[0]).toMatchObject({ id: 'call_1', name: TOOL_NAME, input: { operations: [addUnit] } });
    expect(t.assistant).toMatchObject({
      tool_calls: [{ id: 'call_1', type: 'function', function: { name: TOOL_NAME, arguments: args } }],
    });
    expect(fetch.mock.calls[0]![0]).toBe('http://localhost:11234/v1/chat/completions');
    expect(a.toolResults([{ id: 'call_1', content: 'ok', isError: false }])).toEqual([
      { role: 'tool', tool_call_id: 'call_1', content: 'ok' },
    ]);
  });

  it('accepts arguments as an object, reports invalid JSON, and reads non-streamed answers', async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                { id: 'x', function: { name: TOOL_NAME, arguments: { operations: [addUnit] } } },
                { id: 'y', function: { name: TOOL_NAME, arguments: '{"operations": [' } },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
      }),
    );
    const t = await openAiAdapter({ baseUrl: 'http://m/v1', model: 'm', fetch: fetch as never }).call(
      [],
      's',
      toolDef(),
      new AbortController().signal,
      () => undefined,
    );
    expect(t.toolCalls[0]).toMatchObject({ id: 'x', input: { operations: [addUnit] } });
    expect(t.toolCalls[1]).toMatchObject({ id: 'y', input: null, inputError: expect.any(String) });
  });

  it('think filter works across any split', () => {
    const s = 'a<think>x</think>b<think>yy';
    for (let i = 0; i <= s.length; i++)
      for (let j = i; j <= s.length; j++) {
        let out = '';
        const f = thinkFilter((d) => (out += d));
        f(s.slice(0, i));
        f(s.slice(i, j));
        f(s.slice(j));
        expect(out).toBe('ab');
      }
  });
});

/* ───────────── security and limits (server) ───────────── */

describe('assistant security', () => {
  const env = {
    ANTHROPIC_API_KEY: 'sk-ant-server-secret',
    LLM_API_KEY: 'llm-server-secret',
    LLM_BASE_URL: 'http://models.lan:8080/v1',
    AI_ACCESS_TOKEN: undefined as string | undefined,
  };

  it('a server key only goes to its own endpoint', () => {
    expect(resolveCredentials({ provider: 'openai', baseUrl: 'http://evil.example/v1' }, env)).toEqual({
      ok: true,
      credentials: { provider: 'openai', baseUrl: 'http://evil.example/v1' },
    });
    expect(resolveCredentials({ provider: 'openai' }, env)).toMatchObject({
      credentials: { apiKey: 'llm-server-secret', baseUrl: 'http://models.lan:8080/v1' },
    });
    expect(resolveCredentials({ provider: 'openai', baseUrl: 'http://models.lan:8080/v1/' }, env)).toMatchObject({
      credentials: { apiKey: 'llm-server-secret' },
    });
    expect(resolveCredentials({ provider: 'anthropic', baseUrl: 'https://evil.example' }, env)).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(
      resolveCredentials({ provider: 'anthropic', baseUrl: 'https://evil.example', apiKey: 'typed' }, env),
    ).toMatchObject({ credentials: { apiKey: 'typed', baseURL: 'https://evil.example' } });
    expect(resolveCredentials({ provider: 'anthropic' }, env)).toMatchObject({
      credentials: { apiKey: 'sk-ant-server-secret', baseURL: 'https://api.anthropic.com' },
    });
    expect(resolveCredentials({ provider: 'openai', baseUrl: 'file:///etc/passwd' }, env)).toMatchObject({ ok: false });
  });

  const factory = vi.fn(() => fake(() => ({ text: 'ok' })));
  const app = createApp({ port: 4173, interfaces: {}, ai: { env, adapter: factory } });
  const body = (extra: Record<string, unknown> = {}) =>
    JSON.stringify({ provider: 'openai', message: 'hi', design: design(), history: [], ...extra });
  const post = (headers: Record<string, string>, b = body()) =>
    app.request('http://localhost:4173/api/ai/turn', {
      method: 'POST',
      headers: { host: 'localhost:4173', ...headers },
      body: b,
    });
  const good = { origin: 'http://localhost:4173', 'content-type': 'application/json' };

  it('config says whether keys exist, never what they are', async () => {
    const text = await (await app.request('/api/ai/config')).text();
    expect(text).not.toContain('secret');
    expect(JSON.parse(text)).toMatchObject({
      anthropic: { serverKey: true },
      openai: { serverKey: true, baseUrl: 'http://models.lan:8080/v1' },
    });
  });

  it('rejects cross-site requests and non-JSON bodies before doing anything', async () => {
    factory.mockClear();
    expect((await post({ 'content-type': 'application/json' })).status).toBe(403); // no Origin
    expect((await post({ ...good, origin: 'http://evil.example' })).status).toBe(403);
    expect((await post({ ...good, 'content-type': 'text/plain' })).status).toBe(415);
    expect(factory).not.toHaveBeenCalled();
  });

  it('a custom Anthropic URL without a typed key is refused before any client exists', async () => {
    factory.mockClear();
    const res = await post(good, body({ provider: 'anthropic', baseUrl: 'https://evil.example' }));
    expect(res.status).toBe(400);
    expect(factory).not.toHaveBeenCalled();
  });

  it('limits: message length, history size (start a new chat), body size', async () => {
    expect((await post(good, body({ message: 'x'.repeat(10_001) }))).status).toBe(400);
    const long = await post(
      good,
      body({ history: Array.from({ length: 401 }, () => ({ role: 'user', content: 'x' })) }),
    );
    expect(long.status).toBe(400);
    expect(await long.json()).toMatchObject({ error: expect.stringContaining('Start a new chat') });
    expect((await post({ ...good, 'content-length': String(5 * 1024 * 1024) })).status).toBe(413);
  });

  it('streams the turn as server-sent events ending with the final result', async () => {
    const res = await post(good);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('event: text');
    expect(text).toMatch(/event: final\ndata: \{"transaction":/);
  });

  it('an access token, when configured, is required', async () => {
    const locked = createApp({
      port: 4173,
      interfaces: {},
      ai: { env: { ...env, AI_ACCESS_TOKEN: 'lan-token' }, adapter: factory },
    });
    const req = (h: Record<string, string>) =>
      locked.request('http://localhost:4173/api/ai/turn', {
        method: 'POST',
        headers: { host: 'localhost:4173', ...good, ...h },
        body: body(),
      });
    expect((await req({})).status).toBe(401);
    expect((await req({ 'x-butor-ai-token': 'wrong-token' })).status).toBe(401);
    expect((await req({ 'x-butor-ai-token': 'lan-token' })).status).toBe(200);
  });
});
