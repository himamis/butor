import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { applyTransaction, type OpContext } from './transaction';
import { noNewIds } from './ids';
import type { Op } from './schema';
import { testCatalog } from '../test/catalog';
import { emptyDesign } from '../test/designs';
import { createIdGenerator } from '../ids';
import { checkDesign } from '../invariants';
import { Design } from '../schema';
import type { Unit } from '../schema';

/**
 * Property tests (docs/v2/05-operations.md#required-tests). Ops are generated as "recipes" of random
 * numbers and turned into concrete ops against the current document, so they mostly hit real ids.
 */
type Recipe = { kind: number; a: number; b: number; c: number; flag: boolean };
const recipe = fc.record({
  kind: fc.nat(24),
  a: fc.nat(10_000),
  b: fc.nat(10_000),
  c: fc.integer({ min: -3000, max: 3000 }),
  flag: fc.boolean(),
});

function pick<T>(xs: T[], n: number): T | undefined {
  return xs.length ? xs[n % xs.length] : undefined;
}

function toOp(d: Design, r: Recipe): Op {
  const ids = d.order;
  const units = ids.map((id) => d.entities[id]).filter((e): e is Unit => e?.kind === 'unit');
  const u = pick(units, r.a);
  const col = u && pick(u.columns, r.b);
  const items = u ? u.columns.flatMap((c) => c.items) : [];
  const item = pick(items, r.b);
  const front = u && pick(u.fronts, r.b);
  const corner = pick(d.room.corners, r.a);
  const wall = pick(Object.keys(d.room.walls), r.a);
  const id = pick(ids, r.a) ?? 'none';
  switch (r.kind) {
    case 0:
      return {
        type: 'entity.add',
        entity: {
          kind: 'unit',
          template: { id: 'test.unit' },
          position: { x: r.a % 4000, z: r.b % 3500 },
          size: { w: 300 + (r.a % 2000), h: 400 + (r.b % 2400), d: 300 + (r.c % 500) },
          columns: r.flag ? [{ width: 'auto' }, { width: 'auto' }] : undefined,
        },
      };
    case 1:
      return {
        type: 'entity.add',
        entity: { kind: 'part', template: { id: 'test.panel' }, position: { x: r.a, z: r.b }, params: { w: r.c } },
      };
    case 2:
      return { type: 'entity.remove', ids: [id] };
    case 3:
      return { type: 'entity.move', ids: [id], delta: { x: r.c, y: r.flag ? 10 : 0, z: -r.c } };
    case 4:
      return {
        type: 'entity.rotate',
        ids: ids.slice(0, 1 + (r.a % 3)).length ? ids.slice(0, 1 + (r.a % 3)) : ['none'],
        degrees: r.flag ? 90 : r.c % 360,
      };
    case 5:
      return { type: 'entity.update', id, locked: r.flag };
    case 6:
      return { type: 'entity.update', id, params: { thickness: r.c % 40, w: r.a } };
    case 7:
      return {
        type: 'unit.resize',
        id: u?.id ?? 'none',
        size: { w: 100 + (r.a % 3000), h: r.flag ? 100 + (r.b % 3000) : undefined },
        anchor: { x: r.flag ? 'min' : 'max' },
      };
    case 8:
      return {
        type: 'unit.column.add',
        unit: u?.id ?? 'none',
        at: r.b % 4,
        width: r.flag ? 'auto' : 100 + (r.a % 800),
      };
    case 9:
      return { type: 'unit.column.remove', unit: u?.id ?? 'none', column: col?.id ?? 'none' };
    case 10:
      return {
        type: 'unit.column.update',
        unit: u?.id ?? 'none',
        column: col?.id ?? 'none',
        width: r.flag ? 'auto' : 50 + (r.a % 1200),
      };
    case 11:
      return { type: 'unit.column.move', unit: u?.id ?? 'none', column: col?.id ?? 'none', to: r.a % 4 };
    case 12:
      return {
        type: 'unit.item.add',
        unit: u?.id ?? 'none',
        column: col?.id ?? 'none',
        template: { id: r.flag ? 'test.shelf' : 'test.drawer' },
        y: r.a % 2500,
        params: r.flag ? {} : { height: r.b % 700 },
      };
    case 13:
      return {
        type: 'unit.item.move',
        unit: u?.id ?? 'none',
        item: item?.id ?? 'none',
        column: col?.id ?? 'none',
        y: r.a % 400,
      };
    case 14:
      return { type: 'unit.item.remove', unit: u?.id ?? 'none', item: item?.id ?? 'none' };
    case 15: {
      // Plausible fronts: within the unit's columns and height, stacked in bands so some fit.
      const h = u?.size.h ?? 2000;
      const cols = u?.columns.length ?? 1;
      const band = 1 + (r.a % 4);
      const y0 = Math.floor((h / 4) * (band - 1));
      return {
        type: 'unit.front.add',
        unit: u?.id ?? 'none',
        template: { id: 'test.door' },
        columns: [0, r.b % cols],
        y: [y0, Math.min(h, y0 + h / 4)],
      };
    }
    case 16:
      return {
        type: 'unit.front.update',
        unit: u?.id ?? 'none',
        front: front?.id ?? 'none',
        params: { hinge: r.flag ? 'right' : 'left' },
        ...(r.flag ? {} : { y: [front?.y[0] ?? 0, front?.y[1] ?? 100] as [number, number] }),
      };
    case 17:
      return { type: 'unit.front.remove', unit: u?.id ?? 'none', front: front?.id ?? 'none' };
    case 18:
      return { type: 'group.create', members: [pick(ids, r.a) ?? 'a', pick(ids, r.b) ?? 'b'] };
    case 19:
      return { type: 'group.dissolve', id: pick(Object.keys(d.groups), r.a) ?? 'none' };
    case 20:
      return {
        type: 'room.corner.move',
        id: corner?.id ?? 'none',
        to: { x: (corner?.x ?? 0) + r.c, z: (corner?.z ?? 0) - r.c },
      };
    case 21:
      return { type: 'room.corner.insert', after: corner?.id ?? 'none', at: { x: r.a % 4000, z: r.b % 3500 } };
    case 22:
      return { type: 'room.corner.remove', id: corner?.id ?? 'none' };
    case 23:
      return {
        type: 'room.opening.add',
        opening: {
          wall: wall ?? 'none',
          kind: 'window',
          offset: r.a % 3000,
          width: 300 + (r.b % 1500),
          height: 1000,
          sill: 800,
        },
      };
    default:
      return {
        type: 'room.obstacle.add',
        obstacle: {
          kind: 'column',
          min: { x: r.a % 3000, y: 0, z: r.b % 3000 },
          max: { x: (r.a % 3000) + 1 + (r.c & 511), y: 2600, z: (r.b % 3000) + 400 },
        },
      };
  }
}

