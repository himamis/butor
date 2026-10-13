import { describe, expect, it } from 'vitest';
import { applyTransaction, type OpContext } from './transaction';
import type { Op } from './schema';
import { testCatalog } from '../test/catalog';
import { emptyDesign, unit, withEntities } from '../test/designs';
import { createIdGenerator } from '../ids';
import { checkDesign } from '../invariants';
import type { Design, Unit } from '../schema';

// One id generator for the whole file: a fresh one per transaction would hand out duplicate ids.
const ids = createIdGenerator('n');
const ctx = (mode: OpContext['mode'] = 'strict'): OpContext => ({
  newId: ids,
  now: () => '2026-10-13T00:00:00.000Z',
  catalog: testCatalog,
  mode,
});
const run = (d: Design, ops: Op[], mode: OpContext['mode'] = 'strict') =>
  applyTransaction(d, { label: 'test', ops }, ctx(mode));
const u = (d: Design, id: string) => d.entities[id] as Unit;
const base = () => withEntities(emptyDesign(), unit('u1'), unit('u2', { position: { x: 2200, y: 0, z: 300 } }));

describe('entity ops', () => {
  it('entity.add fills ids, defaults and params; result lists the new id', () => {
    const r = run(emptyDesign(), [
      {
        type: 'entity.add',
        entity: {
          kind: 'unit',
          template: { id: 'test.unit' },
          position: { x: 500, z: 300 },
          size: { w: 800, h: 2000, d: 580 },
        },
      },
    ]);
    expect(r.ok).toBe(true);
    const id = r.results[0]!.created![0]!;
    expect(r.doc.entities[id]).toMatchObject({
      kind: 'unit',
      name: 'Test unit',
      rotation: 0,
      locked: false,
      params: { thickness: 18 },
      position: { x: 500, y: 0, z: 300 },
      template: { id: 'test.unit' },
    });
    expect(u(r.doc, id).columns).toHaveLength(1);
    expect(r.doc.order).toEqual([id]);
    expect(r.doc.revision).toBe(1);
  });

  it('entity.add refuses unknown templates and duplicate ids', () => {
    expect(
      run(emptyDesign(), [
        { type: 'entity.add', entity: { kind: 'unit', template: { id: 'nope' }, position: { x: 0, z: 0 } } },
      ]).results[0],
    ).toMatchObject({ ok: false, message: expect.stringMatching(/unknown template "nope"/) });
    expect(
      run(base(), [
        {
          type: 'entity.add',
          entity: { kind: 'unit', id: 'u1', template: { id: 'test.unit' }, position: { x: 0, z: 0 } },
        },
      ]).ok,
    ).toBe(false);
  });

  it('entity.move moves by delta; locked entities refuse', () => {
    const r = run(base(), [{ type: 'entity.move', ids: ['u1'], delta: { x: 100, y: 0, z: -50 } }]);
    expect(u(r.doc, 'u1').position).toEqual({ x: 1100, y: 0, z: 250 });
    const locked = run(base(), [{ type: 'entity.update', id: 'u1', locked: true }]).doc;
    expect(run(locked, [{ type: 'entity.move', ids: ['u1'], delta: { x: 1, y: 0, z: 0 } }]).results[0]).toMatchObject({
      ok: false,
      message: expect.stringMatching(/locked/),
    });
  });

  it('entity.rotate turns the selection about its centre', () => {
    const r = run(base(), [{ type: 'entity.rotate', ids: ['u1', 'u2'], degrees: 90 }]);
    // footprint centre: x (500..2700) → 1600, z (0..600) → 300
    expect(u(r.doc, 'u1').rotation).toBe(90);
    expect(u(r.doc, 'u1').position.x).toBeCloseTo(1600);
    expect(u(r.doc, 'u1').position.z).toBeCloseTo(300 + 600);
  });

  it('entity.update merges params with clamping notes, and validates', () => {
    const r = run(base(), [{ type: 'entity.update', id: 'u1', params: { thickness: 99 } }]);
    expect(u(r.doc, 'u1').params.thickness).toBe(30);
    expect(r.results[0]!.message).toMatch(/clamped to 30/);
    expect(run(base(), [{ type: 'entity.update', id: 'u1', params: { thickness: 'thick' } }]).ok).toBe(false);
  });

  it('a locked entity can only be unlocked', () => {
    const locked = run(base(), [{ type: 'entity.update', id: 'u1', locked: true }]).doc;
    expect(run(locked, [{ type: 'entity.update', id: 'u1', name: 'x' }]).ok).toBe(false);
    expect(run(locked, [{ type: 'entity.remove', ids: ['u1'] }]).ok).toBe(false);
    expect(run(locked, [{ type: 'unit.resize', id: 'u1', size: { w: 1200 } }]).ok).toBe(false);
    expect(run(locked, [{ type: 'entity.update', id: 'u1', locked: false }]).ok).toBe(true);
  });

  it('entity.remove also dissolves groups that drop below two members', () => {
    const grouped = run(base(), [{ type: 'group.create', members: ['u1', 'u2'] }]).doc;
    const r = run(grouped, [{ type: 'entity.remove', ids: ['u1'] }]);
    expect(r.doc.entities.u1).toBeUndefined();
    expect(Object.keys(r.doc.groups)).toEqual([]);
  });
});

