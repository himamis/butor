import { obbAabb } from '../core';
import { useApp } from './store';

type Framer = (min: { x: number; y: number; z: number }, max: { x: number; y: number; z: number }) => void;
let framer: Framer | null = null;

/** The viewport registers how to frame the camera; panels and shortcuts call `frameEntities`. */
export function registerFramer(f: Framer | null) {
  framer = f;
}

/** Frames the camera on entities (or on the whole room when there are none). */
export function frameEntities(ids: string[]) {
  const scene = useApp.getState().scene;
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const id of ids) {
    const b = scene.entities.get(id)?.bounds;
    if (!b) continue;
    const a = obbAabb(b);
    for (const k of ['x', 'y', 'z'] as const) {
      min[k] = Math.min(min[k], a.min[k]);
      max[k] = Math.max(max[k], a.max[k]);
    }
  }
  if (!framer) return;
  if (min.x === Infinity) {
    const room = useApp.getState().design.room;
    const xs = room.corners.map((c) => c.x);
    const zs = room.corners.map((c) => c.z);
    framer(
      { x: Math.min(...xs), y: 0, z: Math.min(...zs) },
      { x: Math.max(...xs), y: room.height, z: Math.max(...zs) },
    );
  } else framer(min, max);
}
