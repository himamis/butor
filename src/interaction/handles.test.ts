import { describe, expect, it } from 'vitest';
import { faceHandles, HANDLE_OFFSET } from './handles';
import type { OBB } from '../core';

const obb = (rotation: number): OBB => ({
  center: { x: 1000, y: 1100, z: 300 },
  half: { x: 500, y: 1100, z: 300 },
  rotation,
});

describe('faceHandles', () => {
  it('puts a handle outside every side face and on top', () => {
    const hs = faceHandles(obb(0));
    const at = (id: string) => hs.find((h) => h.id === id)!.position;
    expect(at('x+')).toEqual({ x: 1500 + HANDLE_OFFSET, y: 1100, z: 300 });
    expect(at('x-')).toEqual({ x: 500 - HANDLE_OFFSET, y: 1100, z: 300 });
    expect(at('z+')).toEqual({ x: 1000, y: 1100, z: 600 + HANDLE_OFFSET });
    expect(at('y+')).toEqual({ x: 1000, y: 2200 + HANDLE_OFFSET, z: 300 });
    expect(hs).toHaveLength(5);
  });

  it('follows the entity rotation (local +x points to world −z at 90°)', () => {
    const p = faceHandles(obb(90)).find((h) => h.id === 'x+')!.position;
    expect(p.x).toBeCloseTo(1000);
    expect(p.z).toBeCloseTo(300 - 500 - HANDLE_OFFSET);
  });
});
