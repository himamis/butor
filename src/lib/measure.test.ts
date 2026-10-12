import { describe, expect, it } from 'vitest';
import { measureBetween, snapNormal } from './measure';

describe('snapNormal', () => {
  it('snaps nearly axis-aligned normals to the axis', () => {
    expect(snapNormal({ x: 0.995, y: 0.05, z: 0.08 })).toEqual({ x: 1, y: 0, z: 0 });
    expect(snapNormal({ x: 0, y: -1, z: 0 })).toEqual({ x: 0, y: -1, z: 0 });
  });

  it('keeps (normalised) slanted normals', () => {
    const n = snapNormal({ x: 1, y: 0, z: 1 });
    expect(n.x).toBeCloseTo(Math.SQRT1_2);
    expect(n.z).toBeCloseTo(Math.SQRT1_2);
  });
});

describe('measureBetween', () => {
  it('measures the perpendicular gap from the first face to the second point', () => {
    // right side of one unit at x = 1200 (normal +x); left side of the next at x = 1450, at a different height/depth
    const m = measureBetween({ x: 1200, y: 1000, z: 300 }, { x: 1, y: 0, z: 0 }, { x: 1450, y: 400, z: 120 });
    expect(m.distance).toBe(250);
    expect(m.end).toEqual({ x: 1450, y: 1000, z: 300 });
  });

  it('is a positive distance even when the second point is behind the first face', () => {
    const m = measureBetween({ x: 0, y: 0, z: 500 }, { x: 0, y: 0, z: 1 }, { x: 10, y: 20, z: 200 });
    expect(m.distance).toBe(300);
    expect(m.end).toEqual({ x: 0, y: 0, z: 200 });
  });

  it('measures height from the floor', () => {
    expect(measureBetween({ x: 500, y: 0, z: 500 }, { x: 0, y: 1, z: 0 }, { x: 900, y: 2200, z: 100 }).distance).toBe(2200);
  });
});
