import { z } from 'zod';
import { Hex } from './primitives';

export const Board = z.object({
  kind: z.literal('board'),
  name: z.string().min(1).max(100),
  thicknesses: z.array(z.number().positive().max(100)).min(1),
  appearance: z.object({
    color: Hex,
    texture: z.enum(['plain', 'woodgrain']),
    roughness: z.number().min(0).max(1),
  }),
  grain: z.enum(['none', 'length']),
  price: z.object({ perM2: z.number().min(0), currency: z.string().length(3) }),
  edgeBanding: z.object({ name: z.string().max(100), perM: z.number().min(0) }).optional(),
});
export type Board = z.infer<typeof Board>;

export const Finish = z.object({
  kind: z.literal('finish'),
  name: z.string().min(1).max(100),
  appearance: z.object({ color: Hex, metalness: z.number().min(0).max(1), roughness: z.number().min(0).max(1) }),
});
export type Finish = z.infer<typeof Finish>;

export const Material = z.discriminatedUnion('kind', [Board, Finish]);
export type Material = z.infer<typeof Material>;

export const MaterialLibrary = z.record(z.string(), Material);
export type MaterialLibrary = z.infer<typeof MaterialLibrary>;
