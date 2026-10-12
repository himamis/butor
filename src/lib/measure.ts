import type { Vec3 } from '../types';

const SNAP_COS = Math.cos((10 * Math.PI) / 180); // within 10° of an axis counts as that axis

/** Normalises a face normal and snaps it to the nearest axis when it is nearly axis-aligned. */
export function snapNormal(n: Vec3): Vec3 {
  const len = Math.hypot(n.x, n.y, n.z) || 1;
  const u = { x: n.x / len, y: n.y / len, z: n.z / len };
  for (const k of ['x', 'y', 'z'] as const) {
    if (Math.abs(u[k]) >= SNAP_COS) return { x: 0, y: 0, z: 0, [k]: Math.sign(u[k]) };
  }
  return u;
}

/**
 * Distance from the plane through `a` (facing `n`) to point `b`, measured along `n` —
 * the gap a tape measure held square to the first surface would show. `end` is where it lands.
 */
export function measureBetween(a: Vec3, n: Vec3, b: Vec3): { distance: number; end: Vec3 } {
  const t = (b.x - a.x) * n.x + (b.y - a.y) * n.y + (b.z - a.z) * n.z;
  const r = (v: number) => Math.round(v * 10) / 10;
  return { distance: r(Math.abs(t)), end: { x: r(a.x + n.x * t), y: r(a.y + n.y * t), z: r(a.z + n.z * t) } };
}