describe('unit structure ops', () => {
  it('unit.resize reflows auto columns and keeps the anchored face', () => {
    const r = run(base(), [{ type: 'unit.resize', id: 'u1', size: { w: 1400 }, anchor: { x: 'min' } }]);
    const unit1 = u(r.doc, 'u1');
    expect(unit1.size.w).toBe(1400);
    expect(unit1.position.x).toBe(1200); // left face stays at 500
  });

  it('unit.resize clamps items that no longer fit and stretches full-height fronts', () => {
    let d = base();
    d = run(d, [
      { type: 'unit.item.add', unit: 'u1', column: 'u1-c1', template: { id: 'test.shelf' }, y: 2000 },
      { type: 'unit.front.add', unit: 'u1', template: { id: 'test.door' }, columns: [1, 1], y: [0, 2200] },
    ]).doc;
    const r = run(d, [{ type: 'unit.resize', id: 'u1', size: { h: 1800 } }]);
    expect(r.ok).toBe(true);
    const unit1 = u(r.doc, 'u1');
    expect(unit1.columns[0]!.items[0]!.y).toBe(1800 - 36 - 18); // top of the new inner height
    expect(unit1.fronts[0]!.y).toEqual([0, 1800]);
  });

  it('unit.resize is refused when a column would get too narrow', () => {
    const d = run(base(), [{ type: 'unit.column.update', unit: 'u1', column: 'u1-c1', width: 600 }]).doc;
    expect(run(d, [{ type: 'unit.resize', id: 'u1', size: { w: 700 } }]).results[0]).toMatchObject({
      ok: false,
      message: expect.stringMatching(/narrower/),
    });
  });

  it('columns: add shifts front indices, remove refuses when a front covers only that column', () => {
    let d = run(base(), [
      { type: 'unit.front.add', unit: 'u1', template: { id: 'test.door' }, columns: [1, 1], y: [0, 2200] },
    ]).doc;
    d = run(d, [{ type: 'unit.column.add', unit: 'u1', at: 0, width: 'auto' }]).doc;
    expect(u(d, 'u1').columns).toHaveLength(3);
    expect(u(d, 'u1').fronts[0]!.columns).toEqual([2, 2]);
    expect(run(d, [{ type: 'unit.column.remove', unit: 'u1', column: 'u1-c2' }]).results[0]).toMatchObject({
      ok: false,
      message: expect.stringMatching(/front/),
    });
  });

  it('items: add, move between columns, refuse overlaps', () => {
    let d = run(base(), [
      {
        type: 'unit.item.add',
        unit: 'u1',
        column: 'u1-c1',
        template: { id: 'test.drawer' },
        y: 0,
        params: { height: 300 },
      },
    ]).doc;
    const drawerId = u(d, 'u1').columns[0]!.items[0]!.id;
    expect(
      run(d, [{ type: 'unit.item.add', unit: 'u1', column: 'u1-c1', template: { id: 'test.shelf' }, y: 100 }])
        .results[0],
    ).toMatchObject({ ok: false, message: expect.stringMatching(/overlap/) });
    d = run(d, [{ type: 'unit.item.move', unit: 'u1', item: drawerId, column: 'u1-c2', y: 500 }]).doc;
    expect(u(d, 'u1').columns[0]!.items).toHaveLength(0);
    expect(u(d, 'u1').columns[1]!.items[0]).toMatchObject({ id: drawerId, y: 500 });
  });

  it('removing a drawer also removes the drawer front that moves with it', () => {
    let d = run(base(), [
      {
        type: 'unit.item.add',
        unit: 'u1',
        column: 'u1-c1',
        template: { id: 'test.drawer' },
        y: 0,
        params: { style: 'external' },
      },
    ]).doc;
    const dr = u(d, 'u1').columns[0]!.items[0]!.id;
    d = run(d, [
      {
        type: 'unit.front.add',
        unit: 'u1',
        template: { id: 'test.drawer-front' },
        columns: [0, 0],
        y: [0, 240],
        item: dr,
      },
    ]).doc;
    d = run(d, [{ type: 'unit.item.remove', unit: 'u1', item: dr }]).doc;
    expect(u(d, 'u1').fronts).toEqual([]);
  });

  it('fronts may not overlap', () => {
    const d = run(base(), [
      { type: 'unit.front.add', unit: 'u1', template: { id: 'test.door' }, columns: [0, 1], y: [0, 1200] },
    ]).doc;
    expect(
      run(d, [{ type: 'unit.front.add', unit: 'u1', template: { id: 'test.door' }, columns: [1, 1], y: [1000, 2200] }])
        .results[0],
    ).toMatchObject({ ok: false, message: expect.stringMatching(/overlap/) });
  });
});

