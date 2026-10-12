import { obbCorners, type OBB } from '../geometry/obb';
import type { PartRole } from '../geometry/part';
import type { SceneModel } from '../geometry/scene';
import { roomWalls } from '../room/shapes';
import type { Design } from '../schema/design';
import type { Vec3 } from '../schema/primitives';

/** A drawing frame: `u` runs left → right on paper, up is +y, `n` points at the viewer. */
export interface Frame {
  origin: Vec3;
  u: { x: number; z: number };
  n: { x: number; z: number };
}

export interface Rect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  depth: number; // larger = nearer the viewer
  role: PartRole | 'opening' | 'wall';
  entity?: string;
}

export interface Elevation {
  rects: Rect[]; // back to front
  bounds: { x0: number; x1: number; y0: number; y1: number };
}

function corners3(b: OBB): Vec3[] {
  const y0 = b.center.y - b.half.y;
  const y1 = b.center.y + b.half.y;
  return obbCorners(b).flatMap((c) => [
    { x: c.x, y: y0, z: c.z },
    { x: c.x, y: y1, z: c.z },
  ]);
}

/** Projects closed-state parts of `entities` onto the frame (print sheets: SVG, not screenshots). */
export function elevation(scene: SceneModel, entities: string[], f: Frame, extra: Rect[] = []): Elevation {
  const rects: Rect[] = [...extra];
  for (const id of entities) {
    for (const p of scene.entities.get(id)?.parts ?? []) {
      const pts = corners3(p.obb).map((c) => ({
        x: (c.x - f.origin.x) * f.u.x + (c.z - f.origin.z) * f.u.z,
        y: c.y,
      }));
      const xs = pts.map((q) => q.x);
      const ys = pts.map((q) => q.y);
      rects.push({
        x0: Math.min(...xs),
        x1: Math.max(...xs),
        y0: Math.min(...ys),
        y1: Math.max(...ys),
        depth: (p.obb.center.x - f.origin.x) * f.n.x + (p.obb.center.z - f.origin.z) * f.n.z,
        role: p.role,
        entity: id,
      });
    }
  }
  rects.sort((a, b) => a.depth - b.depth);
  const bounds = rects.length
    ? {
        x0: Math.min(...rects.map((r) => r.x0)),
        x1: Math.max(...rects.map((r) => r.x1)),
        y0: Math.min(...rects.map((r) => r.y0)),
        y1: Math.max(...rects.map((r) => r.y1)),
      }
    : { x0: 0, x1: 0, y0: 0, y1: 0 };
  return { rects, bounds };
}

/** The frame looking straight at an entity's front. */
export function entityFrame(e: { position: Vec3; rotation: number }): Frame {
  const a = (e.rotation * Math.PI) / 180;
  // Local +x and +z (the front normal) after rotating by `rotation` degrees about +y.
  const u = { x: Math.cos(a), z: -Math.sin(a) };
  const n = { x: Math.sin(a), z: Math.cos(a) };
  return { origin: e.position, u, n };
}

const AGAINST = 100; // mm: entities whose back is this close to a wall belong to its elevation

/** Each wall seen from inside the room: the entities standing against it and its openings. */
export function wallElevations(
  design: Design,
  scene: SceneModel,
): { key: string; index: number; length: number; elevation: Elevation }[] {
  return roomWalls(design.room).map((w) => {
    const f: Frame = {
      origin: { x: w.a.x, y: 0, z: w.a.z },
      u: { x: (w.b.x - w.a.x) / w.length, z: (w.b.z - w.a.z) / w.length },
      n: w.inward,
    };
    const near = [...scene.entities.values()]
      .filter((se) => {
        const cs = obbCorners(se.bounds);
        const dist = Math.min(...cs.map((c) => (c.x - w.a.x) * w.inward.x + (c.z - w.a.z) * w.inward.z));
        const along = cs.map((c) => (c.x - w.a.x) * f.u.x + (c.z - w.a.z) * f.u.z);
        return dist >= -1 && dist <= AGAINST && Math.max(...along) > 0 && Math.min(...along) < w.length;
      })
      .map((se) => se.id);
    const openings: Rect[] = design.room.openings
      .filter((o) => o.wall === w.key)
      .map((o) => ({
        x0: o.offset,
        x1: o.offset + o.width,
        y0: o.sill,
        y1: o.sill + o.height,
        depth: -1,
        role: 'opening' as const,
      }));
    const wall: Rect = { x0: 0, x1: w.length, y0: 0, y1: design.room.height, depth: -2, role: 'wall' };
    const el = elevation(scene, near, f, [wall, ...openings]);
    return {
      key: w.key,
      index: w.index,
      length: w.length,
      elevation: { rects: el.rects, bounds: { x0: 0, x1: w.length, y0: 0, y1: design.room.height } },
    };
  });
}
