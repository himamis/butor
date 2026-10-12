import { describe, expect, it } from 'vitest';
import { emptyHistory, record, redo, undo, HISTORY_LIMIT } from './history';
import { applyTransaction, rebase, type OpContext } from './ops';
import { testCatalog } from './test/catalog';
import { emptyDesign } from './test/designs';
import { createIdGenerator, newId } from './ids';

const ctx: OpContext = { newId, now: () => 't', catalog: testCatalog, mode: 'strict' };
const addUnit = (x: number) => ({
  type: 'entity.add' as const,
  entity: { kind: 'unit' as const, template: { id: 'test.unit' }, position: { x, z: 300 } },
});

describe('history', () => {
  it('undo and redo restore exact documents, including generated ids', () => {
    let d = emptyDesign();
    let h = emptyHistory();
    const r1 = applyTransaction(d, { label: 'add', ops: [addUnit(500)] }, ctx);
    h = record(h, 'add', r1);
    d = r1.doc;
    const id = d.order[0]!;
    const r2 = applyTransaction(
      d,
      { label: 'move', ops: [{ type: 'entity.move', ids: [id], delta: { x: 100, y: 0, z: 0 } }] },
      ctx,
    );
    h = record(h, 'move', r2);
    d = r2.doc;

    const u1 = undo(h, d, ctx)!;
    const u2 = undo(u1.history, u1.doc, ctx)!;
    expect(u2.doc.order).toEqual([]);
    const f1 = redo(u2.history, u2.doc, ctx)!;
    expect(f1.doc.order).toEqual([id]); // same id as before, not a new one
    const f2 = redo(f1.history, f1.doc, ctx)!;
    expect(f2.doc.entities[id]!.position.x).toBe(600);
    expect(redo(f2.history, f2.doc, ctx)).toBeNull();
  });

  it('a new change clears redo; history is capped', () => {
    let d = emptyDesign();
    let h = emptyHistory();
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) {
      const r = applyTransaction(d, { label: 'add', ops: [addUnit(i)] }, ctx);
      h = record(h, 'add', r);
      d = r.doc;
    }
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    const u = undo(h, d, ctx)!;
    expect(u.history.future).toHaveLength(1);
    const r = applyTransaction(u.doc, { label: 'rename', ops: [{ type: 'design.rename', name: 'x' }] }, ctx);
    expect(record(u.history, 'rename', r).future).toEqual([]);
  });

  it('failed or empty transactions are not recorded', () => {
    const d = emptyDesign();
    const r = applyTransaction(d, { label: 'bad', ops: [{ type: 'entity.remove', ids: ['ghost'] }] }, ctx);
    expect(record(emptyHistory(), 'bad', r).past).toEqual([]);
  });
});

describe('rebase', () => {
  const det: OpContext = { ...ctx, newId: createIdGenerator('b') };
  it('ops prepared on an older revision apply after unrelated edits', () => {
    const d0 = applyTransaction(emptyDesign(), { label: 'add', ops: [addUnit(500), addUnit(1500)] }, det).doc;
    const [a, b] = d0.order;
    const userEdit = applyTransaction(
      d0,
      { label: 'move', ops: [{ type: 'entity.move', ids: [a!], delta: { x: 10, y: 0, z: 0 } }] },
      det,
    ).doc;
    const r = rebase(
      userEdit,
      { label: 'ai', ops: [{ type: 'entity.update', id: b!, name: 'Right' }] },
      d0.revision,
      det,
    );
    expect(r.ok).toBe(true);
    expect(r.doc.entities[b!]!.name).toBe('Right');
    expect(r.doc.entities[a!]!.position.x).toBe(510);
  });

  it('conflicting ops fail cleanly and change nothing', () => {
    const d0 = applyTransaction(emptyDesign(), { label: 'add', ops: [addUnit(500)] }, det).doc;
    const [a] = d0.order;
    const userEdit = applyTransaction(d0, { label: 'remove', ops: [{ type: 'entity.remove', ids: [a!] }] }, det).doc;
    const r = rebase(userEdit, { label: 'ai', ops: [{ type: 'entity.update', id: a!, name: 'X' }] }, d0.revision, det);
    expect(r.ok).toBe(false);
    expect(r.doc).toBe(userEdit);
    expect(r.conflict).toBe(true);
  });
});
