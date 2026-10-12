export type Vec3 = { x: number; y: number; z: number };

export type PanelRole = 'carcass' | 'back' | 'door' | 'drawer' | 'rail' | 'handle' | 'hardware'; // handle/hardware: bought metal parts, not cut from board

/** How a group of panels moves when opened. Panels sharing `id` move together. */
export type Motion =
  | { id: string; kind: 'hinge'; pivot: { x: number; z: number }; angle: number } // deg about +Y at full open
  | { id: string; kind: 'slide'; offset: Vec3 }; // mm at full open

/** Opening through a front, in the panel's front-face coords relative to its center (mm). */
export interface Cutout {
  kind: 'hole' | 'notch'; // notch = cut into the top edge
  cx: number;
  cy: number;
  w: number;
  h: number;
}

/** Axis-aligned box in the object's local frame, mm. pos = box center. */
export interface Panel {
  name: string;
  role: PanelRole;
  pos: Vec3;
  size: Vec3; // x = width, y = height, z = depth
  shape?: 'box' | 'cylinder' | 'knob'; // cylinder = rail along X, knob = cylinder along Z
  motion?: Motion;
  cutout?: Cutout;
  hardware?: string; // name to count in the hardware list (one per item, even if the item has several panels)
}

export interface ParamDef {
  key: string;
  label: string;
  default: number;
  min: number;
  max: number;
  step?: number;
  options?: { value: number; label: string }[]; // rendered as a select
}

export type Category = 'Wardrobes' | 'Cabinets' | 'Fronts' | 'Interior' | 'Panels' | 'Base & trim';

export interface TemplateDef {
  id: string;
  name: string;
  category: Category;
  description: string; // one line, shown in the library and searchable
  tags?: string[]; // extra search words (synonyms)
  params: ParamDef[]; // must include width, height, depth
  build(p: Record<string, number>): Panel[];
}

/** Object local frame: x ∈ [-w/2, w/2], y ∈ [0, h], z ∈ [-d/2, d/2].
 *  position = bottom-center in room coords, mm. */
export interface SceneObject {
  id: string;
  templateId: string;
  name: string;
  params: Record<string, number>;
  position: Vec3;
  rotationY: number; // degrees
  color: string;
  doorColor?: string; // overrides color for door roles
  groupId?: string;
  locked?: boolean;
}

/** Floor-to-ceiling column (e.g. a structural pillar in a corner). Center x/z, size w × d, in mm. */
export interface Column {
  id: string;
  x: number;
  z: number;
  w: number;
  d: number;
}

export type FloorKind = 'color' | 'wood' | 'chevron' | 'tiles' | 'concrete';

export interface Room {
  points: { x: number; z: number }[]; // floor polygon, mm
  height: number;
  wallThickness: number;
  floorKind: FloorKind;
  floorColor: string;
  wallColor: string;
  columns: Column[];
}

export interface Design {
  version: 1;
  room: Room;
  objects: SceneObject[];
}
