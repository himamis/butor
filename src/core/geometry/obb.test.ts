import { describe, expect, it } from 'vitest';
import { obbCorners, obbIntersects, obbFromLocal, type OBB } from './obb';

const box = (x: number, z: number, w: number, d: number, rot = 0, y = 0, h = 1000): OBB => ({
  center: { x, y: y + h / 2, z },
  half: { x: w / 2, y: h / 2, z: d / 2 },
  rotation: rot,
});

describe('obb', () => {
  it('axis-aligned boxes: overlap, touching, apart', () => {
    expect(obbIntersects(box(0, 0, 100, 100), box(90, 0, 100, 100))).toBe(true);
    expect(obbIntersects(box(0, 0, 100, 100), box(100, 0, 100, 100))).toBe(false); // touching faces
    expect(obbIntersects(box(0, 0, 100, 100), box(300, 0, 100, 100))).toBe(false);
  });

  it('respects the vertical extent', () => {
    expect(obbIntersects(box(0, 0, 100, 100, 0, 0, 500), box(0, 0, 100, 100, 0, 500, 500))).toBe(false);
    expect(obbIntersects(box(0, 0, 100, 100, 0, 0, 500), box(0, 0, 100, 100, 0, 499, 500))).toBe(true);
  });

  it('rotated boxes use the separating axis test (not their bounding boxes)', () => {
    // a 45° rotated square whose bounding box would overlap the other square, but the shapes do not
    const diamond = box(0, 0, 100, 100, 45);
    expect(obbIntersects(diamond, box(95, 95, 100, 100))).toBe(false);
    expect(obbIntersects(diamond, box(60, 0, 100, 100))).toBe(true);
  });

  it('a tolerance ignores tiny overlaps', () => {
    expect(obbIntersects(box(0, 0, 100, 100), box(99.6, 0, 100, 100), 0.5)).toBe(false);
    expect(obbIntersects(box(0, 0, 100, 100), box(99, 0, 100, 100), 0.5)).toBe(true);
  });

  it('obbFromLocal places a local box in the room via entity position and rotation', () => {
    const o = obbFromLocal(
      { x: 100, y: 50, z: 0 },
      { x: 20, y: 100, z: 10 },
      { position: { x: 1000, y: 0, z: 500 }, rotation: 90 },
    );
    expect(o.center.x).toBeCloseTo(1000);
    expect(o.center.z).toBeCloseTo(400); // local +x points to world −z at 90°
    expect(o.rotation).toBe(90);
    const xs = obbCorners(o).map((c) => c.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(10);
  });
});
