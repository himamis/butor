import { describe, expect, it } from 'vitest';
import { snapMove } from './snapping';
import { DEFAULT_ROOM } from '../state/defaults';
import type { Box } from './geometry';

const box = (x0: number, x1: number, z0 = 1000, z1 = 1580, y0 = 0, y1 = 2200): Box => ({
  min: { x: x0, y: y0, z: z0 },
  max: { x: x1, y: y1, z: z1 },
});

describe('snapMove', () => {
  it('rounds to the grid when nothing is near', () => {
    expect(snapMove(box(1000, 1800), { x: 123, y: 0, z: 47 }, [], DEFAULT_ROOM, 10)).toEqual({ x: 120, y: 0, z: 50 });
  });

  it('snaps flush against a neighbour within the threshold', () => {
    const d = snapMove(box(1000, 1800), { x: 185, y: 0, z: 0 }, [box(2000, 2800)], DEFAULT_ROOM, 10);
    expect(d.x).toBe(200); // right face 1800+200 = 2000 = neighbour's left face
  });

  it('snaps to a wall', () => {
    const d = snapMove(box(1000, 1800), { x: -990, y: 0, z: 0 }, [], DEFAULT_ROOM, 1);
    expect(d.x).toBe(-1000); // left face at x = 0 wall
  });

  it('ignores neighbours that do not overlap on the other axis', () => {
    const far = box(2000, 2800, 2500, 3000);
    expect(snapMove(box(1000, 1800), { x: 185, y: 0, z: 0 }, [far], DEFAULT_ROOM, 1).x).toBe(185);
  });

  it('never goes below the floor', () => {
    expect(snapMove(box(1000, 1800, 1000, 1580, 100, 300), { x: 0, y: -500, z: 0 }, [], DEFAULT_ROOM, 10).y).toBe(-100);
  });

  it('stacks on top of a box below', () => {
    const below = box(1000, 1800, 1000, 1580, 0, 800);
    const d = snapMove(box(1000, 1800, 1000, 1580, 900, 1700), { x: 0, y: -110, z: 0 }, [below], DEFAULT_ROOM, 1);
    expect(d.y).toBe(-100);
  });
});
