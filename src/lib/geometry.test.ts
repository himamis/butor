import { describe, expect, it } from 'vitest';
import { boundsOf, findOverlaps, objectBox, toWorld } from './geometry';
import { obj } from '../test/fixtures';

describe('geometry', () => {
  it('objectBox at 0° spans width × height × depth around bottom-center', () => {
    const b = objectBox(obj('carcass', { position: { x: 1000, y: 0, z: 500 } }));
    expect(b.min).toEqual({ x: 600, y: 0, z: 210 });
    expect(b.max).toEqual({ x: 1400, y: 2200, z: 790 });
  });

  it('objectBox at 90° swaps width and depth', () => {
    const b = objectBox(obj('carcass', { rotationY: 90 }));
    expect(b.max.x - b.min.x).toBeCloseTo(580);
    expect(b.max.z - b.min.z).toBeCloseTo(800);
  });

  it('toWorld matches three.js Y rotation: +x local goes to -z world at +90°', () => {
    const p = toWorld(obj('carcass', { rotationY: 90 }), { x: 100, y: 0, z: 0 });
    expect(p.x).toBeCloseTo(0);
    expect(p.z).toBeCloseTo(-100);
  });

  it('boundsOf unions objects and is null for none', () => {
    expect(boundsOf([])).toBeNull();
    const b = boundsOf([obj('carcass', { position: { x: 400, y: 0, z: 0 } }), obj('carcass', { position: { x: 1200, y: 0, z: 0 } })])!;
    expect(b.min.x).toBe(0);
    expect(b.max.x).toBe(1600);
  });

  it('findOverlaps: side-by-side touching units do not overlap', () => {
    const a = obj('carcass', { position: { x: 400, y: 0, z: 0 } });
    const b = obj('carcass', { position: { x: 1200, y: 0, z: 0 } });
    expect(findOverlaps([a, b]).size).toBe(0);
  });

  it('findOverlaps: intersecting units are both flagged', () => {
    const a = obj('carcass', { position: { x: 400, y: 0, z: 0 } });
    const b = obj('carcass', { position: { x: 1100, y: 0, z: 0 } });
    expect([...findOverlaps([a, b])].sort()).toEqual([a.id, b.id].sort());
  });

  it('findOverlaps: a shelf inside an open carcass gap is not an overlap', () => {
    const c = obj('carcass', { position: { x: 0, y: 0, z: 0 } }, { shelves: 0 });
    const shelf = obj('horizontal-panel', { position: { x: 0, y: 1000, z: 4 } }, { width: 764, depth: 572 });
    expect(findOverlaps([c, shelf]).size).toBe(0);
  });
});
