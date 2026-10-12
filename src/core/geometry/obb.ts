import type { Vec3 } from '../schema/primitives';
import { rotateXZ } from './footprint';

/** Box rotated about +y (degrees, three.js convention), in room coordinates (mm). */
export interface OBB {
  center: Vec3;
  half: Vec3;
  rotation: number;
}

export interface Placement {
  position: Vec3;
  rotation: number;
}

/** A box given in an entity's local frame (centre + full size), placed in the room. */
export function obbFromLocal(center: Vec3, size: Vec3, placement: Placement): OBB {
  const p = rotateXZ({ x: center.x, z: center.z }, { x: 0, z: 0 }, placement.rotation);
  return {
    center: { x: placement.position.x + p.x, y: placement.position.y + center.y, z: placement.position.z + p.z },
    half: { x: size.x / 2, y: size.y / 2, z: size.z / 2 },
    rotation: placement.rotation,
  };
}

/** The four x/z corners of the box footprint. */
export function obbCorners(o: OBB): { x: number; z: number }[] {
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([sx, sz]) =>
    rotateXZ({ x: o.center.x + sx! * o.half.x, z: o.center.z + sz! * o.half.z }, o.center, o.rotation),
  );
}

function axesOf(o: OBB) {
  const a = (o.rotation * Math.PI) / 180;
  return [
    { x: Math.cos(a), z: -Math.sin(a) },
    { x: Math.sin(a), z: Math.cos(a) },
  ];
}

/**
 * True if the boxes overlap by more than `tolerance` mm (touching faces do not count).
 * Vertical extent first, then the separating axis test on the x/z footprints.
 */
export function obbIntersects(a: OBB, b: OBB, tolerance = 0): boolean {
  const dy = Math.abs(a.center.y - b.center.y);
  if (dy >= a.half.y + b.half.y - tolerance) return false;
  const ca = obbCorners(a);
  const cb = obbCorners(b);
  for (const axis of [...axesOf(a), ...axesOf(b)]) {
    const project = (cs: { x: number; z: number }[]) => cs.map((c) => c.x * axis.x + c.z * axis.z);
    const pa = project(ca);
    const pb = project(cb);
    const overlap = Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb));
    if (overlap <= tolerance + 1e-9) return false;
  }
  return true;
}

/** Axis-aligned bounds of a box's corners (for broad-phase checks). */
export function obbAabb(o: OBB): { min: Vec3; max: Vec3 } {
  const cs = obbCorners(o);
  return {
    min: { x: Math.min(...cs.map((c) => c.x)), y: o.center.y - o.half.y, z: Math.min(...cs.map((c) => c.z)) },
    max: { x: Math.max(...cs.map((c) => c.x)), y: o.center.y + o.half.y, z: Math.max(...cs.map((c) => c.z)) },
  };
}
