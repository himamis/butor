import type { ApplyResult, OpContext } from './ops/transaction';
import { applyTransaction } from './ops/transaction';
import type { Op } from './ops/schema';
import type { Design } from './schema/design';

export const HISTORY_LIMIT = 200;

/**
 * One undo step. `undo` and `redo` are exact restore ops (snapshots), so redo reproduces the same ids
 * instead of re-running an add that would generate new ones.
 */
export interface HistoryEntry {
  label: string;
  undo: Op[];
  redo: Op[];
}

export interface History {
  past: HistoryEntry[];
  future: HistoryEntry[];
}

export const emptyHistory = (): History => ({ past: [], future: [] });

/** Records a committed transaction. Failed or no-op transactions are ignored. A new change clears redo. */
export function record(h: History, label: string, result: ApplyResult): History {
  if (!result.inverse.length) return h;
  // Redo ops are computed lazily on undo (the inverse of the inverse); until then keep an empty list.
  return { past: [...h.past, { label, undo: result.inverse, redo: [] }].slice(-HISTORY_LIMIT), future: [] };
}

export function undo(h: History, doc: Design, ctx: OpContext): { history: History; doc: Design } | null {
  const entry = h.past[h.past.length - 1];
  if (!entry) return null;
  const r = applyTransaction(doc, { label: `undo ${entry.label}`, ops: entry.undo }, { ...ctx, mode: 'strict' });
  if (!r.ok) return null;
  return { doc: r.doc, history: { past: h.past.slice(0, -1), future: [{ ...entry, redo: r.inverse }, ...h.future] } };
}

export function redo(h: History, doc: Design, ctx: OpContext): { history: History; doc: Design } | null {
  const entry = h.future[0];
  if (!entry) return null;
  const r = applyTransaction(doc, { label: `redo ${entry.label}`, ops: entry.redo }, { ...ctx, mode: 'strict' });
  if (!r.ok) return null;
  return {
    doc: r.doc,
    history: { past: [...h.past, { ...entry, undo: r.inverse }].slice(-HISTORY_LIMIT), future: h.future.slice(1) },
  };
}
