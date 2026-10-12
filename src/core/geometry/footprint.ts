import type { CatalogRegistry } from '../catalog/types';
import type { Entity } from '../schema/entities';

export interface Size3 {
  w: number;
  h: number;
  d: number;
}

/** Overall size of an entity in its local frame (width along x, height along y, depth along z). */
export function entitySize(e: Entity, catalog: CatalogRegistry): Size3 {
  if (e.kind === 'unit') return e.size;
  if (e.kind === 'opaque') return e.bounds;
  const t = catalog.get(e.template.id);
  return t && t.kind === 'part' ? t.size(e.params) : { w: 100, h: 100, d: 100 };
}

/** Axis-aligned footprint (x/z) of an entity in room coordinates, accounting for rotation. */
export function footprint(e: Entity, catalog: CatalogRegistry) {
  const s = entitySize(e, catalog);
  const a = (e.rotation * Math.PI) / 180;
  const c = Math.abs(Math.cos(a));
  const n = Math.abs(Math.sin(a));
  const hx = (c * s.w + n * s.d) / 2;
  const hz = (n * s.w + c * s.d) / 2;
  return { minX: e.position.x - hx, maxX: e.position.x + hx, minZ: e.position.z - hz, maxZ: e.position.z + hz };
}

/** Rotates (x, z) about a pivot by `degrees` about +y, matching three.js Object3D rotation.y. */
export function rotateXZ(p: { x: number; z: number }, pivot: { x: number; z: number }, degrees: number) {
  const a = (degrees * Math.PI) / 180;
  const dx = p.x - pivot.x;
  const dz = p.z - pivot.z;
  return { x: pivot.x + dx * Math.cos(a) + dz * Math.sin(a), z: pivot.z - dx * Math.sin(a) + dz * Math.cos(a) };
}

/** Unit vectors of an entity's local x and z axes in room coordinates. */
export function localAxes(rotation: number) {
  const a = (rotation * Math.PI) / 180;
  return { x: { x: Math.cos(a), z: -Math.sin(a) }, z: { x: Math.sin(a), z: Math.cos(a) } };
}
