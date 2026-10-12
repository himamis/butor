import { obbAabb, type OBB } from '../geometry/obb';
import type { Axis } from '../geometry/part';
import type { Vec3 } from '../schema/primitives';

/**
 * One snapping engine for move, resize, place, measure and room edit (docs/v2/06-interaction.md).
 * Priority: flush contact > face alignment > centre alignment > grid. Guides say what was snapped to.
 */
export interface SnapBox {
  id: string;
  obb: OBB;
}
export interface SnapWall {
  a: { x: number; z: number };
  b: { x: number; z: number };
}
export interface SnapContext {
  boxes: SnapBox[]; // other entities and obstacles (room coordinates)
  walls: SnapWall[]; // inner wall faces (room polygon edges)
  ceiling: number;
  grid: number; // 1, 10 or 50 mm
  threshold: number; // mm, derived from ~8 screen px
}
export interface Guide {
  kind: 'flush' | 'align' | 'center' | 'wall' | 'floor' | 'ceiling';
  axis: Axis;
  at: number; // coordinate on `axis` that was snapped to
  target?: string; // box id
  label: string;
}

type Range = { min: Vec3; max: Vec3 };
const KIND_RANK: Record<Guide['kind'], number> = { flush: 0, wall: 0, floor: 0, ceiling: 0, align: 1, center: 2 };
const LABEL: Record<Guide['kind'], string> = {
  flush: 'flush',
  wall: 'against the wall',
  floor: 'on the floor',
  ceiling: 'at the ceiling',
  align: 'aligned',
  center: 'centred',
};

const roundTo = (v: number, step: number) => Math.round(v / step) * step;
const overlaps = (a0: number, a1: number, b0: number, b1: number, pad = 0) => a0 < b1 + pad && b0 < a1 + pad;
const axisAligned = (rotation: number) =>
  Math.abs(((rotation % 90) + 90) % 90) < 1e-6 || Math.abs((((rotation % 90) + 90) % 90) - 90) < 1e-6;
const shifted = (r: Range, d: Vec3): Range => ({
  min: { x: r.min.x + d.x, y: r.min.y + d.y, z: r.min.z + d.z },
  max: { x: r.max.x + d.x, y: r.max.y + d.y, z: r.max.z + d.z },
});

interface Candidate {
  shift: number;
  guide: Guide;
}

function best(cands: Candidate[], threshold: number): Candidate | null {
  let pick: Candidate | null = null;
  for (const c of cands) {
    if (Math.abs(c.shift) > threshold + 1e-9) continue;
    if (!pick) pick = c;
    else {
      const rank = KIND_RANK[c.guide.kind] - KIND_RANK[pick.guide.kind];
      if (rank < 0 || (rank === 0 && Math.abs(c.shift) < Math.abs(pick.shift))) pick = c;
    }
  }
  return pick;
}

/** Walls that run along `axis` direction's perpendicular — i.e. planes at a fixed coordinate on `axis`. */
function wallPlanes(walls: SnapWall[], axis: 'x' | 'z') {
  const other = axis === 'x' ? 'z' : 'x';
  return walls
    .filter((w) => Math.abs(w.a[axis] - w.b[axis]) < 1e-6)
    .map((w) => ({ at: w.a[axis], from: Math.min(w.a[other], w.b[other]), to: Math.max(w.a[other], w.b[other]) }));
}

