import type { ToolDef } from '../prompt';
import {
  ProviderError,
  truncate,
  type ModelTurn,
  type ProviderAdapter,
  type StopReason,
  type ToolCall,
  type ToolResult,
} from './types';

export interface OpenAiOptions {
  baseUrl: string; // e.g. http://localhost:11234/v1
  apiKey?: string;
  model: string;
  fetch?: typeof fetch; // injectable for tests
}

const STOP: Record<string, StopReason> = {
  stop: 'end',
  tool_calls: 'tool_use',
  function_call: 'tool_use',
  length: 'max_tokens',
  content_filter: 'refusal',
};

interface PartialCall {
  id?: string;
  name: string;
  args: string;
  argsObject?: unknown;
}

/** Hides <think>…</think> spans that some local models put in their content (reasoning, not reply), across chunks. */
export function thinkFilter(out: (s: string) => void) {
  let inside = false;
  let pending = '';
  return (chunk: string) => {
    pending += chunk;
    let shown = '';
    for (;;) {
      const tag = inside ? '</think>' : '<think>';
      const i = pending.indexOf(tag);
      if (i >= 0) {
        if (!inside) shown += pending.slice(0, i);
        pending = pending.slice(i + tag.length);
        inside = !inside;
        continue;
      }
      // Keep a tail that could be the start of the tag; pass (or drop) the rest.
      let keep = 0;
      for (let k = Math.min(tag.length - 1, pending.length); k > 0; k--)
        if (tag.startsWith(pending.slice(-k))) {
          keep = k;
          break;
        }
      if (!inside) shown += pending.slice(0, pending.length - keep);
      pending = pending.slice(pending.length - keep);
      break;
    }
    if (shown) out(shown);
  };
}

export const stripThink = (s: string) => s.replace(/<think>[\s\S]*?(<\/think>|$)/g, '');

/** Builds the request; exported for the adapter tests. */
export function openAiRequest(model: string, history: unknown[], system: string, tool: ToolDef) {
  return {
    model,
    stream: true,
    messages: [{ role: 'system', content: system }, ...history],
    tools: [
      { type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.schema } },
    ],
  };
}

/** Any OpenAI-compatible chat completions endpoint (docs/v2/08-ai.md#openai-compatible), robust to local servers. */
export function openAiAdapter(o: OpenAiOptions): ProviderAdapter {
  const doFetch = o.fetch ?? fetch;
  let generated = 0;
  return {
    id: 'openai',
    async call(history, system, tool, signal, onText): Promise<ModelTurn> {
      const url = `${o.baseUrl.replace(/\/+$/, '')}/chat/completions`;
      let res: Response;
      try {
        res = await doFetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(o.apiKey ? { Authorization: `Bearer ${o.apiKey}` } : {}) },
          body: JSON.stringify(openAiRequest(o.model, history, system, tool)),
          signal,
        });
      } catch (e) {
        if (signal.aborted) throw e;
        throw new ProviderError(`Could not reach ${o.baseUrl}.`, 502);
      }
      if (!res.ok)
        throw new ProviderError(
          `The model server answered ${res.status}: ${truncate(await res.text().catch(() => ''))}`,
          res.status === 401 ? 401 : 502,
        );

      let text = '';
      let finish = '';
      const calls: PartialCall[] = [];
      const emit = thinkFilter(onText);
      const absorb = (choice: {
        delta?: Record<string, unknown>;
        message?: Record<string, unknown>;
        finish_reason?: string | null;
      }) => {
        const d = (choice.delta ?? choice.message ?? {}) as {
          content?: string | null;
          tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: unknown } }[];
        };
        if (typeof d.content === 'string' && d.content) {
          text += d.content;
          emit(d.content);
        }
        for (const [n, tc] of (d.tool_calls ?? []).entries()) {
          const i = tc.index ?? n;
          const c = (calls[i] ??= { name: '', args: '' });
          if (tc.id) c.id = tc.id;
          if (tc.function?.name) c.name += tc.function.name;
          const a = tc.function?.arguments;
          if (typeof a === 'string') c.args += a;
          else if (a !== undefined && a !== null) c.argsObject = a; // some servers send an object
        }
        if (choice.finish_reason) finish = choice.finish_reason;
      };

      if ((res.headers.get('content-type') ?? '').includes('text/event-stream') && res.body) {
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += value;
          let nl: number;
          while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line.startsWith('data:')) continue;
            const data = line.slice(5).trim();
            if (data === '[DONE]') continue;
            try {
              const j = JSON.parse(data) as { choices?: Parameters<typeof absorb>[0][] };
              for (const ch of j.choices ?? []) absorb(ch);
            } catch {
              // ignore keep-alives and junk lines
            }
          }
        }
      } else {
        const j = (await res.json().catch(() => null)) as { choices?: Parameters<typeof absorb>[0][] } | null;
        if (!j) throw new ProviderError('The model server sent an unreadable answer.', 502);
        for (const ch of j.choices ?? []) absorb(ch);
      }

      const toolCalls: ToolCall[] = calls.filter(Boolean).map((c) => {
        const id = c.id ?? `call_${++generated}`;
        c.id = id;
        if (c.argsObject !== undefined) return { id, name: c.name, input: c.argsObject };
        try {
          return { id, name: c.name, input: c.args.trim() ? JSON.parse(c.args) : {} };
        } catch (e) {
          return {
            id,
            name: c.name,
            input: null,
            inputError: truncate(e instanceof Error ? e.message : String(e), 120),
          };
        }
      });
      const assistant = {
        role: 'assistant',
        content: text || null,
        ...(toolCalls.length
          ? {
              tool_calls: calls.filter(Boolean).map((c) => ({
                id: c.id!,
                type: 'function',
                function: {
                  name: c.name,
                  arguments: c.argsObject !== undefined ? JSON.stringify(c.argsObject) : c.args,
                },
              })),
            }
          : {}),
      };
      const stop = STOP[finish] ?? (toolCalls.length ? 'tool_use' : 'end');
      return { assistant, text: stripThink(text), toolCalls, stop };
    },
    userMessage: (text) => [{ role: 'user', content: text }],
    toolResults: (results: ToolResult[]) =>
      results.map((r) => ({ role: 'tool', tool_call_id: r.id, content: r.content })),
  };
}
