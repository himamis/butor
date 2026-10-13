import { describe, expect, it } from 'vitest';
import { buildScene, checkDesign, createIdGenerator, cutList, runChecks, type Unit } from '../core';
import { catalog } from './index';
import { importV1, isV1Design } from './v1import';

/** A v1 reference set: every v1 template, as v1 saved it (src/lib/persistence.ts on main). */
let n = 0;
const o = (
  templateId: string,
  x: number,
  params: Record<string, number> = {},
  extra: Record<string, unknown> = {},
) => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  templateId,
  name: templateId,
  params,
  position: { x, y: 0, z: 400 },
  rotationY: 0,
  color: '#ffffff',
  ...extra,
});
const V1 = {
  version: 1,
  room: {
    points: [
      { x: 0, z: 0 },
      { x: 12000, z: 0 },
      { x: 12000, z: 6000 },
      { x: 0, z: 6000 },
    ],
    height: 2600,
    wallThickness: 120,
    floorKind: 'wood',
    floorColor: '#c8a77e',
    wallColor: '#efece6',
    columns: [{ id: 'col', x: 11800, z: 5800, w: 300, d: 300 }],
  },
  objects: [
    o(
      'wardrobe',
      600,
      { width: 1000, height: 2200, depth: 600, thickness: 18, doors: 2, handle: 2 },
      { doorColor: '#8b5a2b', groupId: 'g1' },
    ),
    o(
      'wardrobe',
      1700,
      { width: 600, height: 2200, depth: 600, thickness: 18, doors: 1, hinge: 1, handle: 1 },
      { groupId: 'g1' },
    ),
    o('sliding-wardrobe', 3000, { width: 1800, height: 2300, depth: 650, thickness: 18, handle: 3 }),
    o('carcass', 4400, { width: 800, height: 2200, depth: 580, thickness: 18, shelves: 3 }),
    o('carcass-doors', 5300, { width: 800, height: 2200, depth: 600, thickness: 18, shelves: 3, doors: 2, handle: 1 }),
    o('drawer-unit', 6100, { width: 600, height: 800, depth: 500, thickness: 18, drawers: 4, handle: 2 }),
    o('top-cabinet', 7000, { width: 1000, height: 450, depth: 600, thickness: 18, shelves: 0, doors: 2 }),
    o('shoe-cabinet', 8000, { width: 800, height: 1000, depth: 350, thickness: 18, shelves: 4 }),
    o('open-shelving', 9000, { width: 800, height: 2000, depth: 350, thickness: 18, shelves: 5 }),
    o(
      'corner-unit',
      10800,
      { width: 1200, height: 2200, depth: 1200, armDepth: 580, thickness: 18, shelves: 4 },
      { position: { x: 600, y: 0, z: 5000 } },
    ),
    o('plinth', 2000, { width: 800, height: 100, depth: 560 }, { position: { x: 2000, y: 0, z: 2000 } }),
    o('cornice', 2000, { width: 820, height: 60, depth: 600 }, { position: { x: 2000, y: 2300, z: 2000 } }),
    o('filler', 4000, { width: 50, height: 2200, depth: 18 }, { position: { x: 4000, y: 0, z: 2500 } }),
    o('side-panel', 5000, { width: 18, height: 2200, depth: 580 }, { position: { x: 5000, y: 0, z: 2500 } }),
    o('horizontal-panel', 6000, { width: 800, height: 18, depth: 580 }, { position: { x: 6000, y: 1000, z: 2500 } }),
    o('back-panel', 7000, { width: 800, height: 2200, depth: 8 }, { position: { x: 7000, y: 0, z: 2500 } }),
    o('door', 8000, { width: 500, height: 700, depth: 18 }, { position: { x: 8000, y: 0, z: 2500 } }),
    o('inner-drawers', 9000, { width: 500, height: 400, depth: 500 }, { position: { x: 9000, y: 0, z: 2500 } }),
  ],
};

describe('v1 import', () => {
  const r = importV1(V1, createIdGenerator('v1'), '2026-10-13T00:00:00.000Z');
  if (!r.ok) throw new Error(r.error);
  const d = r.design;

  it('recognises v1 files', () => {
    expect(isV1Design(V1)).toBe(true);
    expect(isV1Design({ schemaVersion: 1 })).toBe(false);
  });

  it('the room: corners, wall thickness, floor, the column as an obstacle', () => {
    expect(d.room.corners.map((c) => [c.x, c.z])).toEqual(V1.room.points.map((p) => [p.x, p.z]));
    expect(Object.values(d.room.walls).every((w) => w.thickness === 120)).toBe(true);
    expect(d.room.floor.finish).toBe('planks');
    expect(d.room.obstacles).toEqual([
      { id: 'col', kind: 'column', min: { x: 11650, y: 0, z: 5650 }, max: { x: 11950, y: 2600, z: 5950 } },
    ]);
  });

  it('every unit and panel is rebuilt; only free-standing fronts/interior are kept unchanged and listed', () => {
    const kinds = d.order.map((id) => d.entities[id]!.kind);
    expect(kinds.filter((k) => k === 'unit')).toHaveLength(10);
    expect(kinds.filter((k) => k === 'part')).toHaveLength(6);
    expect(kinds.filter((k) => k === 'opaque')).toHaveLength(2);
    expect(r.warnings).toHaveLength(2);
    expect(checkDesign(d, catalog)).toEqual([]);
    const scene = buildScene(d, catalog);
    // only the two kept-unchanged objects show as "cannot be built"
    const invalid = runChecks(d, scene, catalog).filter((c) => c.kind === 'invalid');
    expect(invalid.flatMap((c) => c.entities).sort()).toEqual(
      d.order.filter((id) => d.entities[id]!.kind === 'opaque').sort(),
    );
    expect(cutList(d, scene).length).toBeGreaterThan(20);
  });

  it('ids, sizes, structure, colours and groups carry over', () => {
    const w = d.entities[V1.objects[0]!.id] as Unit;
    expect(w.size).toEqual({ w: 1000, h: 2200, d: 600 });
    expect(w.fronts.map((f) => f.template.id)).toEqual(['front.double-door']);
    expect(w.fronts[0]!.params.handle).toBe('bar');
    expect(d.materials[w.materials.front!]!.appearance.color).toBe('#8b5a2b');
    const one = d.entities[V1.objects[1]!.id] as Unit;
    expect(one.fronts[0]).toMatchObject({ template: { id: 'front.door' }, params: { hinge: 'right', handle: 'knob' } });
    const drawers = d.entities[V1.objects[5]!.id] as Unit;
    expect(drawers.columns[0]!.items).toHaveLength(4);
    expect(drawers.fronts.every((f) => f.drawer)).toBe(true);
    expect((d.entities[V1.objects[3]!.id] as Unit).columns[0]!.items).toHaveLength(3);
    expect(Object.values(d.groups)).toEqual([
      { id: expect.any(String), members: [V1.objects[0]!.id, V1.objects[1]!.id] },
    ]);
  });
});
