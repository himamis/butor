import { describe, expect, it } from 'vitest';
import { measureAlong, snapMove, snapFace, snapItemY, snapPoint, snapToBox, type SnapContext } from '.';
import type { OBB } from '../geometry/obb';

const box = (x0: number, x1: number, z0: number, z1: number, y0 = 0, y1 = 2000, rotation = 0): OBB => ({
  center: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 },
  half: { x: (x1 - x0) / 2, y: (y1 - y0) / 2, z: (z1 - z0) / 2 },
  rotation,
});
const room = (extra: Partial<SnapContext> = {}): SnapContext => ({
  boxes: [],
  walls: [
    { a: { x: 0, z: 0 }, b: { x: 4000, z: 0 } },
    { a: { x: 4000, z: 0 }, b: { x: 4000, z: 3500 } },
    { a: { x: 4000, z: 3500 }, b: { x: 0, z: 3500 } },
    { a: { x: 0, z: 3500 }, b: { x: 0, z: 0 } },
  ],
  ceiling: 2600,
  grid: 10,
  threshold: 25,
  ...extra,
});
const moving = box(1000, 1800, 500, 1100); // 800 × 600, away from everything

describe('snapMove', () => {
  it('rounds the resulting position (not the delta) to the grid when nothing is near', () => {
    const r = snapMove(room(), box(1003, 1803, 500, 1100), { x: 100, y: 0, z: 0 });
    expect(r.delta.x).toBe(97); // lands at 1100, back on the grid
    expect(r.guides).toEqual([]);
  });

  it('snaps flush against a neighbour and reports a guide', () => {
    const r = snapMove(room({ boxes: [{ id: 'n', obb: box(2000, 2800, 500, 1100) }] }), moving, { x: 188, y: 0, z: 0 });
    expect(r.delta.x).toBe(200); // right face 1800 + 200 = neighbour's left face
    expect(r.guides).toContainEqual(expect.objectContaining({ kind: 'flush', axis: 'x', at: 2000, target: 'n' }));
  });

  it('flush contact wins over a nearer alignment', () => {
    const ctx = room({
      boxes: [
        { id: 'n', obb: box(2000, 2800, 500, 1100) },
        { id: 'o', obb: box(1205, 1600, 1500, 2000) },
      ],
    });
    // moving left face could align with o's left face (1205) at delta 205 (5 away) — but flush with n is 12 away
    expect(snapMove(ctx, moving, { x: 188, y: 0, z: 0 }).delta.x).toBe(200);
  });

  it('snaps against walls (back wall: flush at z = 0)', () => {
    const r = snapMove(room(), moving, { x: 0, y: 0, z: -488 });
    expect(r.delta.z).toBe(-500);
    expect(r.guides).toContainEqual(expect.objectContaining({ kind: 'wall', axis: 'z', at: 0 }));
  });

  it('aligns fronts with a neighbour (same front plane)', () => {
    const ctx = room({ boxes: [{ id: 'n', obb: box(1800, 2600, 500, 1120) }] });
    const r = snapMove(ctx, box(1000, 1800, 513, 1113), { x: 0, y: 0, z: 0 });
    expect(r.delta.z).toBe(7); // front 1113 → 1120
    expect(r.guides).toContainEqual(expect.objectContaining({ kind: 'align', axis: 'z', at: 1120 }));
  });

  it('standing against a wall wins over aligning with a neighbour', () => {
    const ctx = room({ boxes: [{ id: 'n', obb: box(1800, 2600, 0, 620) }] });
    expect(snapMove(ctx, box(1000, 1800, 13, 613), { x: 0, y: 0, z: 0 }).delta.z).toBe(-13);
  });

  it('ignores neighbours that are far away on the other axis', () => {
    const ctx = room({ boxes: [{ id: 'far', obb: box(2000, 2800, 2500, 3000) }] });
    expect(snapMove(ctx, moving, { x: 188, y: 0, z: 0 }).delta.x).toBe(190); // grid only
  });

  it('stacks on top of a box below and never goes under the floor', () => {
    const ctx = room({ boxes: [{ id: 'below', obb: box(1000, 1800, 500, 1100, 0, 800) }] });
    const r = snapMove(ctx, box(1000, 1800, 500, 1100, 900, 1300), { x: 0, y: -112, z: 0 });
    expect(r.delta.y).toBe(-100);
    expect(snapMove(room(), box(1000, 1800, 500, 1100, 100, 500), { x: 0, y: -400, z: 0 }).delta.y).toBe(-100);
  });

  it('rotated boxes (not 90° steps) only snap their position to the grid', () => {
    const r = snapMove(
      room({ boxes: [{ id: 'n', obb: box(2000, 2800, 500, 1100) }] }),
      box(1000, 1800, 500, 1100, 0, 2000, 30),
      { x: 187, y: 0, z: 0 },
    );
    expect(r.guides).toEqual([]);
    expect((1400 + r.delta.x) % 10).toBe(0);
  });
});