function horizontalCandidates(ctx: SnapContext, c: Range, axis: 'x' | 'z'): Candidate[] {
  const other = axis === 'x' ? 'z' : 'x';
  const out: Candidate[] = [];
  const mid = (c.min[axis] + c.max[axis]) / 2;
  for (const b of ctx.boxes) {
    const o = obbAabb(b.obb);
    if (!overlaps(c.min.y, c.max.y, o.min.y, o.max.y)) continue;
    if (!overlaps(c.min[other], c.max[other], o.min[other], o.max[other], ctx.threshold)) continue;
    const g = (kind: Guide['kind'], at: number): Guide => ({ kind, axis, at, target: b.id, label: LABEL[kind] });
    out.push({ shift: o.min[axis] - c.max[axis], guide: g('flush', o.min[axis]) });
    out.push({ shift: o.max[axis] - c.min[axis], guide: g('flush', o.max[axis]) });
    out.push({ shift: o.min[axis] - c.min[axis], guide: g('align', o.min[axis]) });
    out.push({ shift: o.max[axis] - c.max[axis], guide: g('align', o.max[axis]) });
    const om = (o.min[axis] + o.max[axis]) / 2;
    out.push({ shift: om - mid, guide: g('center', om) });
  }
  for (const w of wallPlanes(ctx.walls, axis)) {
    if (!overlaps(c.min[other], c.max[other], w.from, w.to)) continue;
    const g: Guide = { kind: 'wall', axis, at: w.at, label: LABEL.wall };
    out.push({ shift: w.at - c.min[axis], guide: g });
    out.push({ shift: w.at - c.max[axis], guide: g });
  }
  return out;
}

function verticalCandidates(ctx: SnapContext, c: Range): Candidate[] {
  const out: Candidate[] = [
    { shift: 0 - c.min.y, guide: { kind: 'floor', axis: 'y', at: 0, label: LABEL.floor } },
    { shift: ctx.ceiling - c.max.y, guide: { kind: 'ceiling', axis: 'y', at: ctx.ceiling, label: LABEL.ceiling } },
  ];
  for (const b of ctx.boxes) {
    const o = obbAabb(b.obb);
    if (!overlaps(c.min.x, c.max.x, o.min.x, o.max.x) || !overlaps(c.min.z, c.max.z, o.min.z, o.max.z)) continue;
    out.push({
      shift: o.max.y - c.min.y,
      guide: { kind: 'flush', axis: 'y', at: o.max.y, target: b.id, label: 'on top' },
    });
    out.push({
      shift: o.min.y - c.max.y,
      guide: { kind: 'flush', axis: 'y', at: o.min.y, target: b.id, label: 'underneath' },
    });
  }
  return out;
}

/** Corrects a move delta for a box (closed state, room coordinates). Never lets it go below the floor. */
export function snapMove(ctx: SnapContext, moving: OBB, delta: Vec3): { delta: Vec3; guides: Guide[] } {
  const r = obbAabb(moving);
  const d = { ...delta };
  const guides: Guide[] = [];
  if (!axisAligned(moving.rotation)) {
    d.x = roundTo(moving.center.x + delta.x, ctx.grid) - moving.center.x;
    d.z = roundTo(moving.center.z + delta.z, ctx.grid) - moving.center.z;
    d.y = Math.max(roundTo(r.min.y + delta.y, ctx.grid), 0) - r.min.y;
    return { delta: d, guides };
  }
  for (const axis of ['x', 'z'] as const) {
    const pick = best(horizontalCandidates(ctx, shifted(r, d), axis), ctx.threshold);
    if (pick) {
      d[axis] += pick.shift;
      guides.push(pick.guide);
    } else d[axis] = roundTo(r.min[axis] + d[axis], ctx.grid) - r.min[axis];
  }
  const pickY = best(verticalCandidates(ctx, shifted(r, d)), ctx.threshold);
  if (pickY) {
    d.y += pickY.shift;
    if (pickY.guide.kind !== 'floor' || delta.y !== 0) guides.push(pickY.guide);
  } else d.y = roundTo(r.min.y + d.y, ctx.grid) - r.min.y;
  if (r.min.y + d.y < 0) d.y = -r.min.y;
  return { delta: d, guides };
}

