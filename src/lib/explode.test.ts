import { describe, expect, it } from 'vitest';
import { EXPLODE_DIST, objectExplodeOffset, partExplodeOffset } from './explode';

const size = { x: 800, y: 2200, z: 600 };

describe('partExplodeOffset', () => {
  it('is zero when not exploded', () => {
    expect(partExplodeOffset({ x: -391, y: 1100, z: 0 }, size, 0)).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('pushes sides out sideways, top up, bottom down, back backward, doors forward', () => {
    expect(partExplodeOffset({ x: -391, y: 1100, z: 0 }, size, 1).x).toBeLessThan(-EXPLODE_DIST * 0.9);
    expect(partExplodeOffset({ x: 391, y: 1100, z: 0 }, size, 1).x).toBeGreaterThan(EXPLODE_DIST * 0.9);
    expect(partExplodeOffset({ x: 0, y: 2191, z: 0 }, size, 1).y).toBeGreaterThan(EXPLODE_DIST * 0.9);
    expect(partExplodeOffset({ x: 0, y: 9, z: 0 }, size, 1).y).toBeLessThan(-EXPLODE_DIST * 0.9);
    expect(partExplodeOffset({ x: 0, y: 1100, z: -296 }, size, 1).z).toBeLessThan(-EXPLODE_DIST * 0.9);
    expect(partExplodeOffset({ x: 0, y: 1100, z: 291 }, size, 1).z).toBeGreaterThan(EXPLODE_DIST * 0.9);
  });

  it('scales with amount', () => {
    const a = partExplodeOffset({ x: -400, y: 1100, z: 0 }, size, 0.5);
    expect(a.x).toBeCloseTo(-EXPLODE_DIST / 2);
  });
});

describe('objectExplodeOffset', () => {
  it('spreads objects horizontally away from the scene center', () => {
    const o = objectExplodeOffset({ x: 2000, y: 1100, z: 500 }, { x: 1000, y: 1100, z: 500 }, 1);
    expect(o.x).toBeGreaterThan(0);
    expect(o.y).toBe(0);
    expect(o.z).toBe(0);
    expect(objectExplodeOffset({ x: 2000, y: 0, z: 0 }, { x: 1000, y: 0, z: 0 }, 0)).toEqual({ x: 0, y: 0, z: 0 });
  });
});
