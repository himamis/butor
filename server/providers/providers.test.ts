import { describe, expect, it, vi } from 'vitest';
import { anthropicProvider, supportsDefaultFallback } from './anthropic';
import { openAICompatProvider } from './openaiCompat';

describe('anthropic provider', () => {
  const response = {
    content: [
      { type: 'thinking', thinking: '', signature: 'sig' },
      { type: 'text', text: 'Adding it.' },
      { type: 'tool_use', id: 'tu1', name: 'apply_operations', input: { operations: [] } },
    ],
    stop_reason: 'tool_use',
  };

  it('sends the documented request and maps the response', async () => {
    const create = vi.fn().mockResolvedValue(response);
    const p = anthropicProvider({ client: { beta: { messages: { create } } }, model: 'claude-opus-5-5', effort: 'medium' });
    const history = p.userMessage('hi');
    const r = await p.step(history, 'SYS');

    const req = create.mock.calls[0][0];
    expect(req).toMatchObject({
      model: 'claude-opus-5-5',
      system: 'SYS',
      max_tokens: 16000,
      output_config: { effort: 'medium' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(req.tools[0]).toMatchObject({ name: 'apply_operations', input_schema: { type: 'object' } });
    expect(req.tool_choice).toBeUndefined(); // forced tool choice is rejected on current models

    expect(r.stop).toBe('tool_use');
    expect(r.text).toBe('Adding it.');
    expect(r.toolCalls).toEqual([{ id: 'tu1', name: 'apply_operations', input: { operations: [] } }]);
    // assistant content is echoed back unchanged (thinking blocks included)
    expect(r.assistant).toEqual({ role: 'assistant', content: response.content });
  });

  it('omits fallbacks for models that do not support the default form', async () => {
    const create = vi.fn().mockResolvedValue({ content: [], stop_reason: 'end_turn' });
    const p = anthropicProvider({ client: { beta: { messages: { create } } }, model: 'claude-haiku-5-5' });
    await p.step(p.userMessage('x'), 's');
    expect(create.mock.calls[0][0].fallbacks).toBeUndefined();
    expect(create.mock.calls[0][0].betas).toBeUndefined();
    expect(supportsDefaultFallback('claude-sonnet-5-5')).toBe(true);
  });

  it('maps refusal and tool results', async () => {
    const create = vi.fn().mockResolvedValue({ content: [], stop_reason: 'refusal' });
    const p = anthropicProvider({ client: { beta: { messages: { create } } }, model: 'claude-opus-5-5' });
    expect((await p.step([], 's')).stop).toBe('refusal');
    expect(p.toolResults([{ id: 'a', content: 'OK', isError: false }, { id: 'b', content: 'ERR', isError: true }])).toEqual([
      { role: 'user', content: [
        { type: 'tool_result', tool_use_id: 'a', content: 'OK', is_error: false },
        { type: 'tool_result', tool_use_id: 'b', content: 'ERR', is_error: true },
      ] },
    ]);
  });
});

describe('openai-compatible provider', () => {
  const ok = (message: unknown, finish_reason = 'stop') =>
    vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ choices: [{ message, finish_reason }] }) });

  it('posts chat/completions with tools and a bearer key', async () => {
    const fetch = ok({ role: 'assistant', content: 'hello' });
    const p = openAICompatProvider({ baseUrl: 'http://localhost:11434/v1/', model: 'qwen3', apiKey: 'k', fetch });
    const r = await p.step(p.userMessage('hi'), 'SYS');
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('http://localhost:11434/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer k');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('qwen3');
    expect(body.messages).toEqual([{ role: 'system', content: 'SYS' }, { role: 'user', content: 'hi' }]);
    expect(body.tools[0]).toMatchObject({ type: 'function', function: { name: 'apply_operations' } });
    expect(r).toMatchObject({ text: 'hello', toolCalls: [], stop: 'end' });
  });

  it('parses tool calls with string or object arguments, and survives bad JSON', async () => {
    const fetch = ok({
      role: 'assistant',
      content: null,
      tool_calls: [
        { id: 'c1', type: 'function', function: { name: 'apply_operations', arguments: '{"operations":[]}' } },
        { type: 'function', function: { name: 'apply_operations', arguments: { operations: [1] } } },
        { id: 'c3', type: 'function', function: { name: 'apply_operations', arguments: '{oops' } },
      ],
    }, 'tool_calls');
    const p = openAICompatProvider({ baseUrl: 'http://x/v1', model: 'm', fetch });
    const r = await p.step([], 's');
    expect(r.stop).toBe('tool_use');
    expect(r.toolCalls[0]).toEqual({ id: 'c1', name: 'apply_operations', input: { operations: [] } });
    expect(r.toolCalls[1].input).toEqual({ operations: [1] });
    expect(r.toolCalls[1].id).toBeTruthy();
    expect(r.toolCalls[2].input).toBeNull();
    // the assistant message echoes ids so tool results can reference them
    const assistant = r.assistant as { tool_calls: { id: string }[] };
    expect(assistant.tool_calls.map((t) => t.id)).toEqual(r.toolCalls.map((t) => t.id));
  });

  it('formats tool results as tool messages', () => {
    const p = openAICompatProvider({ baseUrl: 'http://x/v1', model: 'm', fetch: vi.fn() });
    expect(p.toolResults([{ id: 'c1', content: 'OK', isError: false }])).toEqual([{ role: 'tool', tool_call_id: 'c1', content: 'OK' }]);
  });

  it('turns HTTP errors into readable messages', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => 'model "m" not found' });
    const p = openAICompatProvider({ baseUrl: 'http://x/v1', model: 'm', fetch });
    await expect(p.step([], 's')).rejects.toThrow(/404.*not found/);
  });
});

describe('anthropic effort', () => {
  it('sends effort only to models that accept it', async () => {
    for (const [model, sent] of [['claude-opus-5-5', true], ['claude-sonnet-4-6', true], ['claude-haiku-4-5', false], ['claude-3-7-sonnet', false]] as const) {
      const create = vi.fn().mockResolvedValue({ content: [], stop_reason: 'end_turn' });
      await anthropicProvider({ client: { beta: { messages: { create } } }, model, effort: 'medium' }).step([], 's');
      expect('output_config' in create.mock.calls[0][0]).toBe(sent);
    }
  });

  it('returns every tool call with its name, including unknown tools', async () => {
    const create = vi.fn().mockResolvedValue({ content: [{ type: 'tool_use', id: 'a', name: 'other', input: {} }], stop_reason: 'tool_use' });
    const r = await anthropicProvider({ client: { beta: { messages: { create } } }, model: 'claude-opus-5-5' }).step([], 's');
    expect(r.toolCalls).toEqual([{ id: 'a', name: 'other', input: {} }]);
    expect(r.stop).toBe('tool_use');
  });
});

describe('openai-compatible errors', () => {
  it('passes through every tool call name', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ id: 'z', function: { name: 'other', arguments: '{}' } }] } }] }) });
    const r = await openAICompatProvider({ baseUrl: 'http://x/v1', model: 'm', fetch }).step([], 's');
    expect(r.toolCalls).toEqual([{ id: 'z', name: 'other', input: {} }]);
  });
});

describe('anthropic custom base URL', () => {
  it('refuses to start without an explicit key, so the SDK cannot pick up environment credentials', () => {
    expect(() => anthropicProvider({ baseURL: 'https://evil.example', model: 'claude-opus-5-5' })).toThrow(/needs an API key/);
    expect(() => anthropicProvider({ baseURL: 'https://proxy.example', apiKey: 'k' })).not.toThrow();
  });
});