/** Snaps one face of a box (resize). `value` is the face's proposed coordinate on `axis`; sign = which face. */
export function snapFace(
  ctx: SnapContext,
  moving: OBB,
  axis: Axis,
  sign: 1 | -1,
  value: number,
): { value: number; guide?: Guide } {
  const r = obbAabb(moving);
  const cands: Candidate[] = [];
  if (axis === 'y') {
    cands.push({ shift: ctx.ceiling - value, guide: { kind: 'ceiling', axis, at: ctx.ceiling, label: LABEL.ceiling } });
    for (const b of ctx.boxes) {
      const o = obbAabb(b.obb);
      if (!overlaps(r.min.x, r.max.x, o.min.x, o.max.x) || !overlaps(r.min.z, r.max.z, o.min.z, o.max.z)) continue;
      cands.push({
        shift: (sign > 0 ? o.min.y : o.max.y) - value,
        guide: { kind: 'flush', axis, at: sign > 0 ? o.min.y : o.max.y, target: b.id, label: LABEL.flush },
      });
    }
  } else {
    const other = axis === 'x' ? 'z' : 'x';
    for (const b of ctx.boxes) {
      const o = obbAabb(b.obb);
      if (
        !overlaps(r.min.y, r.max.y, o.min.y, o.max.y) ||
        !overlaps(r.min[other], r.max[other], o.min[other], o.max[other], ctx.threshold)
      )
        continue;
      for (const [at, kind] of [
        [o.min[axis], sign > 0 ? 'flush' : 'align'],
        [o.max[axis], sign > 0 ? 'align' : 'flush'],
      ] as const) {
        cands.push({ shift: at - value, guide: { kind, axis, at, target: b.id, label: LABEL[kind] } });
      }
    }
    for (const w of wallPlanes(ctx.walls, axis)) {
      if (overlaps(r.min[other], r.max[other], w.from, w.to))
        cands.push({ shift: w.at - value, guide: { kind: 'wall', axis, at: w.at, label: LABEL.wall } });
    }
  }
  const pick = best(cands, ctx.threshold);
  return pick ? { value: value + pick.shift, guide: pick.guide } : { value: roundTo(value, ctx.grid) };
}

/** Item heights inside a unit column: flush to neighbouring items, else the 32 mm hole system. */
export function snapItemY(
  y: number,
  o: { neighbours: { from: number; to: number }[]; height?: number; threshold: number },
): { y: number; guide: string } {
  let pick: { y: number; d: number; guide: string } | null = null;
  const consider = (cand: number, guide: string) => {
    const d = Math.abs(cand - y);
    if (d <= o.threshold && (!pick || d < pick.d)) pick = { y: cand, d, guide };
  };
  for (const n of o.neighbours) {
    consider(n.to, 'on top of the item below');
    if (o.height !== undefined) consider(n.from - o.height, 'under the item above');
  }
  const found = pick as { y: number; guide: string } | null;
  return found ? { y: found.y, guide: found.guide } : { y: Math.max(0, roundTo(y, 32)), guide: '32 mm system' };
}

/** Snaps a point (measure, room edit) to box corners and wall ends, then the grid. */
export function snapPoint(ctx: SnapContext, p: Vec3): { point: Vec3; guide?: string } {
  let pick: { x: number; z: number; d: number; label: string } | null = null;
  const consider = (x: number, z: number, label: string) => {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d <= ctx.threshold && (!pick || d < pick.d)) pick = { x, z, d, label };
  };
  for (const b of ctx.boxes) {
    const o = obbAabb(b.obb);
    for (const x of [o.min.x, o.max.x]) for (const z of [o.min.z, o.max.z]) consider(x, z, 'corner');
  }
  for (const w of ctx.walls) {
    consider(w.a.x, w.a.z, 'wall end');
    consider(w.b.x, w.b.z, 'wall end');
  }
  const found = pick as { x: number; z: number; label: string } | null;
  if (found) return { point: { x: found.x, y: p.y, z: found.z }, guide: found.label };
  return { point: { x: roundTo(p.x, ctx.grid), y: p.y, z: roundTo(p.z, ctx.grid) } };
}
