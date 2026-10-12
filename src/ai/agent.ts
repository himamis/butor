import type { Design } from '../types';
import { applyOperations } from './operations';
import { designMessage } from './prompt';

export const TOOL_NAME = 'apply_operations';
export const TOOL_DESCRIPTION =
  'Edit the wardrobe design. Applies the operations in order and returns what was applied, ids of added objects, clamped values and errors.';

export interface ToolCall {
  id: string;
  input: unknown;
}

export interface StepResult {
  assistant: unknown; // provider-native assistant message, appended to history unchanged
  text: string;
  toolCalls: ToolCall[];
  stop: 'tool_use' | 'end' | 'refusal' | 'max_tokens';
}

/** One model provider. History entries are provider-native and opaque to the loop. */
export interface ChatProvider {
  step(history: unknown[], system: string): Promise<StepResult>;
  userMessage(text: string): unknown[];
  toolResults(results: { id: string; content: string; isError: boolean }[]): unknown[];
}

export interface AgentResult {
  design: Design;
  history: unknown[];
  reply: string;
  changes: string[];
}

/**
 * Runs one user request: model ↔ apply_operations until the model stops (or maxSteps).
 * History is append-only — earlier entries are never modified.
 */
export async function runAgent(o: {
  provider: ChatProvider;
  system: string;
  history: unknown[];
  message: string;
  design: Design;
  maxSteps?: number;
}): Promise<AgentResult> {
  const maxSteps = o.maxSteps ?? 6;
  const history = [...o.history, ...o.provider.userMessage(`${o.message}\n\n${designMessage(o.design)}`)];
  let design = o.design;
  const changes: string[] = [];
  const texts: string[] = [];

  for (let step = 0; step < maxSteps; step++) {
    const res = await o.provider.step(history, o.system);
    history.push(res.assistant);
    if (res.text.trim()) texts.push(res.text.trim());

    if (res.stop === 'refusal') {
      texts.push('The model declined this request.');
      break;
    }
    if (!res.toolCalls.length) {
      if (res.stop === 'max_tokens') texts.push('(The reply was cut off.)');
      break;
    }

    const results = res.toolCalls.map((call) => {
      const ops = typeof call.input === 'object' && call.input !== null ? (call.input as { operations?: unknown }).operations : undefined;
      const r = applyOperations(design, ops);
      design = r.design;
      for (const x of r.results) if (x.ok) changes.push(x.message);
      const failed = r.results.some((x) => !x.ok);
      return { id: call.id, content: r.results.map((x) => `${x.ok ? 'OK' : 'ERROR'}: ${x.message}`).join('\n'), isError: failed };
    });
    history.push(...o.provider.toolResults(results));

    if (step === maxSteps - 1) texts.push(`(stopped after ${maxSteps} steps — some changes may be incomplete)`);
  }

  return { design, history, reply: texts.join('\n\n') || 'Done.', changes };
}
