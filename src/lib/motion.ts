import type { Motion, Vec3 } from '../types';

/** Rotation angle (deg) and translation (mm) of a motion at open fraction t ∈ [0, 1]. */
export function motionAt(m: Motion, t: number): { angle: number; offset: Vec3 } {
  return m.kind === 'hinge'
    ? { angle: m.angle * t, offset: { x: 0, y: 0, z: 0 } }
    : { angle: 0, offset: { x: m.offset.x * t, y: m.offset.y * t, z: m.offset.z * t } };
}

/**
 * Transform of a part rendered as outer group (position + Y rotation) → inner group (position) → panels.
 * Hinges rotate about their pivot: outer sits at the pivot, inner shifts back by it. All values in mm / radians.
 */
export function partTransform(m: Motion | undefined, t: number, explode: Vec3): { outer: Vec3; inner: Vec3; rotationY: number } {
  const pivot = m?.kind === 'hinge' ? m.pivot : { x: 0, z: 0 };
  const { angle, offset } = m ? motionAt(m, t) : { angle: 0, offset: { x: 0, y: 0, z: 0 } };
  return {
    outer: { x: pivot.x + offset.x + explode.x, y: offset.y + explode.y, z: pivot.z + offset.z + explode.z },
    inner: { x: -pivot.x, y: 0, z: -pivot.z },
    rotationY: (angle * Math.PI) / 180,
  };
}
