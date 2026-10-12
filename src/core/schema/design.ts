import { z } from 'zod';
import { Entity, Group } from './entities';
import { MaterialLibrary } from './materials';
import { Id, Name } from './primitives';
import { Room } from './room';

export const SCHEMA_VERSION = 1;
export const MAX_ENTITIES = 2000;

export const Design = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: Id,
  name: Name,
  revision: z.number().int().min(0),
  room: Room,
  entities: z.record(z.string(), Entity),
  order: z.array(Id).max(MAX_ENTITIES),
  groups: z.record(z.string(), Group),
  materials: MaterialLibrary,
  defaults: z.object({
    carcass: z.string(),
    front: z.string(),
    back: z.string(),
    interior: z.string(),
    handle: z.string(),
  }),
  meta: z.object({ createdAt: z.string(), updatedAt: z.string(), app: z.string() }),
});
export type Design = z.infer<typeof Design>;
