import type { Panel, Room, SceneObject, Vec3 } from '../types';
import { getTemplate } from '../templates';

export type Box = { min: Vec3; max: Vec3 };

export function objectSize(o: SceneObject): Vec3 {
  return { x: o.params.width, y: o.params.height, z: o.params.depth };
}

export function panelsOf(o: SceneObject): Panel[] {
  return getTemplate(o.templateId).build(o.params);
}

/** True if the object has doors or drawers that can open. */
export function hasMovingParts(o: SceneObject): boolean {
  return panelsOf(o).some((p) => p.motion);
}

/** Local → room coords (mm), rotating about Y like three.js. */
export function toWorld(o: SceneObject, p: Vec3): Vec3 {
  const a = (o.rotationY * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return {
    x: o.position.x + p.x * c + p.z * s,
    y: o.position.y + p.y,
    z: o.position.z - p.x * s + p.z * c,
  };
}

/** World AABB of a local box (center + size) of object o. Exact for 90° steps. */
function worldBox(o: SceneObject, center: Vec3, size: Vec3): Box {
  const a = (o.rotationY * Math.PI) / 180;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  const half = { x: (c * size.x + s * size.z) / 2, y: size.y / 2, z: (s * size.x + c * size.z) / 2 };
  const w = toWorld(o, center);
  return {
    min: { x: w.x - half.x, y: w.y - half.y, z: w.z - half.z },
    max: { x: w.x + half.x, y: w.y + half.y, z: w.z + half.z },
  };
}

export function worldPanelBoxes(o: SceneObject): { box: Box; panel: Panel }[] {
  return panelsOf(o).map((panel) => ({ panel, box: worldBox(o, panel.pos, panel.size) }));
}

export function objectBox(o: SceneObject): Box {
  const s = objectSize(o);
  return worldBox(o, { x: 0, y: s.y / 2, z: 0 }, s);
}

export function unionBoxes(boxes: Box[]): Box | null {
  if (!boxes.length) return null;
  const min = { ...boxes[0].min };
  const max = { ...boxes[0].max };
  for (const b of boxes) {
    min.x = Math.min(min.x, b.min.x); min.y = Math.min(min.y, b.min.y); min.z = Math.min(min.z, b.min.z);
    max.x = Math.max(max.x, b.max.x); max.y = Math.max(max.y, b.max.y); max.z = Math.max(max.z, b.max.z);
  }
  return { min, max };
}

export function boundsOf(objs: SceneObject[]): Box | null {
  return unionBoxes(objs.map(objectBox));
}

export function columnBoxes(room: Room): Box[] {
  return room.columns.map((c) => ({
    min: { x: c.x - c.w / 2, y: 0, z: c.z - c.d / 2 },
    max: { x: c.x + c.w / 2, y: room.height, z: c.z + c.d / 2 },
  }));
}

const intersects = (a: Box, b: Box, tol: number) =>
  a.min.x < b.max.x - tol && b.min.x < a.max.x - tol &&
  a.min.y < b.max.y - tol && b.min.y < a.max.y - tol &&
  a.min.z < b.max.z - tol && b.min.z < a.max.z - tol;

/** Ids of objects whose panels intersect another object's panels, or a room column, by more than tol (mm). */
export function findOverlaps(objs: SceneObject[], room?: Room, tol = 0.5): Set<string> {
  const out = new Set<string>();
  const data = objs.map((o) => ({ o, box: objectBox(o), panels: worldPanelBoxes(o).map((p) => p.box) }));
  const cols = room ? columnBoxes(room) : [];
  for (const d of data) {
    if (cols.some((c) => intersects(d.box, c, tol) && d.panels.some((p) => intersects(p, c, tol)))) out.add(d.o.id);
  }
  for (let i = 0; i < data.length; i++) {
    for (let j = i + 1; j < data.length; j++) {
      const a = data[i];
      const b = data[j];
      if (!intersects(a.box, b.box, tol)) continue;
      const hit = a.panels.some((pa) => b.panels.some((pb) => intersects(pa, pb, tol)));
      if (hit) {
        out.add(a.o.id);
        out.add(b.o.id);
      }
    }
  }
  return out;
}
