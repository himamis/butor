import { rotateXZ, type Design, type OBB, type SceneModel, type Vec3 } from '../core';
import type { Inner, ViewPort } from './types';

export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
export const scale = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};

/** Where a ray meets a plane (null when parallel or behind the camera). */
export function intersectPlane(ray: { origin: Vec3; dir: Vec3 }, point: Vec3, normal: Vec3): Vec3 | null {
  const denom = dot(ray.dir, normal);
  if (Math.abs(denom) < 1e-9) return null;
  const t = dot(sub(point, ray.origin), normal) / denom;
  if (t < 0) return null;
  return add(ray.origin, scale(ray.dir, t));
}

/** Bounds of the selection: one entity keeps its rotation; several get an axis-aligned box. */
export function selectionBox(scene: SceneModel, ids: string[]): OBB | null {
  const boxes = ids.map((id) => scene.entities.get(id)?.bounds).filter((b): b is OBB => !!b);
  if (!boxes.length) return null;
  if (boxes.length === 1) return boxes[0]!;
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const b of boxes) {
    const r = Math.abs(Math.cos((b.rotation * Math.PI) / 180)) > 0.5;
    const hx = r ? b.half.x : b.half.z;
    const hz = r ? b.half.z : b.half.x;
    min.x = Math.min(min.x, b.center.x - hx);
    max.x = Math.max(max.x, b.center.x + hx);
    min.z = Math.min(min.z, b.center.z - hz);
    max.z = Math.max(max.z, b.center.z + hz);
    min.y = Math.min(min.y, b.center.y - b.half.y);
    max.y = Math.max(max.y, b.center.y + b.half.y);
  }
  return {
    center: { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 },
    half: { x: (max.x - min.x) / 2, y: (max.y - min.y) / 2, z: (max.z - min.z) / 2 },
    rotation: 0,
  };
}

/** Snap threshold in mm equivalent to ~8 screen px at a point. */
export function pxToMm(view: ViewPort, at: Vec3, px = 8): number {
  const a = view.toScreen(at);
  const b = view.toScreen({ x: at.x + 100, y: at.y, z: at.z });
  const perMm = Math.hypot(b.x - a.x, b.y - a.y) / 100;
  return Math.max(3, Math.min(200, px / Math.max(perMm, 1e-6)));
}

/** Which item, front or column a part id belongs to ("u1/item:i3/box-left" → item i3). */
export function innerOf(partId: string, design: Design): Inner | null {
  const [entity, scope] = partId.split('/');
  if (!entity || !scope) return null;
  if (scope.startsWith('item:')) return { entity, kind: 'item', id: scope.slice(5) };
  if (scope.startsWith('front:')) return { entity, kind: 'front', id: scope.slice(6) };
  const e = design.entities[entity];
  void e;
  return null;
}

/** Room point → entity-local point (inverse of the entity placement). */
export function toLocal(p: Vec3, placement: { position: Vec3; rotation: number }): Vec3 {
  const r = rotateXZ(
    { x: p.x - placement.position.x, z: p.z - placement.position.z },
    { x: 0, z: 0 },
    -placement.rotation,
  );
  return { x: r.x, y: p.y - placement.position.y, z: r.z };
}

/** Entity-local point → room point. */
export function toWorld(p: Vec3, placement: { position: Vec3; rotation: number }): Vec3 {
  const r = rotateXZ({ x: p.x, z: p.z }, { x: 0, z: 0 }, placement.rotation);
  return { x: placement.position.x + r.x, y: placement.position.y + p.y, z: placement.position.z + r.z };
}

/** Unit vector of an entity's local axis in room coordinates. */
export function worldAxis(axis: 'x' | 'y' | 'z', rotation: number): Vec3 {
  if (axis === 'y') return { x: 0, y: 1, z: 0 };
  const v = rotateXZ(axis === 'x' ? { x: 1, z: 0 } : { x: 0, z: 1 }, { x: 0, z: 0 }, rotation);
  return { x: v.x, y: 0, z: v.z };
}
