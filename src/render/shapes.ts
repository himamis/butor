import * as THREE from 'three';
import type { Part } from '../core';

/** Geometry for a front with a grip cutout: its outline (with holes) extruded to its thickness, centred. */
export function frontOutlineShape(p: Part): THREE.BufferGeometry {
  if (p.shape.kind !== 'extrusion') throw new Error('not an extrusion');
  const shape = new THREE.Shape(p.shape.outline.map((q) => new THREE.Vector2(q.x, q.y)));
  shape.holes = p.shape.holes.map((h) => new THREE.Path(h.map((q) => new THREE.Vector2(q.x, q.y))));
  const g = new THREE.ExtrudeGeometry(shape, { depth: p.size.z, bevelEnabled: false });
  g.translate(0, 0, -p.size.z / 2);
  return g;
}
