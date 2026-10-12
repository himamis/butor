import { describe, expect, it } from 'vitest';
import { applyTransaction, runChecks, wallKey, type Design, type Op } from '../core';
import { catalog } from './index';
import { add, ctx, freshDesign, sceneOf } from './test-helpers';

/** Checks are core logic, but they are only meaningful with real templates, so they are tested here. */
const unit = (x: number, z = 300, extra: Record<string, unknown> = {}) => ({
  kind: 'unit' as const,
  template: { id: 'unit.standard' },
  position: { x, z },
  size: { w: 800, h: 2000, d: 600 },
  ...extra,
});
const apply = (d: Design, ops: Op[]) => {
  const r = applyTransaction(d, { label: 't', ops }, ctx('c'));
  expect(r.results.filter((x) => !x.ok)).toEqual([]);
  return r.doc;
};
const checks = (d: Design) => runChecks(d, sceneOf(d), catalog);
const kinds = (d: Design) => checks(d).map((c) => c.kind);

describe('runChecks', () => {
  it('a unit against the back wall in an empty room has no problems', () => {
    expect(checks(add(freshDesign(), unit(1000)).doc)).toEqual([]);
  });

  it('overlapping units are an error naming both; touching ones are fine', () => {
    const touching = apply(add(freshDesign(), unit(1000)).doc, [{ type: 'entity.add', entity: unit(1800) }]);
    expect(kinds(touching)).not.toContain('overlap');
    const overlapping = apply(add(freshDesign(), unit(1000)).doc, [{ type: 'entity.add', entity: unit(1700) }]);
    const c = checks(overlapping).find((x) => x.kind === 'overlap')!;
    expect(c).toMatchObject({ severity: 'error', entities: [expect.any(String), expect.any(String)] });
  });

  it('obstacles, the room boundary and the ceiling', () => {
    let d = add(freshDesign(), unit(300)).doc;
    d = apply(d, [
      {
        type: 'room.obstacle.add',
        obstacle: { kind: 'column', min: { x: 0, y: 0, z: 0 }, max: { x: 400, y: 2600, z: 400 } },
      },
    ]);
    expect(kinds(d)).toContain('obstacle');
    expect(kinds(add(freshDesign(), unit(3800)).doc)).toContain('outside-room'); // 3400..4200 > 4000
    expect(kinds(add(freshDesign(), unit(1000, 300, { size: { w: 800, h: 2800, d: 600 } })).doc)).toContain('ceiling');
  });

  it('a door that swings into a wall or another unit is a clearance warning', () => {
    // a right-hinged door on a unit against the right wall swings into the wall
    const atWall = add(
      freshDesign(),
      unit(3600, 300, {
        columns: [{ width: 'auto' }],
        fronts: [{ template: { id: 'front.door' }, columns: [0, 0], y: [0, 2000], params: { hinge: 'right' } }],
      }),
    ).doc;
    expect(checks(atWall).find((c) => c.kind === 'door-swing')).toMatchObject({ severity: 'warning' });
    const free = add(
      freshDesign(),
      unit(1500, 300, {
        columns: [{ width: 'auto' }],
        fronts: [{ template: { id: 'front.door' }, columns: [0, 0], y: [0, 2000], params: { hinge: 'right' } }],
      }),
    ).doc;
    expect(kinds(free)).not.toContain('door-swing');
  });

  it('a drawer that cannot be pulled out is a clearance warning', () => {
    let d = add(
      freshDesign(),
      unit(1000, 300, {
        columns: [{ width: 'auto', items: [{ id: 'dr', template: { id: 'item.drawer' }, y: 0 }] }],
        fronts: [{ template: { id: 'front.drawer' }, columns: [0, 0], y: [0, 240], drawer: 'dr' }],
      }),
    ).doc;
    expect(kinds(d)).not.toContain('pull-out');
    d = apply(d, [
      {
        type: 'entity.add',
        entity: {
          kind: 'part',
          template: { id: 'part.panel' },
          position: { x: 1000, z: 900 },
          params: { width: 900, height: 900 },
        },
      },
    ]);
    expect(kinds(d)).toContain('pull-out');
  });

  it('a unit in front of a window is flagged', () => {
    const base = freshDesign();
    const back = wallKey(base.room.corners[0]!.id, base.room.corners[1]!.id); // the wall at z = 0
    const d = apply(add(base, unit(1000)).doc, [
      {
        type: 'room.opening.add',
        opening: { wall: back, kind: 'window', offset: 700, width: 800, height: 1200, sill: 900 },
      },
    ]);
    expect(checks(d).find((c) => c.kind === 'opening')).toMatchObject({
      severity: 'warning',
      message: expect.stringMatching(/window/),
    });
  });

  it('a board thickness the material does not come in is flagged', () => {
    const d = add(freshDesign(), unit(1000, 300, { params: { thickness: 22 } })).doc;
    expect(checks(d).find((c) => c.kind === 'material')).toMatchObject({ message: expect.stringMatching(/22 mm/) });
  });
});