const strip = (d: Design) => ({ ...d, revision: 0, meta: { ...d.meta, updatedAt: '' } });

describe('operations (properties)', () => {
  it('the generator is not vacuous: most kinds of op succeed regularly', () => {
    const okByKind = new Map<number, number>();
    fc.assert(
      fc.property(fc.array(recipe, { minLength: 10, maxLength: 40 }), (recipes) => {
        const ctx: OpContext = { newId: createIdGenerator('v'), now: () => 't', catalog: testCatalog, mode: 'strict' };
        let d = emptyDesign();
        for (const seed of [0, 0, 1])
          d = applyTransaction(
            d,
            { label: 's', ops: [toOp(d, { kind: seed, a: 900 + seed * 1500, b: 300, c: 50, flag: true })] },
            ctx,
          ).doc;
        for (const y of [0, 900])
          d = applyTransaction(d, { label: 's', ops: [toOp(d, { kind: 12, a: y, b: 0, c: 0, flag: true })] }, ctx).doc;
        for (const x of recipes) {
          const r = applyTransaction(d, { label: 'p', ops: [toOp(d, x)] }, ctx);
          if (r.ok) okByKind.set(x.kind, (okByKind.get(x.kind) ?? 0) + 1);
          d = r.doc;
        }
      }),
      { numRuns: 200 },
    );
    const succeeded = [...okByKind.entries()].filter(([, n]) => n >= 5).map(([k]) => k);
    // every op kind (0–24) succeeds at least a few times across the runs
    expect(succeeded.sort((a, b) => a - b)).toEqual(Array.from({ length: 25 }, (_, i) => i));
  });

  it('random op sequences keep the document schema-valid and free of invariant problems', () => {
    fc.assert(
      fc.property(
        fc.array(fc.array(recipe, { minLength: 1, maxLength: 3 }), { minLength: 1, maxLength: 25 }),
        (txs) => {
          const ctx: OpContext = {
            newId: createIdGenerator('p'),
            now: () => 't',
            catalog: testCatalog,
            mode: 'strict',
          };
          let d = emptyDesign();
          for (const recipes of txs) {
            const r = applyTransaction(d, { label: 'p', ops: recipes.map((x) => toOp(d, x)) }, ctx);
            d = r.doc;
            expect(Design.safeParse(d).success).toBe(true);
            expect(checkDesign(d, testCatalog)).toEqual([]);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('every transaction is undone exactly by its inverse', () => {
    fc.assert(
      fc.property(
        fc.array(fc.array(recipe, { minLength: 1, maxLength: 3 }), { minLength: 1, maxLength: 20 }),
        (txs) => {
          const ctx: OpContext = {
            newId: createIdGenerator('q'),
            now: () => 't',
            catalog: testCatalog,
            mode: 'strict',
          };
          let d = emptyDesign();
          for (const recipes of txs) {
            const r = applyTransaction(d, { label: 'p', ops: recipes.map((x) => toOp(d, x)) }, ctx);
            if (r.ok && r.inverse.length) {
              const back = applyTransaction(r.doc, { label: 'undo', ops: r.inverse }, ctx);
              expect(back.ok).toBe(true);
              expect(strip(back.doc)).toEqual(strip(d));
            }
            d = r.doc;
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('applied ops are complete records: replaying them (partial mode, no id source) gives the same document', () => {
    fc.assert(
      fc.property(
        fc.array(fc.array(recipe, { minLength: 1, maxLength: 4 }), { minLength: 1, maxLength: 15 }),
        (txs) => {
          const ctx: OpContext = {
            newId: createIdGenerator('r'),
            now: () => 't',
            catalog: testCatalog,
            mode: 'partial',
          };
          let d = emptyDesign();
          for (const recipes of txs) {
            const r = applyTransaction(d, { label: 'p', ops: recipes.map((x) => toOp(d, x)) }, ctx);
            const replay = applyTransaction(
              d,
              { label: 'replay', ops: r.applied },
              { ...ctx, newId: noNewIds, mode: 'strict' },
            );
            if (r.applied.length) {
              expect(replay.ok).toBe(true);
              expect(strip(replay.doc)).toEqual(strip(r.doc));
            }
            d = r.doc;
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('strict transactions are atomic: one failing op leaves the document untouched', () => {
    fc.assert(
      fc.property(fc.array(recipe, { minLength: 1, maxLength: 5 }), fc.nat(5), (recipes, at) => {
        const ctx: OpContext = { newId: createIdGenerator('s'), now: () => 't', catalog: testCatalog, mode: 'strict' };
        let d = emptyDesign();
        d = applyTransaction(
          d,
          { label: 'seed', ops: [toOp(d, { kind: 0, a: 1000, b: 300, c: 100, flag: true })] },
          ctx,
        ).doc;
        const ops = recipes.map((x) => toOp(d, x));
        ops.splice(at % (ops.length + 1), 0, { type: 'entity.remove', ids: ['does-not-exist'] });
        const r = applyTransaction(d, { label: 'p', ops }, ctx);
        expect(r.ok).toBe(false);
        expect(r.doc).toBe(d);
      }),
      { numRuns: 200 },
    );
  });

  it('locked entities never change unless unlocked', () => {
    fc.assert(
      fc.property(fc.array(recipe, { minLength: 1, maxLength: 30 }), (recipes) => {
        const ctx: OpContext = { newId: createIdGenerator('l'), now: () => 't', catalog: testCatalog, mode: 'partial' };
        let d = emptyDesign();
        d = applyTransaction(
          d,
          { label: 'seed', ops: [toOp(d, { kind: 0, a: 1000, b: 300, c: 100, flag: true })] },
          ctx,
        ).doc;
        const lockedId = d.order[0]!;
        d = applyTransaction(
          d,
          { label: 'lock', ops: [{ type: 'entity.update', id: lockedId, locked: true }] },
          ctx,
        ).doc;
        const lockedEntity = d.entities[lockedId];
        for (const r of recipes) {
          const op = toOp(d, r);
          if (op.type === 'entity.update' && op.locked === false) continue; // the one allowed change
          d = applyTransaction(d, { label: 'p', ops: [op] }, ctx).doc;
        }
        expect(d.entities[lockedId]).toEqual(lockedEntity);
      }),
      { numRuns: 200 },
    );
  });
});
