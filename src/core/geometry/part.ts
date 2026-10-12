import type { Vec3 } from '../schema/primitives';

/**
 * A physical piece produced by the geometry engine (docs/v2/03-data-model.md#derived-parts-not-stored).
 * Parts are axis-aligned boxes (or cylinders/extrusions) in their entity's local frame; the entity's
 * placement adds position and rotation about +y.
 */
export type PartRole =
  | 'carcass'
  | 'back'
  | 'divider'
  | 'shelf'
  | 'front'
  | 'drawer-box'
  | 'rail'
  | 'handle'
  | 'hardware'
  | 'trim'
  | 'invalid';

export type Axis = 'x' | 'y' | 'z';

export type Shape =
  | { kind: 'box' }
  | { kind: 'cylinder'; axis: Axis } // fills the part's size box; radius = min of the two other sizes / 2
  | { kind: 'extrusion'; outline: { x: number; y: number }[]; holes: { x: number; y: number }[][] }; // in the part's x/y plane, centred, extruded along z

export type Motion =
  | { id: string; kind: 'hinge'; axis: 'y' | 'x'; pivot: Vec3; angle: number } // angle in degrees at fully open
  | { id: string; kind: 'slide'; offset: Vec3 };

export interface PartMaterial {
  id: string; // material id in the design library
  thickness?: number; // boards: the board thickness used for this part
}

export interface Banding {
  front?: boolean;
  back?: boolean;
  left?: boolean;
  right?: boolean;
  top?: boolean;
  bottom?: boolean;
}

export interface PartDraft {
  key: string; // unique within the build that produced it, e.g. "side-left"
  label: string; // "Side panel"
  role: PartRole;
  shape: Shape;
  center: Vec3; // entity-local, mm
  size: Vec3; // full extents along local x/y/z, mm
  material: PartMaterial;
  grainAlong?: Axis; // which axis is "length" for the cut list
  banding?: Banding; // edges that get edge banding (named in the part's own frame)
  motion?: Motion;
  hardware?: { name: string; count?: number }; // counted in the hardware list (count defaults to 1)
  invalid?: string;
}

export interface Part extends PartDraft {
  id: string; // `${entityId}/${scope}/${key}` — stable across rebuilds
  entity: string;
}
