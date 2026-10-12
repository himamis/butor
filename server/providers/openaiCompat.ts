import { randomUUID } from 'node:crypto';
import type { ChatProvider, StepResult, ToolCall } from '../../src/ai/agent';
import { TOOL_DESCRIPTION, TOOL_NAME } from '../../src/ai/agent';
import { OPERATIONS_SCHEMA } from '../../src/ai/operations';

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

interface OAIToolCall {
  id?: string;
  type?: string;
  function: { name: string; arguments: unknown };
}
interface OAIMessage {
  role: string;
  content: string | null;
  tool_calls?: OAIToolCall[];
}

const tools = [{ type: 'function', function: { name: TOOL_NAME, description: TOOL_DESCRIPTION, parameters: OPERATIONS_SCHEMA } }];

function parseArgs(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw ?? null; // some servers (e.g. Ollama) send an object
  try {
    return JSON.parse(raw);
  } catch {
    return null; // reported to the model as an error by the loop
  }
}

/** Any OpenAI-compatible /chat/completions endpoint with tool calling (OpenAI, Ollama, LM Studio, …). */
export function openAICompatProvider(o: { baseUrl: string; model: string; apiKey?: string; fetch?: FetchLike }): ChatProvider {
  const doFetch: FetchLike = o.fetch ?? (globalThis.fetch as unknown as FetchLike);
  const url = `${o.baseUrl.replace(/\/+$/, '')}/chat/completions`;

  return {
    userMessage: (text) => [{ role: 'user', content: text }],
    toolResults: (results) => results.map((r) => ({ role: 'tool', tool_call_id: r.id, content: r.content })),

    async step(history, system): Promise<StepResult> {
      const res = await doFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(o.apiKey ? { Authorization: `Bearer ${o.apiKey}` } : {}) },
        body: JSON.stringify({ model: o.model, messages: [{ role: 'system', content: system }, ...history], tools }),
      });
      if (!res.ok) throw new Error(`${url} returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = (await res.json()) as { choices?: { message?: OAIMessage; finish_reason?: string }[] };
      const choice = data.choices?.[0];
      if (!choice?.message) throw new Error(`${url} returned no message`);

      // Give every call an id (some servers omit it) and echo the same ids in the stored assistant message.
      const calls = (choice.message.tool_calls ?? []).map((c) => ({ ...c, id: c.id || `call_${randomUUID()}` }));
      const toolCalls: ToolCall[] = calls.filter((c) => c.function?.name === TOOL_NAME).map((c) => ({ id: c.id, input: parseArgs(c.function.arguments) }));
      const assistant: OAIMessage = {
        role: 'assistant',
        content: choice.message.content ?? '',
        ...(calls.length ? { tool_calls: calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.function.name, arguments: typeof c.function.arguments === 'string' ? c.function.arguments : JSON.stringify(c.function.arguments ?? {}) } })) } : {}),
      };
      const stop = toolCalls.length ? 'tool_use' : choice.finish_reason === 'length' ? 'max_tokens' : 'end';
      return { assistant, text: choice.message.content ?? '', toolCalls, stop };
    },
  };
}
