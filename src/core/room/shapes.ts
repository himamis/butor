import { wallKey, type Room } from '../schema/room';

export type RoomShape = 'rectangle' | 'l-shape' | 'cut-corner';
export const ROOM_SHAPES: { id: RoomShape; name: string }[] = [
  { id: 'rectangle', name: 'Rectangle' },
  { id: 'l-shape', name: 'L-shape' },
  { id: 'cut-corner', name: 'Cut corner' },
];

/** Floor polygon of a preset shape, `w` × `d` mm overall, in the same winding as the default room. */
export function shapeCorners(shape: RoomShape, w: number, d: number): { x: number; z: number }[] {
  const r = (v: number) => Math.round(v / 10) * 10;
  if (shape === 'l-shape') {
    const hx = r(w / 2),
      hz = r(d / 2);
    return [
      { x: 0, z: 0 },
      { x: w, z: 0 },
      { x: w, z: hz },
      { x: hx, z: hz },
      { x: hx, z: d },
      { x: 0, z: d },
    ];
  }
  if (shape === 'cut-corner') {
    const c = r(Math.min(w, d) / 4);
    return [
      { x: 0, z: 0 },
      { x: w, z: 0 },
      { x: w, z: d - c },
      { x: w - c, z: d },
      { x: 0, z: d },
    ];
  }
  return [
    { x: 0, z: 0 },
    { x: w, z: 0 },
    { x: w, z: d },
    { x: 0, z: d },
  ];
}

/**
 * The room with a new floor polygon. Height, finishes and obstacles stay; every wall takes the most common
 * current thickness; openings are dropped (their walls no longer exist) and counted in `droppedOpenings`.
 */
export function reshapeRoom(room: Room, pts: { x: number; z: number }[], newId: () => string) {
  const counts = new Map<number, number>();
  for (const w of Object.values(room.walls)) counts.set(w.thickness, (counts.get(w.thickness) ?? 0) + 1);
  const thickness = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 100;
  const corners = pts.map((p) => ({ id: newId(), x: p.x, z: p.z }));
  const walls = Object.fromEntries(
    corners.map((c, i) => [wallKey(c.id, corners[(i + 1) % corners.length]!.id), { thickness }]),
  );
  return { room: { ...room, corners, walls, openings: [] } satisfies Room, droppedOpenings: room.openings.length };
}

/** Overall size of the floor polygon. */
export function roomExtent(room: Room): { w: number; d: number } {
  const xs = room.corners.map((c) => c.x);
  const zs = room.corners.map((c) => c.z);
  return { w: Math.max(...xs) - Math.min(...xs), d: Math.max(...zs) - Math.min(...zs) };
}

export interface WallInfo {
  key: string;
  index: number; // 1-based, for labels
  a: { x: number; z: number };
  b: { x: number; z: number };
  length: number;
  thickness: number;
  inward: { x: number; z: number }; // unit normal pointing into the room
}

/** The walls in corner order with their lengths and inward normals. */
export function roomWalls(room: Room): WallInfo[] {
  const cs = room.corners;
  return cs.map((a, i) => {
    const b = cs[(i + 1) % cs.length]!;
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const key = wallKey(a.id, b.id);
    return {
      key,
      index: i + 1,
      a: { x: a.x, z: a.z },
      b: { x: b.x, z: b.z },
      length,
      thickness: room.walls[key]?.thickness ?? 100,
      inward: { x: -(b.z - a.z) / (length || 1), z: (b.x - a.x) / (length || 1) },
    };
  });
}
