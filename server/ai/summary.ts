import { obbAabb, roomWalls, type Design, type SceneModel } from '../../src/core';

const r = (v: number) => Math.round(v);

/** The design as compact JSON for the model: ids, sizes, world bounds and unit structure — not the parts. */
export function designSummary(design: Design, scene: SceneModel): string {
  const room = design.room;
  return JSON.stringify({
    name: design.name,
    room: {
      height: room.height,
      corners: room.corners.map((c) => [r(c.x), r(c.z)]),
      walls: roomWalls(room).map((w) => ({ key: w.key, index: w.index, length: r(w.length), thickness: w.thickness })),
      openings: room.openings.map((o) => ({
        id: o.id,
        wall: o.wall,
        kind: o.kind,
        offset: o.offset,
        width: o.width,
        height: o.height,
        sill: o.sill,
      })),
      obstacles: room.obstacles.map((o) => ({ id: o.id, kind: o.kind, min: o.min, max: o.max })),
      floor: room.floor,
    },
    materials: Object.fromEntries(
      Object.entries(design.materials).map(([id, m]) => [
        id,
        `${m.name} (${m.kind}${m.kind === 'board' ? `, ${m.thicknesses.join('/')} mm` : ''})`,
      ]),
    ),
    defaults: design.defaults,
    groups: Object.values(design.groups).map((g) => ({ id: g.id, members: g.members })),
    entities: design.order.map((id) => {
      const e = design.entities[id]!;
      const b = scene.entities.get(id)?.bounds;
      const box = b ? obbAabb(b) : null;
      const common = {
        id,
        kind: e.kind,
        name: e.name,
        position: [r(e.position.x), r(e.position.y), r(e.position.z)],
        rotation: e.rotation,
        ...(e.locked ? { locked: true } : {}),
        ...(box
          ? {
              bounds: {
                min: [r(box.min.x), r(box.min.y), r(box.min.z)],
                max: [r(box.max.x), r(box.max.y), r(box.max.z)],
              },
            }
          : {}),
      };
      if (e.kind === 'opaque') return { ...common, unreadable: e.reason };
      if (e.kind === 'part')
        return {
          ...common,
          template: e.template.id,
          params: e.params,
          ...(e.material ? { material: e.material } : {}),
        };
      return {
        ...common,
        template: e.template.id,
        size: [e.size.w, e.size.h, e.size.d],
        params: e.params,
        materials: e.materials,
        columns: e.columns.map((c) => ({
          id: c.id,
          width: c.width,
          items: c.items.map((i) => ({ id: i.id, template: i.template.id, y: i.y, params: i.params })),
        })),
        fronts: e.fronts.map((f) => ({
          id: f.id,
          template: f.template.id,
          columns: f.columns,
          y: f.y,
          params: f.params,
          ...(f.item ? { item: f.item } : {}),
        })),
      };
    }),
  });
}
