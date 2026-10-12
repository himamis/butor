import * as THREE from 'three';
import { explodeOffset, type Part, type Vec3 } from '../core';

const DEG = Math.PI / 180;
const Y = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);

// Scratch objects (the renderer calls this for every part on animated frames).
const m1 = new THREE.Matrix4();
const m2 = new THREE.Matrix4();
const v = new THREE.Vector3();

/**
 * World matrix for a part drawn from a unit primitive (cube of size 1, or cylinder of radius 0.5 and
 * height 1 along y), all in mm:
 *   T(spread) · T(position) · R_y(rotation) · T(explode) · Motion(t) · T(center) · R(cylinder axis) · S(size)
 * Must agree with core's movePoint/explodeOffset (tested), so what is drawn is what is checked.
 */
export function partMatrix(
  p: Part,
  placement: { position: Vec3; rotation: number },
  entitySize: Vec3,
  t: number,
  explode: number,
  spread: Vec3,
  out = new THREE.Matrix4(),
): THREE.Matrix4 {
  out.makeTranslation(
    spread.x + placement.position.x,
    spread.y + placement.position.y,
    spread.z + placement.position.z,
  );
  out.multiply(m1.makeRotationY(placement.rotation * DEG));
  if (explode !== 0) {
    const e = explodeOffset(p.center, entitySize, explode);
    out.multiply(m1.makeTranslation(e.x, e.y, e.z));
  }
  const m = p.motion;
  if (m && t !== 0) {
    if (m.kind === 'slide') out.multiply(m1.makeTranslation(m.offset.x * t, m.offset.y * t, m.offset.z * t));
    else {
      out.multiply(m1.makeTranslation(m.pivot.x, m.pivot.y, m.pivot.z));
      out.multiply(m1.makeRotationAxis(m.axis === 'y' ? Y : X, m.angle * t * DEG));
      out.multiply(m1.makeTranslation(-m.pivot.x, -m.pivot.y, -m.pivot.z));
    }
  }
  out.multiply(m1.makeTranslation(p.center.x, p.center.y, p.center.z));
  if (p.shape.kind === 'cylinder') {
    const axis = p.shape.axis;
    const length = p.size[axis];
    const others = (['x', 'y', 'z'] as const).filter((a) => a !== axis);
    const diameter = Math.min(p.size[others[0]!], p.size[others[1]!]);
    if (axis === 'x') out.multiply(m1.makeRotationZ(-Math.PI / 2));
    else if (axis === 'z') out.multiply(m1.makeRotationX(Math.PI / 2));
    out.multiply(m2.makeScale(diameter, length, diameter));
  } else if (p.shape.kind === 'box') {
    out.multiply(m2.makeScale(p.size.x, p.size.y, p.size.z));
  }
  // extrusions are built at real size (their geometry is centred), so no scale
  void v;
  return out;
}
