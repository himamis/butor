import { describe, expect, it } from 'vitest';
import { handleWorldDir, resizeObject } from './resize';
import { objectBox, type Box } from './geometry';
import { DEFAULT_ROOM } from '../state/defaults';
import { obj } from '../test/fixtures';

const opts = { grid: 10, others: [] as Box[], room: DEFAULT_ROOM };
const carcass = (patch = {}) => obj('carcass', { position: { x: 1500, y: 0, z: 1000 }, ...patch }); // x 1100..1900

describe('resizeObject', () => {
  it('+x handle grows the width to the right; the left face stays put', () => {
    const o = carcass();
    const r = resizeObject(o, { axis: 'x', sign: 1 }, 104, opts);
    expect(r.params.width).toBe(900);
    expect(objectBox(r).min.x).toBe(objectBox(o).min.x);
    expect(objectBox(r).max.x).toBe(2000);
  });

  it('−x handle grows the width to the left; the right face stays put', () => {
    const o = carcass();
    const r = resizeObject(o, { axis: 'x', sign: -1 }, 200, opts);
    expect(r.params.width).toBe(1000);
    expect(objectBox(r).max.x).toBe(objectBox(o).max.x);
  });

  it('dragging inward shrinks, but never below the template minimum', () => {
    const r = resizeObject(carcass(), { axis: 'x', sign: 1 }, -5000, opts);
    expect(r.params.width).toBe(100);
    expect(objectBox(r).min.x).toBe(1100);
  });

  it('top handle changes the height and keeps the object on the floor', () => {
    const r = resizeObject(carcass(), { axis: 'y', sign: 1 }, 96, opts);
    expect(r.params.height).toBe(2300);
    expect(r.position.y).toBe(0);
  });

  it('works on rotated objects: the opposite face stays put in world space', () => {
    const o = carcass({ rotationY: 90 }); // local +x points to world −z
    expect(handleWorldDir(o, { axis: 'x', sign: 1 })).toMatchObject({ x: expect.closeTo(0), z: expect.closeTo(-1) });
    const r = resizeObject(o, { axis: 'x', sign: 1 }, 100, opts);
    expect(r.params.width).toBe(900);
    expect(objectBox(r).max.z).toBeCloseTo(objectBox(o).max.z);
    expect(objectBox(r).min.z).toBeCloseTo(objectBox(o).min.z - 100);
  });

  it('snaps the moving face flush to a neighbour within 20 mm', () => {
    const neighbour: Box = { min: { x: 2213, y: 0, z: 700 }, max: { x: 3000, y: 2200, z: 1300 } };
    const r = resizeObject(carcass(), { axis: 'x', sign: 1 }, 300, { ...opts, others: [neighbour] });
    expect(objectBox(r).max.x).toBe(2213);
  });

  it('snaps to a wall and to the ceiling', () => {
    const toWall = resizeObject(carcass(), { axis: 'x', sign: -1 }, 1090, opts);
    expect(objectBox(toWall).min.x).toBe(0);
    const toCeiling = resizeObject(carcass(), { axis: 'y', sign: 1 }, 390, opts);
    expect(toCeiling.params.height).toBe(DEFAULT_ROOM.height);
  });

  it('depth handles change depth', () => {
    const r = resizeObject(carcass(), { axis: 'z', sign: 1 }, 20, opts);
    expect(r.params.depth).toBe(600);
    expect(objectBox(r).min.z).toBe(objectBox(carcass()).min.z);
  });
});
