import type { SceneModel } from '../geometry/scene';
import type { Design } from '../schema/design';
import type { SnapBox, SnapContext, SnapWall } from '.';

/** Snap targets for a design: every other entity's bounds, obstacles, and the room's inner wall faces. */
export function snapContext(
  design: Design,
  scene: SceneModel,
  exclude: Iterable<string>,
  grid: number,
  threshold: number,
): SnapContext {
  const skip = new Set(exclude);
  const boxes: SnapBox[] = [];
  for (const e of scene.entities.values()) if (!skip.has(e.id)) boxes.push({ id: e.id, obb: e.bounds });
  for (const o of design.room.obstacles) {
    boxes.push({
      id: `obstacle:${o.id}`,
      obb: {
        center: { x: (o.min.x + o.max.x) / 2, y: (o.min.y + o.max.y) / 2, z: (o.min.z + o.max.z) / 2 },
        half: { x: (o.max.x - o.min.x) / 2, y: (o.max.y - o.min.y) / 2, z: (o.max.z - o.min.z) / 2 },
        rotation: 0,
      },
    });
  }
  const cs = design.room.corners;
  const walls: SnapWall[] = cs.map((a, i) => ({
    a: { x: a.x, z: a.z },
    b: { x: cs[(i + 1) % cs.length]!.x, z: cs[(i + 1) % cs.length]!.z },
  }));
  return { boxes, walls, ceiling: design.room.height, grid, threshold };
}
