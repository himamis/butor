import { z } from 'zod';

/** Coordinates are bounded to ±100 m (docs/v2/05: limits applied by validation). */
export const MAX_COORD = 100_000;

export const Id = z.string().min(1).max(64);
export type Id = z.infer<typeof Id>;

export const Mm = z.number().min(-MAX_COORD).max(MAX_COORD);
export const PositiveMm = z.number().positive().max(MAX_COORD);

export const Vec3 = z.object({ x: Mm, y: Mm, z: Mm });
export type Vec3 = z.infer<typeof Vec3>;

export const Vec2 = z.object({ x: Mm, y: Mm });
export type Vec2 = z.infer<typeof Vec2>;

export const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'a colour like #c8a06a');
export type Hex = z.infer<typeof Hex>;

export const Name = z.string().max(200);

export const TemplateRef = z.object({ id: z.string().min(1).max(100), version: z.number().int().min(1) });
export type TemplateRef = z.infer<typeof TemplateRef>;

/** Template parameters are validated by the template's own schema (src/core/catalog), not here. */
export const Params = z.record(z.string(), z.unknown());
export type Params = z.infer<typeof Params>;
