import { describe, expect, it } from 'vitest';
import { EXPLODE_DISTANCE, explodeOffset, movePoint, spreadOffset } from './motion';
import type { Motion } from './part';

const near = (p: { x: number; y: number; z: number }, q: { x: number; y: number; z: number }) => {
  expect(p.x).toBeCloseTo(q.x, 6);
  expect(p.y).toBeCloseTo(q.y, 6);
  expect(p.z).toBeCloseTo(q.z, 6);
};

describe('movePoint', () => {
  const leftDoor: Motion = { id: 'd', kind: 'hinge', axis: 'y', pivot: { x: -200, y: 0, z: 300 }, angle: -90 };
  const rightDoor: Motion = { id: 'd', kind: 'hinge', axis: 'y', pivot: { x: 200, y: 0, z: 300 }, angle: 90 };
  const flap: Motion = { id: 'f', kind: 'hinge', axis: 'x', pivot: { x: 0, y: 2000, z: 300 }, angle: -90 };
  const drawer: Motion = { id: 'r', kind: 'slide', offset: { x: 0, y: 0, z: 400 } };

  it('closed (t = 0) is the identity', () => {
    for (const m of [leftDoor, flap, drawer]) near(movePoint({ x: 1, y: 2, z: 3 }, m, 0), { x: 1, y: 2, z: 3 });
  });

  it('left and right hinged doors swing their free edge outward (+z)', () => {
    near(movePoint({ x: 200, y: 500, z: 300 }, leftDoor, 1), { x: -200, y: 500, z: 700 });
    near(movePoint({ x: -200, y: 500, z: 300 }, rightDoor, 1), { x: 200, y: 500, z: 700 });
  });

  it('a lift-up flap swings its bottom edge outward and up', () => {
    near(movePoint({ x: 0, y: 1600, z: 300 }, flap, 1), { x: 0, y: 2000, z: 700 });
    expect(movePoint({ x: 0, y: 1600, z: 300 }, flap, 0.5).z).toBeGreaterThan(300);
  });

  it('a drawer slides forward proportionally', () => {
    near(movePoint({ x: 0, y: 0, z: 0 }, drawer, 0.5), { x: 0, y: 0, z: 200 });
  });
});

describe('explode', () => {
  const size = { x: 800, y: 2200, z: 600 };
  it('zero amount → no offset; outer parts move outward by EXPLODE_DISTANCE', () => {
    near(explodeOffset({ x: -391, y: 1100, z: 0 }, size, 0), { x: 0, y: 0, z: 0 });
    expect(explodeOffset({ x: -400, y: 1100, z: 0 }, size, 1).x).toBeCloseTo(-EXPLODE_DISTANCE);
    expect(explodeOffset({ x: 0, y: 2200, z: 0 }, size, 1).y).toBeCloseTo(EXPLODE_DISTANCE);
    expect(explodeOffset({ x: 0, y: 1100, z: 300 }, size, 1).z).toBeCloseTo(EXPLODE_DISTANCE);
  });

  it('whole entities spread horizontally from the scene centre', () => {
    const o = spreadOffset({ x: 2000, y: 0, z: 500 }, { x: 1000, y: 0, z: 500 }, 1);
    expect(o.x).toBeGreaterThan(0);
    expect(o.y).toBe(0);
    near(spreadOffset({ x: 2000, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 0), { x: 0, y: 0, z: 0 });
  });
});
