import Anthropic from '@anthropic-ai/sdk';
import type { ChatProvider, StepResult } from '../../src/ai/agent';
import { TOOL_DESCRIPTION, TOOL_NAME } from '../../src/ai/agent';
import { OPERATIONS_SCHEMA } from '../../src/ai/operations';

export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5-5';

/** Models that accept the server-side `fallbacks: "default"` form on the Claude API. */
const DEFAULT_FALLBACK_MODELS = ['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5'];
export const supportsDefaultFallback = (model: string) => DEFAULT_FALLBACK_MODELS.includes(model);

type CreateParams = Anthropic.Beta.MessageCreateParamsNonStreaming & { fallbacks?: 'default' };
/** The slice of the SDK client this adapter uses (injectable for tests). */
export interface AnthropicLike {
  beta: { messages: { create(params: CreateParams): Promise<Pick<Anthropic.Beta.BetaMessage, 'content' | 'stop_reason'>> } };
}

const tool: Anthropic.Beta.BetaTool = {
  name: TOOL_NAME,
  description: TOOL_DESCRIPTION,
  input_schema: OPERATIONS_SCHEMA as unknown as Anthropic.Beta.BetaTool.InputSchema,
};

export function anthropicProvider(o: {
  client?: AnthropicLike;
  apiKey?: string;
  baseURL?: string;
  model?: string;
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
}): ChatProvider {
  // With no apiKey the SDK resolves ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN / an `ant auth login` profile.
  const client: AnthropicLike = o.client ?? (new Anthropic({ apiKey: o.apiKey || undefined, baseURL: o.baseURL || undefined }) as unknown as AnthropicLike);
  const model = o.model || DEFAULT_ANTHROPIC_MODEL;
  const fallback = supportsDefaultFallback(model);

  return {
    userMessage: (text) => [{ role: 'user', content: text } satisfies Anthropic.Beta.BetaMessageParam],

    toolResults: (results) => [
      {
        role: 'user',
        content: results.map((r) => ({ type: 'tool_result', tool_use_id: r.id, content: r.content, is_error: r.isError })),
      } satisfies Anthropic.Beta.BetaMessageParam,
    ],

    async step(history, system): Promise<StepResult> {
      const params: CreateParams = {
        model,
        max_tokens: 16000,
        system,
        tools: [tool],
        messages: history as Anthropic.Beta.BetaMessageParam[],
        ...(o.effort ? { output_config: { effort: o.effort } } : {}),
        // On a safety decline the API re-runs the request on Anthropic's recommended fallback model.
        ...(fallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      };
      const res = await client.beta.messages.create(params);
      const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n');
      const toolCalls = res.content.flatMap((b) => (b.type === 'tool_use' && b.name === TOOL_NAME ? [{ id: b.id, input: b.input }] : []));
      const stop = res.stop_reason === 'refusal' ? 'refusal' : res.stop_reason === 'max_tokens' ? 'max_tokens' : toolCalls.length ? 'tool_use' : 'end';
      // Echo the content unchanged on the next request (thinking blocks must not be edited).
      return { assistant: { role: 'assistant', content: res.content }, text, toolCalls, stop };
    },
  };
}

/** Readable message for SDK errors, most specific first. */
export function describeAnthropicError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return 'Anthropic rejected the API key. Set ANTHROPIC_API_KEY for the dev server or enter a key in AI settings.';
  if (e instanceof Anthropic.PermissionDeniedError) return 'This API key is not allowed to use that model.';
  if (e instanceof Anthropic.NotFoundError) return 'Model not found — check the model name in AI settings.';
  if (e instanceof Anthropic.RateLimitError) return 'Rate limited by Anthropic — wait a moment and try again.';
  if (e instanceof Anthropic.BadRequestError) return `Anthropic rejected the request: ${e.message}`;
  if (e instanceof Anthropic.APIConnectionError) return 'Could not reach the Anthropic API — check the network connection.';
  if (e instanceof Anthropic.APIError) return `Anthropic API error ${e.status ?? ''}: ${e.message}`;
  if (e instanceof Anthropic.AnthropicError) return e.message; // e.g. no credentials found
  return e instanceof Error ? e.message : String(e);
}
