import { describe, expect, it } from 'vitest';
import { applyMotion } from './motion';
import type { Motion } from '../types';

const W = 400;
const leftHinge: Motion = { id: 'd', kind: 'hinge', pivot: { x: -W / 2, z: -9 }, angle: -90 };
const rightHinge: Motion = { id: 'd', kind: 'hinge', pivot: { x: W / 2, z: -9 }, angle: 90 };

describe('applyMotion', () => {
  it('is the identity when closed', () => {
    const p = { x: 123, y: 45, z: 6 };
    expect(applyMotion(leftHinge, 0, p)).toEqual(p);
    expect(applyMotion({ id: 's', kind: 'slide', offset: { x: 0, y: 0, z: 400 } }, 0, p)).toEqual(p);
  });

  it('left hinge swings the free (right) edge outward to +z', () => {
    const free = applyMotion(leftHinge, 1, { x: W / 2, y: 0, z: -9 });
    expect(free.x).toBeCloseTo(-W / 2);
    expect(free.z).toBeCloseTo(-9 + W);
  });

  it('right hinge swings the free (left) edge outward to +z', () => {
    const free = applyMotion(rightHinge, 1, { x: -W / 2, y: 0, z: -9 });
    expect(free.x).toBeCloseTo(W / 2);
    expect(free.z).toBeCloseTo(-9 + W);
  });

  it('the hinge pivot itself never moves', () => {
    expect(applyMotion(leftHinge, 0.5, { x: -W / 2, y: 100, z: -9 })).toEqual({ x: -W / 2, y: 100, z: -9 });
  });

  it('slide moves linearly with t', () => {
    expect(applyMotion({ id: 's', kind: 'slide', offset: { x: 0, y: 0, z: 400 } }, 0.5, { x: 1, y: 2, z: 3 })).toEqual({ x: 1, y: 2, z: 203 });
  });
});
