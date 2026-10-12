export type Vec3 = { x: number; y: number; z: number };

export type PanelRole = 'carcass' | 'back' | 'door' | 'drawer' | 'rail';

/** Axis-aligned box in the object's local frame, mm. pos = box center. */
export interface Panel {
  name: string;
  role: PanelRole;
  pos: Vec3;
  size: Vec3; // x = width, y = height, z = depth
  shape?: 'box' | 'cylinder'; // cylinder = rail along X
}

export interface ParamDef {
  key: string;
  label: string;
  default: number;
  min: number;
  max: number;
  step?: number;
}

export interface TemplateDef {
  id: string;
  name: string;
  category: string;
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

export type FloorKind = 'color' | 'wood' | 'tiles' | 'concrete';

export interface Room {
  points: { x: number; z: number }[]; // floor polygon, mm
  height: number;
  wallThickness: number;
  floorKind: FloorKind;
  floorColor: string;
  wallColor: string;
}

export interface Design {
  version: 1;
  room: Room;
  objects: SceneObject[];
}
