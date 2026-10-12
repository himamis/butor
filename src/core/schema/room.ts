import { z } from 'zod';
import { Hex, Id, Mm, PositiveMm, Vec3 } from './primitives';

export const Corner = z.object({ id: Id, x: Mm, z: Mm });
export type Corner = z.infer<typeof Corner>;

/** Key of the wall from corner `a` to the next corner `b`. */
export const wallKey = (a: string, b: string) => `${a}>${b}`;

export const Wall = z.object({ thickness: z.number().min(10).max(1000), color: Hex.optional() });
export type Wall = z.infer<typeof Wall>;

export const Opening = z.object({
  id: Id,
  wall: z.string(),
  kind: z.enum(['door', 'window', 'passage']),
  offset: z.number().min(0).max(100_000), // from the wall's first corner, mm
  width: PositiveMm,
  height: PositiveMm,
  sill: z.number().min(0).max(10_000),
  swing: z.object({ side: z.enum(['left', 'right']), inward: z.boolean() }).optional(),
});
export type Opening = z.infer<typeof Opening>;

export const Obstacle = z.object({
  id: Id,
  kind: z.enum(['column', 'beam', 'radiator', 'skirting', 'box']),
  min: Vec3,
  max: Vec3,
  label: z.string().max(200).optional(),
});
export type Obstacle = z.infer<typeof Obstacle>;

export const FloorFinish = z.enum(['color', 'planks', 'chevron', 'herringbone', 'tiles', 'concrete']);
export type FloorFinish = z.infer<typeof FloorFinish>;

export const Room = z.object({
  corners: z.array(Corner).min(3).max(200),
  height: z.number().min(1500).max(10_000),
  walls: z.record(z.string(), Wall),
  openings: z.array(Opening),
  obstacles: z.array(Obstacle),
  floor: z.object({ finish: FloorFinish, color: Hex, rotation: z.union([z.literal(0), z.literal(90)]) }),
  wallColor: Hex,
});
export type Room = z.infer<typeof Room>;
