import { describe, expect, it } from 'vitest';
import { checkDesign } from './invariants';
import { testCatalog } from './test/catalog';
import { emptyDesign, unit, withEntities } from './test/designs';
import { Design } from './schema';
import type { Item, Front } from './schema';

const shelf = (id: string, y: number): Item => ({ id, template: { id: 'test.shelf' }, y, params: {} });
const drawer = (id: string, y: number, height = 200): Item => ({
  id,
  template: { id: 'test.drawer' },
  y,
  params: { height, style: 'external' },
});
const door = (id: string, columns: [number, number], y: [number, number], extra: Partial<Front> = {}): Front => ({
  id,
  template: { id: 'test.door' },
  columns,
  y,
  params: { hinge: 'left' },
  ...extra,
});
const errors = (d: Design) => checkDesign(d, testCatalog);

describe('checkDesign', () => {
  it('a new design and a well-formed unit are valid (and match the schema)', () => {
    const d = withEntities(
      emptyDesign(),
      unit('u1', {
        columns: [
          { id: 'c1', width: 'auto', items: [shelf('s1', 500), drawer('dr1', 0)] },
          { id: 'c2', width: 'auto', items: [] },
        ],
        fronts: [door('f1', [1, 1], [0, 2200])],
      }),
    );
    expect(Design.safeParse(d).success).toBe(true);
    expect(errors(d)).toEqual([]);
  });

  it('ids must be unique across the whole document', () => {
    const d = withEntities(
      emptyDesign(),
      unit('u1'),
      unit('u2', { columns: [{ id: 'u1-c1', width: 'auto', items: [] }] }),
    );
    expect(errors(d).join()).toMatch(/duplicate id "u1-c1"/);
  });

  it('order lists exactly the entities', () => {
    const d = { ...withEntities(emptyDesign(), unit('u1')), order: ['u1', 'ghost'] };
    expect(errors(d).join()).toMatch(/order/);
  });

  it('groups need two distinct existing members and an entity is in at most one group', () => {
    const base = withEntities(emptyDesign(), unit('u1'), unit('u2'), unit('u3'));
    expect(errors({ ...base, groups: { g: { id: 'g', members: ['u1', 'u1'] } } }).join()).toMatch(
      /group "g".*two different/,
    );
    expect(errors({ ...base, groups: { g: { id: 'g', members: ['u1', 'nope'] } } }).join()).toMatch(
      /missing entity "nope"/,
    );
    expect(
      errors({
        ...base,
        groups: { g: { id: 'g', members: ['u1', 'u2'] }, h: { id: 'h', members: ['u2', 'u3'] } },
      }).join(),
    ).toMatch(/"u2" is in more than one group/);
  });

  it('the room is a simple polygon with one wall per edge, and openings fit their walls', () => {
    const d = emptyDesign();
    const [a, b, c, e] = d.room.corners;
    const bowTie = { ...d, room: { ...d.room, corners: [a!, c!, b!, e!] } };
    expect(errors(bowTie).join()).toMatch(/self-intersect/);
    const noWall = { ...d, room: { ...d.room, walls: {} } };
    expect(errors(noWall).join()).toMatch(/missing wall/);
    const key = Object.keys(d.room.walls)[0]!;
    const tooWide = {
      ...d,
      room: {
        ...d.room,
        openings: [{ id: 'o1', wall: key, kind: 'window' as const, offset: 3500, width: 900, height: 1200, sill: 900 }],
      },
    };
    expect(errors(tooWide).join()).toMatch(/opening "o1".*beyond the wall/);
  });

  it('columns must fit (layout errors surface)', () => {
    const d = withEntities(
      emptyDesign(),
      unit('u1', {
        columns: [
          { id: 'c1', width: 900, items: [] },
          { id: 'c2', width: 'auto', items: [] },
        ],
      }),
    );
    expect(errors(d).join()).toMatch(/column 2 would be/);
  });

  it('items stay inside their column and do not overlap', () => {
    const out = withEntities(
      emptyDesign(),
      unit('u1', { columns: [{ id: 'c1', width: 'auto', items: [shelf('s1', 2160)] }] }),
    );
    expect(errors(out).join()).toMatch(/item "s1".*above the top/);
    const overlap = withEntities(
      emptyDesign(),
      unit('u1', { columns: [{ id: 'c1', width: 'auto', items: [drawer('a', 0), drawer('b', 150)] }] }),
    );
    expect(errors(overlap).join()).toMatch(/items "a" and "b" overlap/);
  });

  it('fronts stay within the unit, cover existing columns and do not overlap', () => {
    const base = (fronts: Front[]) => withEntities(emptyDesign(), unit('u1', { fronts }));
    expect(errors(base([door('f1', [0, 2], [0, 2200])])).join()).toMatch(/front "f1".*column 3/);
    expect(errors(base([door('f1', [0, 0], [0, 2300])])).join()).toMatch(/front "f1".*above the unit/);
    expect(errors(base([door('f1', [0, 1], [0, 1200]), door('f2', [1, 1], [1000, 2200])])).join()).toMatch(
      /fronts "f1" and "f2" overlap/,
    );
    expect(errors(base([door('f1', [0, 0], [0, 1100]), door('f2', [0, 0], [1100, 2200])]))).toEqual([]);
  });

  it('an attaching front must reference an item in a column it covers', () => {
    const d = withEntities(
      emptyDesign(),
      unit('u1', {
        columns: [
          { id: 'c1', width: 'auto', items: [drawer('dr1', 0)] },
          { id: 'c2', width: 'auto', items: [] },
        ],
        fronts: [door('f1', [1, 1], [0, 220], { template: { id: 'test.drawer-front' }, params: {}, item: 'dr1' })],
      }),
    );
    expect(errors(d).join()).toMatch(/front "f1".*item "dr1".*not in a column it covers/);
  });

  it('pairing follows the catalog: attaching fronts need an item that takes a front, one front per item', () => {
    const front = (id: string, y: [number, number], extra: Partial<Front> = {}) =>
      door(id, [0, 0], y, { template: { id: 'test.drawer-front' }, params: {}, ...extra });
    const internal: Item = { ...drawer('in', 300), params: { height: 200, style: 'internal' } };
    const d = (fronts: Front[]) =>
      errors(
        withEntities(
          emptyDesign(),
          unit('u1', { columns: [{ id: 'c1', width: 'auto', items: [drawer('dr1', 0), internal] }], fronts }),
        ),
      );
    expect(d([front('f1', [0, 220], { item: 'dr1' })])).toEqual([]);
    expect(d([front('f1', [0, 220])]).join()).toMatch(/"f1" must be attached to an item/);
    expect(d([door('f1', [0, 0], [0, 220], { item: 'dr1' })]).join()).toMatch(/"f1" does not attach to items/);
    expect(d([front('f1', [300, 520], { item: 'in' })]).join()).toMatch(/"in", which does not take a front/);
    expect(d([front('f1', [0, 110], { item: 'dr1' }), front('f2', [110, 220], { item: 'dr1' })]).join()).toMatch(
      /item "dr1" has more than one front/,
    );
  });

  it('units must use a known unit template; locked flags and opaque entities are allowed', () => {
    const d = withEntities(emptyDesign(), unit('u1', { template: { id: 'test.shelf' } }));
    expect(errors(d).join()).toMatch(/not a unit template/);
  });
});
