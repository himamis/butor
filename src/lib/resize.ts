import type { Room, SceneObject, Vec3 } from '../types';
import { clampParam, getTemplate } from '../templates';
import { objectBox, type Box } from './geometry';
import { wallBoxes } from './snapping';

export type Axis = 'x' | 'y' | 'z';
/** A resize handle: which local axis it changes, and on which face (+1 = right/top/front). */
export interface Handle {
  axis: Axis;
  sign: 1 | -1;
}

const PARAM: Record<Axis, string> = { x: 'width', y: 'height', z: 'depth' };
const SNAP = 20; // mm

/** Outward direction of a handle's face in room coordinates (rotation about Y, like three.js). */
export function handleWorldDir(o: SceneObject, h: Handle): Vec3 {
  if (h.axis === 'y') return { x: 0, y: h.sign, z: 0 };
  const a = (o.rotationY * Math.PI) / 180;
  const [lx, lz] = h.axis === 'x' ? [h.sign, 0] : [0, h.sign];
  return { x: lx * Math.cos(a) + lz * Math.sin(a), y: 0, z: -lx * Math.sin(a) + lz * Math.cos(a) };
}

const overlaps = (aMin: number, aMax: number, bMin: number, bMax: number) => aMin < bMax && bMin < aMax;

/** Faces (coordinates along `axis`) the moving face may snap to: neighbours, walls, columns, floor/ceiling. */
function snapTargets(box: Box, axis: Axis, others: Box[], room: Room): number[] {
  const rest = (['x', 'y', 'z'] as Axis[]).filter((a) => a !== axis);
  const out: number[] = [];
  for (const b of others) {
    if (rest.every((a) => overlaps(box.min[a], box.max[a], b.min[a], b.max[a]))) out.push(b.min[axis], b.max[axis]);
  }
  if (axis === 'y') out.push(room.height);
  else {
    const other = axis === 'x' ? 'z' : 'x';
    for (const w of wallBoxes(room)) if (w.axis === axis && overlaps(box.min[other], box.max[other], w.min, w.max)) out.push(w.at);
  }
  return out;
}

/**
 * Moves one face of an object by `grow` mm along its outward direction (negative shrinks).
 * The opposite face stays fixed. The new size snaps flush to a nearby face (within 20 mm),
 * otherwise to the grid, and is clamped to the template's limits.
 */
export function resizeObject(o: SceneObject, h: Handle, grow: number, opts: { grid: number; others: Box[]; room: Room }): SceneObject {
  const key = PARAM[h.axis];
  const def = getTemplate(o.templateId).params.find((p) => p.key === key);
  if (!def) return o;
  const size = o.params[key];
  let target = Math.round((size + grow) / opts.grid) * opts.grid;

  // Face snapping only when the face is axis-aligned in the room (rotation in 90° steps).
  const dir = handleWorldDir(o, h);
  const worldAxis: Axis | null = Math.abs(dir.y) > 0.999 ? 'y' : Math.abs(dir.x) > 0.999 ? 'x' : Math.abs(dir.z) > 0.999 ? 'z' : null;
  if (worldAxis) {
    const s = dir[worldAxis] > 0 ? 1 : -1;
    const box = objectBox(o);
    const face = s > 0 ? box.max[worldAxis] : box.min[worldAxis];
    const moved = face + s * grow;
    let best: number | null = null;
    for (const t of snapTargets(box, worldAxis, opts.others, opts.room)) {
      if (Math.abs(t - moved) <= SNAP && (best === null || Math.abs(t - moved) < Math.abs(best - moved))) best = t;
    }
    if (best !== null) target = size + s * (best - face);
  }

  target = clampParam(def, target);
  const change = target - size;
  // Keep the opposite face fixed: the bottom-center moves by half the change towards the dragged face.
  const shift = h.axis === 'y' ? { x: 0, z: 0 } : { x: (dir.x * change) / 2, z: (dir.z * change) / 2 };
  return {
    ...o,
    params: { ...o.params, [key]: target },
    position: { x: o.position.x + shift.x, y: o.position.y, z: o.position.z + shift.z },
  };
}
