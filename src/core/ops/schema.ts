import { z } from 'zod';
import { Entity, Group } from '../schema/entities';
import { MaterialLibrary, Material } from '../schema/materials';
import { Hex, Id, Mm, Name, Params, PositiveMm, Vec3 } from '../schema/primitives';
import { FloorFinish, Room } from '../schema/room';

/**
 * Operations (docs/v2/05-operations.md). Strict objects: unknown keys are rejected, which turns typos
 * (from code or from an AI model) into clear errors instead of silent no-ops.
 */
const op = <T extends string, S extends z.ZodRawShape>(type: T, shape: S) =>
  z.strictObject({ type: z.literal(type), ...shape });

const Ids = z.array(Id).min(1).max(2000);
const RefInput = z.strictObject({ id: z.string().min(1) });
const XZ = z.strictObject({ x: Mm, z: Mm });
const Position = z.strictObject({ x: Mm, y: Mm.optional(), z: Mm });

const ItemInput = z.strictObject({
  id: Id.optional(),
  template: RefInput,
  y: z.number().min(0),
  params: Params.optional(),
  material: z.string().optional(),
});
const ColumnInput = z.strictObject({
  id: Id.optional(),
  width: z.union([PositiveMm, z.literal('auto')]).default('auto'),
  items: z.array(ItemInput).default([]),
});
const FrontInput = z.strictObject({
  id: Id.optional(),
  template: RefInput,
  columns: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
  y: z.tuple([z.number().min(0), z.number().min(0)]),
  params: Params.optional(),
  item: Id.optional(), // the item an attaching front moves with: an item in the same input, or an existing one
  material: z.string().optional(),
});
const placement = {
  id: Id.optional(),
  position: Position,
  rotation: z.number().optional(),
  locked: z.boolean().optional(),
  name: Name.optional(),
};

export const UnitInput = z.strictObject({
  kind: z.literal('unit'),
  ...placement,
  template: RefInput,
  params: Params.optional(),
  size: z.strictObject({ w: PositiveMm.optional(), h: PositiveMm.optional(), d: PositiveMm.optional() }).optional(),
  materials: z
    .strictObject({
      carcass: z.string().optional(),
      back: z.string().optional(),
      interior: z.string().optional(),
      front: z.string().optional(),
    })
    .optional(),
  columns: z.array(ColumnInput).min(1).max(20).optional(),
  fronts: z.array(FrontInput).optional(),
});
export const PartInput = z.strictObject({
  kind: z.literal('part'),
  ...placement,
  template: RefInput,
  params: Params.optional(),
  material: z.string().optional(),
});
export const EntityInput = z.discriminatedUnion('kind', [UnitInput, PartInput]);
export type EntityInput = z.input<typeof EntityInput>;

const Anchor = z.enum(['min', 'center', 'max']);

const OpeningInput = z.strictObject({
  id: Id.optional(),
  wall: z.string(),
  kind: z.enum(['door', 'window', 'passage']),
  offset: z.number().min(0),
  width: PositiveMm,
  height: PositiveMm,
  sill: z.number().min(0).default(0),
  swing: z.strictObject({ side: z.enum(['left', 'right']), inward: z.boolean() }).optional(),
});
const ObstacleInput = z.strictObject({
  id: Id.optional(),
  kind: z.enum(['column', 'beam', 'radiator', 'skirting', 'box']),
  min: Vec3,
  max: Vec3,
  label: z.string().max(200).optional(),
});

