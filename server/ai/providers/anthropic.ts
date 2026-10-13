import Anthropic from '@anthropic-ai/sdk';
import type { ToolDef } from '../prompt';
import {
  ProviderError,
  truncate,
  type ModelTurn,
  type ProviderAdapter,
  type StopReason,
  type ToolResult,
} from './types';

export const ANTHROPIC_DEFAULT_URL = 'https://api.anthropic.com';
export const ANTHROPIC_DEFAULT_MODEL = 'claude-opus-5-5';
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/** Models that accept `output_config.effort`. */
export const supportsEffort = (model: string) =>
  /^claude-(opus-(4-[5-9]|5)|sonnet-(4-6|5)|fable-5|mythos-5|haiku-5)/.test(model);
/** Models with server-side refusal fallback (`fallbacks: "default"`). */
export const supportsFallback = (model: string) => /^claude-(opus-5|fable-5|mythos-5)/.test(model);
export const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

const STOP: Record<string, StopReason> = {
  end_turn: 'end',
  tool_use: 'tool_use',
  max_tokens: 'max_tokens',
  refusal: 'refusal',
};

/** Readable messages for the SDK's typed errors (docs/v2/08-ai.md#anthropic-default). */
export function mapAnthropicError(e: unknown): ProviderError {
  if (e instanceof Anthropic.AuthenticationError) return new ProviderError('The Anthropic API key was rejected.', 401);
  if (e instanceof Anthropic.PermissionDeniedError)
    return new ProviderError('This key is not allowed to use that model.', 403);
  if (e instanceof Anthropic.NotFoundError) return new ProviderError('Unknown model or URL.', 404);
  if (e instanceof Anthropic.RateLimitError)
    return new ProviderError('Rate limited by Anthropic — try again in a moment.', 429);
  if (e instanceof Anthropic.BadRequestError)
    return new ProviderError(`The request was rejected: ${truncate(e.message)}`, 400);
  if (e instanceof Anthropic.APIConnectionError) return new ProviderError('Could not reach the Anthropic API.', 502);
  if (e instanceof Anthropic.APIError) return new ProviderError(`Anthropic error: ${truncate(e.message)}`, 502);
  return new ProviderError(`Anthropic error: ${truncate(e instanceof Error ? e.message : String(e))}`, 502);
}

export interface AnthropicOptions {
  apiKey: string;
  baseURL: string;
  model: string;
  effort: Effort;
  client?: Anthropic; // injectable for tests
  fetch?: typeof fetch; // injectable for tests (to see exactly what would be sent)
}

/** Builds the request; exported for the adapter tests. */
export function anthropicRequest(
  o: Pick<AnthropicOptions, 'model' | 'effort'>,
  history: unknown[],
  system: string,
  tool: ToolDef,
) {
  return {
    model: o.model,
    max_tokens: 64_000,
    system,
    messages: history as Anthropic.Beta.BetaMessageParam[],
    // Thinking stays adaptive (omitted). No tool_choice: steering is in the prompt.
    tools: [
      {
        name: tool.name,
        description: tool.description,
        input_schema: tool.schema as Anthropic.Beta.BetaTool.InputSchema,
        eager_input_streaming: true,
      },
    ],
    ...(supportsEffort(o.model) ? { output_config: { effort: o.effort } } : {}),
    ...(supportsFallback(o.model)
      ? { betas: [FALLBACK_BETA] as Anthropic.Beta.AnthropicBeta[], fallbacks: 'default' as const }
      : {}),
  };
}

export function anthropicAdapter(o: AnthropicOptions): ProviderAdapter {
  // Every credential is explicit, so the SDK never falls back to environment variables or config files.
  const client =
    o.client ??
    new Anthropic({
      apiKey: o.apiKey,
      authToken: null,
      credentials: null,
      baseURL: o.baseURL,
      maxRetries: 2,
      ...(o.fetch ? { fetch: o.fetch } : {}),
    });
  return {
    id: 'anthropic',
    async call(history, system, tool, signal, onText): Promise<ModelTurn> {
      const body = anthropicRequest(o, history, system, tool);
      let message: Anthropic.Beta.BetaMessage | undefined;
      // With eager input streaming, unparseable tool JSON rejects finalMessage(); re-issue that turn (twice at most).
      for (let attempt = 0; !message; attempt++) {
        const stream = client.beta.messages.stream(body, { signal });
        stream.on('text', onText);
        try {
          message = await stream.finalMessage();
        } catch (e) {
          if (e instanceof Anthropic.APIError || signal.aborted || attempt >= 2)
            throw e instanceof ProviderError ? e : mapAnthropicError(e);
        }
      }
      const toolCalls = message.content
        .filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use')
        .map((b) => ({ id: b.id, name: b.name, input: b.input }));
      const text = message.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');
      return {
        assistant: { role: 'assistant', content: message.content },
        text,
        toolCalls,
        stop: STOP[message.stop_reason ?? ''] ?? 'other',
      };
    },
    userMessage: (text) => [{ role: 'user', content: text }],
    toolResults: (results: ToolResult[]) => [
      {
        role: 'user',
        content: results.map((r) => ({
          type: 'tool_result',
          tool_use_id: r.id,
          content: r.content,
          ...(r.isError ? { is_error: true } : {}),
        })),
      },
    ],
  };
}
