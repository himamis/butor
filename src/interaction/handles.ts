import { rotateXZ, type OBB } from '../core';
import type { HandleSpec } from '../render/overlays';

export const HANDLE_OFFSET = 60; // mm outside the face

/** Resize handles on the four side faces and the top of an entity (ids name the local axis and side). */
export function faceHandles(b: OBB): HandleSpec[] {
  const local: [string, number, number, number][] = [
    ['x+', b.half.x + HANDLE_OFFSET, 0, 0],
    ['x-', -b.half.x - HANDLE_OFFSET, 0, 0],
    ['z+', 0, 0, b.half.z + HANDLE_OFFSET],
    ['z-', 0, 0, -b.half.z - HANDLE_OFFSET],
    ['y+', 0, b.half.y + HANDLE_OFFSET, 0],
  ];
  return local.map(([id, x, y, z]) => {
    const r = rotateXZ({ x, z }, { x: 0, z: 0 }, b.rotation);
    return { id, position: { x: b.center.x + r.x, y: b.center.y + y, z: b.center.z + r.z } };
  });
}