/** Operations available to the UI and the AI. */
export const PublicOp = z.discriminatedUnion('type', [
  op('entity.add', { entity: EntityInput }),
  op('entity.remove', { ids: Ids }),
  op('entity.move', { ids: Ids, delta: Vec3 }),
  op('entity.rotate', { ids: Ids, degrees: z.number().min(-3600).max(3600), pivot: XZ.optional() }),
  op('entity.update', {
    id: Id,
    name: Name.optional(),
    locked: z.boolean().optional(),
    params: Params.optional(),
    materials: z
      .strictObject({
        carcass: z.string().optional(),
        back: z.string().optional(),
        interior: z.string().optional(),
        front: z.string().optional(),
      })
      .optional(),
    material: z.string().optional(),
  }),
  op('unit.resize', {
    id: Id,
    size: z.strictObject({ w: PositiveMm.optional(), h: PositiveMm.optional(), d: PositiveMm.optional() }),
    anchor: z.strictObject({ x: Anchor.optional(), z: Anchor.optional() }).optional(),
  }),
  op('unit.column.add', {
    unit: Id,
    at: z.number().int().min(0),
    width: z.union([PositiveMm, z.literal('auto')]).default('auto'),
    id: Id.optional(),
  }),
  op('unit.column.remove', { unit: Id, column: Id }),
  op('unit.column.update', { unit: Id, column: Id, width: z.union([PositiveMm, z.literal('auto')]) }),
  op('unit.column.move', { unit: Id, column: Id, to: z.number().int().min(0) }),
  op('unit.item.add', {
    unit: Id,
    column: Id,
    template: RefInput,
    y: z.number().min(0),
    params: Params.optional(),
    id: Id.optional(),
    material: z.string().optional(),
  }),
  op('unit.item.update', {
    unit: Id,
    item: Id,
    y: z.number().min(0).optional(),
    params: Params.optional(),
    material: z.string().optional(),
  }),
  op('unit.item.remove', { unit: Id, item: Id }),
  op('unit.item.move', { unit: Id, item: Id, column: Id, y: z.number().min(0) }),
  op('unit.front.add', {
    unit: Id,
    template: RefInput,
    columns: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
    y: z.tuple([z.number().min(0), z.number().min(0)]),
    params: Params.optional(),
    item: Id.optional(),
    id: Id.optional(),
    material: z.string().optional(),
  }),
  op('unit.front.update', {
    unit: Id,
    front: Id,
    columns: z.tuple([z.number().int().min(0), z.number().int().min(0)]).optional(),
    y: z.tuple([z.number().min(0), z.number().min(0)]).optional(),
    params: Params.optional(),
    material: z.string().optional(),
  }),
  op('unit.front.remove', { unit: Id, front: Id }),
  op('group.create', { members: Ids, name: Name.optional(), id: Id.optional() }),
  op('group.dissolve', { id: Id }),
  op('room.update', {
    height: z.number().min(1500).max(10_000).optional(),
    floor: z
      .strictObject({
        finish: FloorFinish.optional(),
        color: Hex.optional(),
        rotation: z.union([z.literal(0), z.literal(90)]).optional(),
      })
      .optional(),
    wallColor: Hex.optional(),
  }),
  op('room.corner.move', { id: Id, to: XZ }),
  op('room.corner.insert', { after: Id, at: XZ, id: Id.optional() }),
  op('room.corner.remove', { id: Id }),
  op('room.wall.update', {
    key: z.string(),
    thickness: z.number().min(10).max(1000).optional(),
    color: Hex.optional(),
  }),
  op('room.opening.add', { opening: OpeningInput }),
  op('room.opening.update', { id: Id, patch: OpeningInput.omit({ id: true }).partial() }),
  op('room.opening.remove', { id: Id }),
  op('room.obstacle.add', { obstacle: ObstacleInput }),
  op('room.obstacle.update', { id: Id, patch: ObstacleInput.omit({ id: true }).partial() }),
  op('room.obstacle.remove', { id: Id }),
  op('material.add', { id: Id, material: Material }),
  op('material.update', { id: Id, material: Material }),
  op('design.rename', { name: Name }),
]);

/** Restore operations used for inverses (exact snapshots). Not offered to the AI. */
export const InternalOp = z.discriminatedUnion('type', [
  op('entity.put', { entity: Entity, index: z.number().int().min(0).optional() }),
  op('entity.delete', { ids: Ids }),
  op('room.put', { room: Room }),
  op('groups.put', { groups: z.record(z.string(), Group) }),
  op('materials.put', { materials: MaterialLibrary }),
]);

export const Op = z.union([PublicOp, InternalOp]);
export type PublicOp = z.infer<typeof PublicOp>;
export type InternalOp = z.infer<typeof InternalOp>;
export type Op = z.input<typeof PublicOp> | z.input<typeof InternalOp>;
export type ParsedOp = PublicOp | InternalOp;

export interface OpResult {
  ok: boolean;
  message: string;
  created?: string[];
  notes?: string[];
}
