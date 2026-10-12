import { describe, expect, it } from 'vitest';
import { createIdGenerator } from '../ids';
import { checkDesign } from '../invariants';
import { isSimplePolygon, signedArea } from '../geometry/polygon';
import { snapCorner } from '../snapping';
import { testCatalog } from '../test/catalog';
import { emptyDesign } from '../test/designs';
import { reshapeRoom, ROOM_SHAPES, roomExtent, roomWalls, shapeCorners } from './shapes';

describe('room shapes', () => {
  for (const s of ROOM_SHAPES) {
    it(`${s.id}: a simple polygon, wound like the default room, with the requested extent`, () => {
      const pts = shapeCorners(s.id, 5000, 3000);
      expect(isSimplePolygon(pts)).toBe(true);
      expect(signedArea(pts)).toBeGreaterThan(0);
      const d = emptyDesign();
      const { room } = reshapeRoom(d.room, pts, createIdGenerator('r'));
      expect(roomExtent(room)).toEqual({ w: 5000, d: 3000 });
      expect(checkDesign({ ...d, room }, testCatalog)).toEqual([]);
    });
  }

  it('reshaping keeps height, finishes and obstacles, uses the usual wall thickness and drops openings', () => {
    const d = emptyDesign();
    const [k1, k2] = Object.keys(d.room.walls);
    const room = {
      ...d.room,
      height: 2800,
      walls: { ...d.room.walls, [k1!]: { thickness: 250 }, [k2!]: { thickness: 250 } },
      openings: [{ id: 'o', wall: k1!, kind: 'door' as const, offset: 100, width: 900, height: 2000, sill: 0 }],
      obstacles: [{ id: 'col', kind: 'column' as const, min: { x: 0, y: 0, z: 0 }, max: { x: 300, y: 2800, z: 300 } }],
    };
    const r = reshapeRoom(room, shapeCorners('l-shape', 4000, 4000), createIdGenerator('r'));
    expect(r.droppedOpenings).toBe(1);
    expect(r.room.openings).toEqual([]);
    expect(r.room.obstacles).toEqual(room.obstacles);
    expect(r.room.height).toBe(2800);
    expect(r.room.floor).toEqual(room.floor);
    // two walls at 250, two at the default 100: a tie keeps the first seen
    expect(new Set(Object.values(r.room.walls).map((w) => w.thickness)).size).toBe(1);
  });

  it('walls: lengths and inward normals', () => {
    const d = emptyDesign();
    const ws = roomWalls(d.room);
    expect(ws).toHaveLength(4);
    expect(ws[0]!.length).toBe(4000);
    // the first wall runs along z = 0 from x = 0 to 4000; the room is on +z
    expect(ws[0]!.inward.x).toBeCloseTo(0);
    expect(ws[0]!.inward.z).toBeCloseTo(1);
  });
});

describe('snapCorner', () => {
  const ns = [
    { x: 0, z: 0 },
    { x: 4000, z: 3500 },
  ];
  it('squares up with a neighbour within the threshold', () => {
    expect(snapCorner({ x: 3988, z: 23 }, ns, 10, 30)).toEqual({ x: 4000, z: 0, square: ['x', 'z'] });
  });
  it('rounds to the grid otherwise', () => {
    expect(snapCorner({ x: 1234, z: 2222 }, ns, 50, 30)).toEqual({ x: 1250, z: 2200, square: [] });
  });
  it('squares one axis and grids the other', () => {
    expect(snapCorner({ x: 3990, z: 1234 }, ns, 10, 30)).toEqual({ x: 4000, z: 1230, square: ['x'] });
  });
});
