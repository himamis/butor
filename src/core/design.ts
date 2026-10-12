import { SCHEMA_VERSION, type Design } from './schema/design';
import type { MaterialLibrary } from './schema/materials';
import { wallKey, type Room } from './schema/room';

export const APP_ID = 'butor/2';

/** A 4000 × 3500 mm room, 2600 mm high, 100 mm walls, wood plank floor. */
export function defaultRoom(newId: () => string): Room {
  const corners = [
    { id: newId(), x: 0, z: 0 },
    { id: newId(), x: 4000, z: 0 },
    { id: newId(), x: 4000, z: 3500 },
    { id: newId(), x: 0, z: 3500 },
  ];
  return {
    corners,
    height: 2600,
    walls: Object.fromEntries(
      corners.map((c, i) => [wallKey(c.id, corners[(i + 1) % corners.length]!.id), { thickness: 100 }]),
    ),
    openings: [],
    obstacles: [],
    floor: { finish: 'planks', color: '#b8895a', rotation: 0 },
    wallColor: '#eceae4',
  };
}

export function createDesign(o: {
  id: string;
  name: string;
  now: string;
  newId: () => string;
  materials: MaterialLibrary;
  defaults: Design['defaults'];
  room?: Room;
}): Design {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: o.id,
    name: o.name,
    revision: 0,
    room: o.room ?? defaultRoom(o.newId),
    entities: {},
    order: [],
    groups: {},
    materials: o.materials,
    defaults: o.defaults,
    meta: { createdAt: o.now, updatedAt: o.now, app: APP_ID },
  };
}
