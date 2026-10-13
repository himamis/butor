import type { CatalogRegistry } from '../catalog/types';
import { checkDesign } from '../invariants';
import type { Design } from '../schema/design';
import { applyOp } from './apply';
import { MissingIdError, withIds } from './ids';
import { OpError } from './normalize';
import { Op as OpSchema, type Op, type OpResult } from './schema';

export interface Transaction {
  label: string;
  ops: Op[];
}

export interface OpContext {
  /** Source of new ids (`withIds`). Replays pass `noNewIds`: their ops already carry every id. */
  newId(): string;
  now(): string;
  catalog: CatalogRegistry;
  /** strict: all-or-nothing (UI, paste, import, undo). partial: apply what is valid (AI). */
  mode: 'strict' | 'partial';
}

export interface ApplyResult {
  doc: Design;
  inverse: Op[]; // applying these (strict) restores the previous document
  results: OpResult[];
  ok: boolean; // every op succeeded
  /** The ops that applied, in order, with every id they created filled in — a complete, replayable record. */
  applied: Op[];
}

/**
 * The only way a design changes (docs/v2/05-operations.md). Pure: never throws for bad input.
 * An op is refused if it introduces invariant problems that were not there before.
 */
export function applyTransaction(doc: Design, tx: Transaction, ctx: OpContext): ApplyResult {
  let current = doc;
  let problemsBefore = new Set(checkDesign(doc, ctx.catalog));
  const inverses: Op[][] = [];
  const results: OpResult[] = [];
  const applied: Op[] = [];

  for (const raw of tx.ops) {
    const parsed = OpSchema.safeParse(raw);
    if (!parsed.success) {
      const type = typeof raw === 'object' && raw && 'type' in raw ? String((raw as { type: unknown }).type) : '?';
      const known =
        parsed.error.issues.some((i) => i.code === 'invalid_union') &&
        !/^(entity|unit|group|groups|room|material|materials|design)\./.test(type);
      results.push({
        ok: false,
        message: known
          ? `unknown operation type "${type}"`
          : `invalid "${type}" operation: ${formatIssues(parsed.error.issues)}`,
      });
      continue;
    }
    try {
      const op = withIds(parsed.data, ctx.newId);
      const out = applyOp(current, op, { catalog: ctx.catalog });
      const after = checkDesign(out.doc, ctx.catalog);
      const introduced = after.filter((p) => !problemsBefore.has(p));
      if (introduced.length) throw new OpError(introduced.slice(0, 3).join('; '));
      current = out.doc;
      problemsBefore = new Set(after);
      inverses.push(out.inverse);
      applied.push(op as Op);
      const message = out.notes.length ? `${out.message} (${out.notes.join('; ')})` : out.message;
      results.push({
        ok: true,
        message,
        ...(out.created ? { created: out.created } : {}),
        ...(out.notes.length ? { notes: out.notes } : {}),
      });
    } catch (e) {
      if (e instanceof MissingIdError) {
        results.push({ ok: false, message: e.message });
        continue;
      }
      if (!(e instanceof OpError)) throw e; // a bug, not bad input
      results.push({ ok: false, message: e.message });
    }
  }

  const ok = results.every((r) => r.ok);
  if ((ctx.mode === 'strict' && !ok) || inverses.length === 0) return { doc, inverse: [], results, ok, applied: [] };
  return {
    doc: { ...current, revision: doc.revision + 1, meta: { ...current.meta, updatedAt: ctx.now() } },
    inverse: inverses.reverse().flat(),
    results,
    ok,
    applied,
  };
}

function formatIssues(issues: { path: PropertyKey[]; message: string }[]): string {
  return issues
    .slice(0, 3)
    .map((i) => `${i.path.map(String).join('.') || 'op'}: ${i.message}`)
    .join('; ');
}

/**
 * Applies a transaction prepared against `baseRevision` to the current document (docs/v2/05#rebase).
 * Ops reference ids, so unrelated edits in between do not matter; if anything no longer applies,
 * nothing is applied and `conflict` is set.
 */
export function rebase(
  current: Design,
  tx: Transaction,
  baseRevision: number,
  ctx: OpContext,
): ApplyResult & { conflict: boolean } {
  const r = applyTransaction(current, tx, { ...ctx, mode: 'strict' });
  return { ...r, conflict: !r.ok && current.revision !== baseRevision };
}
