import { z } from 'zod';
import { Id, Name, Params, PositiveMm, TemplateRef, Vec3 } from './primitives';

const placement = {
  position: Vec3, // bottom-centre in room coordinates, mm
  rotation: z.number().min(-36_000).max(36_000), // degrees about +y
  locked: z.boolean(),
  name: Name,
};

export const Item = z.object({
  id: Id,
  template: TemplateRef,
  y: z.number().min(0).max(10_000), // bottom of the item above the column floor, mm
  params: Params,
  material: z.string().optional(),
});
export type Item = z.infer<typeof Item>;

export const Column = z.object({
  id: Id,
  width: z.union([PositiveMm, z.literal('auto')]), // inner width; 'auto' shares what fixed columns leave
  items: z.array(Item),
});
export type Column = z.infer<typeof Column>;

export const Front = z.object({
  id: Id,
  template: TemplateRef,
  columns: z.tuple([z.number().int().min(0), z.number().int().min(0)]), // inclusive column index range
  y: z.tuple([z.number().min(0), z.number().min(0)]), // [bottom, top] from the unit's bottom edge, mm
  params: Params,
  item: Id.optional(), // fronts that attach to an item (FrontTemplate.attachesToItem): the item they move with
  material: z.string().optional(),
});
export type Front = z.infer<typeof Front>;

const UnitMaterials = z.object({
  carcass: z.string().optional(),
  back: z.string().optional(),
  interior: z.string().optional(),
  front: z.string().optional(),
});

export const Unit = z.object({
  kind: z.literal('unit'),
  id: Id,
  ...placement,
  template: TemplateRef,
  params: Params,
  size: z.object({ w: PositiveMm, h: PositiveMm, d: PositiveMm }),
  materials: UnitMaterials,
  columns: z.array(Column).min(1).max(20),
  fronts: z.array(Front),
});
export type Unit = z.infer<typeof Unit>;

export const FreePart = z.object({
  kind: z.literal('part'),
  id: Id,
  ...placement,
  template: TemplateRef,
  params: Params,
  material: z.string().optional(),
});
export type FreePart = z.infer<typeof FreePart>;

/** An entity the app cannot interpret (unknown or newer template). Kept verbatim and saved back unchanged. */
export const OpaqueEntity = z.object({
  kind: z.literal('opaque'),
  id: Id,
  ...placement,
  raw: z.unknown(),
  reason: z.string().max(500),
  bounds: z.object({ w: PositiveMm, h: PositiveMm, d: PositiveMm }),
});
export type OpaqueEntity = z.infer<typeof OpaqueEntity>;

export const Entity = z.discriminatedUnion('kind', [Unit, FreePart, OpaqueEntity]);
export type Entity = z.infer<typeof Entity>;

export const Group = z.object({ id: Id, members: z.array(Id).min(2), name: Name.optional() });
export type Group = z.infer<typeof Group>;
