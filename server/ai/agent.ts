import { applyTransaction, buildScene, newId, PublicOp, type Design, type Op } from '../../src/core';
import { catalog } from '../../src/catalog';
import { systemPrompt, TOOL_NAME, ToolInput, toolDef } from './prompt';
import type { ModelTurn, ProviderAdapter, ToolCall, ToolResult } from './providers/types';
import { designSummary } from './summary';

export const MAX_MODEL_CALLS = 8;

export interface TurnInput {
  message: string;
  design: Design;
  history: unknown[];
}

/** What the browser commits: the applied ops in order, each carrying every id it created (core `withIds`). */
export interface AiTransaction {
  label: string;
  ops: Op[];
}

export interface TurnOutput {
  transaction: AiTransaction;
  changes: string[]; // one line per applied operation
  reply: string;
  history: unknown[];
  baseRevision: number;
  stopped?: 'refusal' | 'limit';
}

export type TurnEvent = { type: 'text'; delta: string } | { type: 'progress'; text: string };

const opType = (raw: unknown) =>
  typeof raw === 'object' && raw !== null && 'type' in raw ? String((raw as { type: unknown }).type) : '?';

/**
 * One user request (docs/v2/08-ai.md#flow): up to MAX_MODEL_CALLS model calls; tool calls are applied to a scratch
 * copy so the model gets exact feedback. Every tool call is answered. Nothing here touches the user's document.
 */
export async function runTurn(
  provider: ProviderAdapter,
  input: TurnInput,
  signal: AbortSignal,
  emit: (e: TurnEvent) => void,
): Promise<TurnOutput> {
  const system = systemPrompt();
  const tool = toolDef();
  let scratch = input.design;
  const applied: Op[] = [];
  const changes: string[] = [];
  const replies: string[] = [];

  const userText = `${input.message}\n\n<design>\n${designSummary(scratch, buildScene(scratch, catalog))}\n</design>`;
  const history = [...input.history, ...provider.userMessage(userText)];
  const done = (extra: Partial<TurnOutput> = {}): TurnOutput => ({
    transaction: { label: `AI: ${input.message.slice(0, 60)}`, ops: applied },
    changes,
    reply: replies.join('\n\n').trim(),
    history,
    baseRevision: input.design.revision,
    ...extra,
  });

  /** Applies one tool call's operations (partial: the valid ones apply) and records them with their ids. */
  const applyCall = (call: ToolCall): ToolResult => {
    if (call.name !== TOOL_NAME)
      return { id: call.id, isError: true, content: `Unknown tool "${call.name}". The only tool is ${TOOL_NAME}.` };
    if (call.inputError)
      return {
        id: call.id,
        isError: true,
        content: `Not applied: the arguments are not valid JSON (${call.inputError}).`,
      };
    const parsed = ToolInput.safeParse(call.input);
    if (!parsed.success)
      return {
        id: call.id,
        isError: true,
        content: `Not applied: ${parsed.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ')}. Send {"operations": [...]}.`,
      };
    // Malformed operations change nothing: report them all and apply none of this call.
    const invalid = parsed.data.operations
      .map((raw, i) => ({ i, type: opType(raw), r: PublicOp.safeParse(raw) }))
      .filter((x) => !x.r.success);
    if (invalid.length)
      return {
        id: call.id,
        isError: true,
        content: JSON.stringify({
          applied: 0,
          error: 'No operations were applied because some are malformed. Fix them and send the whole list again.',
          invalid: invalid.slice(0, 10).map((x) => ({
            index: x.i,
            type: x.type,
            problems: x.r.error!.issues.slice(0, 4).map((q) => `${q.path.join('.') || 'op'}: ${q.message}`),
          })),
        }),
      };
    const r = applyTransaction(
      scratch,
      { label: 'ai', ops: parsed.data.operations as Op[] },
      { newId, now: () => new Date().toISOString(), catalog, mode: 'partial' },
    );
    scratch = r.doc;
    applied.push(...r.applied);
    const results = r.results.map((res, index) => {
      if (res.ok) changes.push(res.message);
      return {
        index,
        type: opType(parsed.data.operations[index]),
        ok: res.ok,
        message: res.message,
        ...(res.created ? { created: res.created } : {}),
      };
    });
    const ok = results.filter((x) => x.ok).length;
    emit({ type: 'progress', text: `${ok} of ${results.length} operations applied` });
    return { id: call.id, isError: ok === 0, content: JSON.stringify({ applied: ok, results }) };
  };

  for (let step = 0; step < MAX_MODEL_CALLS; step++) {
    const turn: ModelTurn = await provider.call(history, system, tool, signal, (d) => emit({ type: 'text', delta: d }));
    if (turn.stop === 'refusal') {
      // The refused reply is discarded, and so is this request: history stays exactly as it was (append-only).
      return {
        ...done({ stopped: 'refusal', reply: 'The model declined this request.' }),
        history: input.history,
        transaction: { label: '', ops: [] },
        changes: [],
      };
    }
    history.push(turn.assistant);
    if (turn.text.trim()) replies.push(turn.text.trim());
    if (!turn.toolCalls.length) return done();
    const results =
      turn.stop === 'max_tokens'
        ? turn.toolCalls.map((c) => ({
            id: c.id,
            isError: true,
            content: 'Not applied: the reply was cut off. Send fewer operations per call.',
          }))
        : turn.toolCalls.map(applyCall);
    history.push(...provider.toolResults(results));
  }
  return done({ stopped: 'limit', reply: [...replies, '(Stopped after the step limit.)'].join('\n\n') });
}