describe('snapFace', () => {
  it('moves one face to a neighbour, a wall or the ceiling within the threshold, else the grid', () => {
    const ctx = room({ boxes: [{ id: 'n', obb: box(2213, 3000, 500, 1100) }] });
    expect(snapFace(ctx, moving, 'x', 1, 2200).value).toBe(2213); // right face → neighbour
    expect(snapFace(ctx, moving, 'x', -1, 12).value).toBe(0); // left face → wall
    expect(snapFace(ctx, moving, 'y', 1, 2590).value).toBe(2600); // top → ceiling
    expect(snapFace(ctx, moving, 'x', 1, 1904).value).toBe(1900); // grid
  });
});

describe('snapItemY', () => {
  it('snaps to the 32 mm hole system, or flush to neighbouring items', () => {
    expect(snapItemY(330, { neighbours: [], threshold: 12 })).toEqual({ y: 320, guide: '32 mm system' });
    expect(snapItemY(503, { neighbours: [{ from: 300, to: 500 }], threshold: 12 })).toEqual({
      y: 500,
      guide: 'on top of the item below',
    });
    expect(snapItemY(805, { neighbours: [{ from: 1000, to: 1018 }], height: 200, threshold: 12 })).toEqual({
      y: 800,
      guide: 'under the item above',
    });
  });
});

describe('snapPoint', () => {
  it('snaps a point to box corners and wall ends first, then the grid', () => {
    const ctx = room({ boxes: [{ id: 'n', obb: box(1000, 1800, 0, 600) }] });
    expect(snapPoint(ctx, { x: 1806, y: 0, z: 595 }).point).toEqual({ x: 1800, y: 0, z: 600 });
    expect(snapPoint(ctx, { x: 3990, y: 0, z: 8 }).point).toEqual({ x: 4000, y: 0, z: 0 });
    expect(snapPoint(ctx, { x: 2503, y: 0, z: 1507 }).point).toEqual({ x: 2500, y: 0, z: 1510 });
  });
});

describe('measure snapping', () => {
  const box = { center: { x: 0, y: 500, z: 0 }, half: { x: 300, y: 500, z: 200 }, rotation: 0 };
  it('a corner, then an edge, then the face point itself', () => {
    expect(snapToBox({ x: 295, y: 995, z: 200 }, box, 10)).toEqual({
      point: { x: 300, y: 1000, z: 200 },
      kind: 'corner',
    });
    expect(snapToBox({ x: 100, y: 994, z: 200 }, box, 10)).toEqual({
      point: { x: 100, y: 1000, z: 200 },
      kind: 'edge',
    });
    expect(snapToBox({ x: 100, y: 500, z: 200 }, box, 10).kind).toBe('face');
  });
  it('measures along the first normal, whatever the in-plane offset of the second point', () => {
    const r = measureAlong({ x: 3300, y: 1500, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 600, y: 300, z: 619.5 });
    expect(r.distance).toBe(619.5);
    expect(r.end).toEqual({ x: 3300, y: 1500, z: 619.5 });
  });
});
