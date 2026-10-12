import type { Motion, Vec3 } from '../types';

/** Rotation angle (deg) and translation (mm) of a motion at open fraction t ∈ [0, 1]. */
export function motionAt(m: Motion, t: number): { angle: number; offset: Vec3 } {
  return m.kind === 'hinge'
    ? { angle: m.angle * t, offset: { x: 0, y: 0, z: 0 } }
    : { angle: 0, offset: { x: m.offset.x * t, y: m.offset.y * t, z: m.offset.z * t } };
}

/** Moves a local point p (mm) by motion m opened to fraction t. Rotation matches three.js Y rotation. */
export function applyMotion(m: Motion, t: number, p: Vec3): Vec3 {
  if (t === 0) return p;
  if (m.kind === 'slide') {
    const { offset } = motionAt(m, t);
    return { x: p.x + offset.x, y: p.y + offset.y, z: p.z + offset.z };
  }
  const a = (m.angle * t * Math.PI) / 180;
  const dx = p.x - m.pivot.x;
  const dz = p.z - m.pivot.z;
  return {
    x: m.pivot.x + dx * Math.cos(a) + dz * Math.sin(a),
    y: p.y,
    z: m.pivot.z - dx * Math.sin(a) + dz * Math.cos(a),
  };
}
