import type { ToolDef } from '../prompt';

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
  inputError?: string; // the arguments were not valid JSON
}

export type StopReason = 'end' | 'tool_use' | 'max_tokens' | 'refusal' | 'other';

/** One model call, finished. `assistant` is the provider-native message, echoed into history unchanged. */
export interface ModelTurn {
  assistant: unknown;
  text: string;
  toolCalls: ToolCall[];
  stop: StopReason;
}

export interface ToolResult {
  id: string;
  content: string;
  isError: boolean;
}

/** A model provider (docs/v2/08-ai.md#providers). History entries are provider-native messages. */
export interface ProviderAdapter {
  readonly id: 'anthropic' | 'openai';
  call(
    history: unknown[],
    system: string,
    tool: ToolDef,
    signal: AbortSignal,
    onText: (delta: string) => void,
  ): Promise<ModelTurn>;
  userMessage(text: string): unknown[];
  toolResults(results: ToolResult[]): unknown[];
}

/** A provider failure with a message fit for the user (≤ 300 chars of provider detail). */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

export const truncate = (s: string, n = 300) => (s.length > n ? `${s.slice(0, n)}…` : s);