describe('groups, room, materials', () => {
  it('group.create needs two distinct, ungrouped members', () => {
    expect(run(base(), [{ type: 'group.create', members: ['u1', 'u1'] }]).ok).toBe(false);
    const d = run(base(), [{ type: 'group.create', members: ['u1', 'u2'] }]).doc;
    expect(Object.values(d.groups)[0]!.members).toEqual(['u1', 'u2']);
    expect(run(d, [{ type: 'group.create', members: ['u1', 'u2'] }]).ok).toBe(false);
  });

  it('room corners: move, insert (splitting the wall), remove; refuse self-intersection', () => {
    const d = emptyDesign();
    const [a, b, c] = d.room.corners;
    const moved = run(d, [{ type: 'room.corner.move', id: c!.id, to: { x: 4500, z: 3500 } }]);
    expect(moved.ok).toBe(true);
    const inserted = run(d, [{ type: 'room.corner.insert', after: a!.id, at: { x: 2000, z: 0 } }]);
    expect(inserted.doc.room.corners).toHaveLength(5);
    expect(Object.keys(inserted.doc.room.walls)).toHaveLength(5);
    expect(checkDesign(inserted.doc, testCatalog)).toEqual([]);
    expect(run(d, [{ type: 'room.corner.move', id: b!.id, to: { x: 0, z: 5000 } }]).ok).toBe(false);
    const tri = run(d, [{ type: 'room.corner.remove', id: a!.id }]);
    expect(tri.ok).toBe(true);
    expect(tri.doc.room.corners).toHaveLength(3);
    expect(run(tri.doc, [{ type: 'room.corner.remove', id: b!.id }]).ok).toBe(false); // a room needs 3 corners
  });

  it('openings and obstacles are validated', () => {
    const d = emptyDesign();
    const wall = Object.keys(d.room.walls)[0]!;
    expect(
      run(d, [
        {
          type: 'room.opening.add',
          opening: { wall, kind: 'window', offset: 500, width: 1200, height: 1200, sill: 900 },
        },
      ]).ok,
    ).toBe(true);
    expect(
      run(d, [
        {
          type: 'room.opening.add',
          opening: { wall, kind: 'window', offset: 3500, width: 1200, height: 1200, sill: 900 },
        },
      ]).ok,
    ).toBe(false);
    expect(
      run(d, [
        {
          type: 'room.obstacle.add',
          obstacle: { kind: 'column', min: { x: 0, y: 0, z: 0 }, max: { x: 400, y: 2600, z: 400 } },
        },
      ]).ok,
    ).toBe(true);
    expect(
      run(d, [
        {
          type: 'room.obstacle.add',
          obstacle: { kind: 'box', min: { x: 10, y: 0, z: 0 }, max: { x: 0, y: 10, z: 10 } },
        },
      ]).ok,
    ).toBe(false);
  });

  it('room.update and design.rename', () => {
    const r = run(emptyDesign(), [
      { type: 'room.update', height: 2700, floor: { finish: 'chevron' } },
      { type: 'design.rename', name: 'Bedroom' },
    ]);
    expect(r.doc.room.height).toBe(2700);
    expect(r.doc.room.floor.finish).toBe('chevron');
    expect(r.doc.name).toBe('Bedroom');
  });
});

describe('transactions', () => {
  it('strict transactions are atomic', () => {
    const d = base();
    const r = run(d, [
      { type: 'entity.move', ids: ['u1'], delta: { x: 10, y: 0, z: 0 } },
      { type: 'entity.remove', ids: ['ghost'] },
    ]);
    expect(r.ok).toBe(false);
    expect(r.doc).toBe(d);
    expect(r.results.map((x) => x.ok)).toEqual([true, false]);
  });

  it('partial transactions apply what they can', () => {
    const r = run(
      base(),
      [
        { type: 'entity.move', ids: ['u1'], delta: { x: 10, y: 0, z: 0 } },
        { type: 'entity.remove', ids: ['ghost'] },
      ],
      'partial',
    );
    expect(u(r.doc, 'u1').position.x).toBe(1010);
    expect(r.results.map((x) => x.ok)).toEqual([true, false]);
    expect(r.doc.revision).toBe(1);
  });

  it('malformed ops are reported, never thrown', () => {
    const r = applyTransaction(
      base(),
      { label: 'x', ops: [{ type: 'entity.move', ids: 'u1' } as unknown as Op, { type: 'fly' } as unknown as Op] },
      ctx('partial'),
    );
    expect(r.results.every((x) => !x.ok)).toBe(true);
    expect(r.results[1]!.message).toMatch(/unknown operation|type/);
  });

  it('applying the inverse restores the document exactly (revision aside)', () => {
    const d = base();
    const r = run(d, [
      { type: 'unit.resize', id: 'u1', size: { w: 1200 } },
      { type: 'entity.remove', ids: ['u2'] },
      { type: 'room.update', height: 2800 },
    ]);
    const back = run(r.doc, r.inverse);
    expect({ ...back.doc, revision: 0, meta: d.meta }).toEqual({ ...d, revision: 0 });
  });

  it('an empty transaction changes nothing', () => {
    const d = base();
    expect(run(d, []).doc).toBe(d);
  });
});
