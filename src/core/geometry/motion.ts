import type { Vec3 } from '../schema/primitives';
import { rotateXZ } from './footprint';
import type { Motion } from './part';

/**
 * Opening motions and explode offsets (docs/v2/07-rendering.md#motion-open-close-explode).
 * Pure functions shared by the renderer and the clearance checks, so what is tested is what is drawn.
 * Rotations follow three.js conventions (rotation.y / rotation.x, radians from degrees).
 */

/** Moves an entity-local point by a motion opened to fraction t ∈ [0, 1]. */
export function movePoint(p: Vec3, m: Motion, t: number): Vec3 {
  if (t === 0) return p;
  if (m.kind === 'slide') return { x: p.x + m.offset.x * t, y: p.y + m.offset.y * t, z: p.z + m.offset.z * t };
  const deg = m.angle * t;
  if (m.axis === 'y') {
    const r = rotateXZ({ x: p.x, z: p.z }, { x: m.pivot.x, z: m.pivot.z }, deg);
    return { x: r.x, y: p.y, z: r.z };
  }
  // About +x: (y, z) → (y cos − z sin, y sin + z cos), relative to the pivot.
  const a = (deg * Math.PI) / 180;
  const dy = p.y - m.pivot.y;
  const dz = p.z - m.pivot.z;
  return {
    x: p.x,
    y: m.pivot.y + dy * Math.cos(a) - dz * Math.sin(a),
    z: m.pivot.z + dy * Math.sin(a) + dz * Math.cos(a),
  };
}

/** How far (mm) a part on the outer surface of an entity travels at full explode. */
export const EXPLODE_DISTANCE = 300;
const SPREAD = 0.5;

/** Offset for a part (centre in entity-local mm) pushing it away from the entity's centre. size = entity size. */
export function explodeOffset(center: Vec3, size: Vec3, amount: number): Vec3 {
  if (amount === 0) return { x: 0, y: 0, z: 0 };
  const k = EXPLODE_DISTANCE * amount;
  return {
    x: (center.x / (size.x / 2)) * k,
    y: ((center.y - size.y / 2) / (size.y / 2)) * k,
    z: (center.z / (size.z / 2)) * k,
  };
}

/** Horizontal offset spreading whole entities away from the scene centre. */
export function spreadOffset(entityCenter: Vec3, sceneCenter: Vec3, amount: number): Vec3 {
  if (amount === 0) return { x: 0, y: 0, z: 0 };
  return {
    x: (entityCenter.x - sceneCenter.x) * SPREAD * amount,
    y: 0,
    z: (entityCenter.z - sceneCenter.z) * SPREAD * amount,
  };
}
