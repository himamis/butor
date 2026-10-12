import type { Room, Vec3 } from '../types';
import type { Box } from './geometry';

type Axis = 'x' | 'y' | 'z';

const overlap1 = (aMin: number, aMax: number, bMin: number, bMax: number, pad: number) =>
  aMin < bMax + pad && bMin < aMax + pad;

/** Axis-aligned wall faces of the room as boxes with zero thickness on one axis. */
function wallBoxes(room: Room): { axis: Axis; at: number; min: number; max: number }[] {
  const out: { axis: Axis; at: number; min: number; max: number }[] = [];
  const pts = room.points;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (a.x === b.x) out.push({ axis: 'x', at: a.x, min: Math.min(a.z, b.z), max: Math.max(a.z, b.z) });
    else if (a.z === b.z) out.push({ axis: 'z', at: a.z, min: Math.min(a.x, b.x), max: Math.max(a.x, b.x) });
  }
  return out;
}

const roundTo = (v: number, step: number) => Math.round(v / step) * step;

/**
 * Corrects a move delta (mm): rounds to the grid, then snaps faces of the moving box
 * flush to (or aligned with) nearby boxes and walls within `threshold`.
 * Never lets the box go below the floor.
 */
export function snapMove(moving: Box, delta: Vec3, others: Box[], room: Room, grid: number, threshold = 20): Vec3 {
  const d = { x: roundTo(delta.x, grid), y: roundTo(delta.y, grid), z: roundTo(delta.z, grid) };
  const cand = (): Box => ({
    min: { x: moving.min.x + d.x, y: moving.min.y + d.y, z: moving.min.z + d.z },
    max: { x: moving.max.x + d.x, y: moving.max.y + d.y, z: moving.max.z + d.z },
  });

  for (const axis of ['x', 'z'] as const) {
    const other: Axis = axis === 'x' ? 'z' : 'x';
    const c = cand();
    let best: number | null = null;
    const consider = (target: number, face: number) => {
      const shift = target - face;
      if (Math.abs(shift) <= threshold && (best === null || Math.abs(shift) < Math.abs(best))) best = shift;
    };
    for (const o of others) {
      if (!overlap1(c.min.y, c.max.y, o.min.y, o.max.y, 0)) continue;
      if (!overlap1(c.min[other], c.max[other], o.min[other], o.max[other], threshold)) continue;
      consider(o.max[axis], c.min[axis]);
      consider(o.min[axis], c.max[axis]);
      consider(o.min[axis], c.min[axis]);
      consider(o.max[axis], c.max[axis]);
    }
    for (const w of wallBoxes(room)) {
      if (w.axis !== axis) continue;
      if (!overlap1(c.min[other], c.max[other], w.min, w.max, 0)) continue;
      consider(w.at, c.min[axis]);
      consider(w.at, c.max[axis]);
    }
    if (best !== null) d[axis] += best;
  }

  const c = cand();
  let bestY: number | null = null;
  const considerY = (target: number, face: number) => {
    const shift = target - face;
    if (Math.abs(shift) <= threshold && (bestY === null || Math.abs(shift) < Math.abs(bestY))) bestY = shift;
  };
  considerY(0, c.min.y);
  considerY(room.height, c.max.y);
  for (const o of others) {
    if (!overlap1(c.min.x, c.max.x, o.min.x, o.max.x, 0) || !overlap1(c.min.z, c.max.z, o.min.z, o.max.z, 0)) continue;
    considerY(o.max.y, c.min.y);
    considerY(o.min.y, c.max.y);
  }
  if (bestY !== null) d.y += bestY;
  if (moving.min.y + d.y < 0) d.y = -moving.min.y;
  return d;
}
