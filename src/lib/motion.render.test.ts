import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { partTransform } from './motion';
import { getTemplate, defaultParams } from '../templates';

/** Builds the same outer/inner group hierarchy the renderer uses and returns a point's world position (mm). */
function rendered(t: number, explode: { x: number; y: number; z: number }, local: { x: number; y: number; z: number }, motion: Parameters<typeof partTransform>[0]) {
  const outer = new THREE.Group();
  const inner = new THREE.Group();
  outer.add(inner);
  const tr = partTransform(motion, t, explode);
  outer.position.set(tr.outer.x / 1000, tr.outer.y / 1000, tr.outer.z / 1000);
  outer.rotation.y = tr.rotationY;
  inner.position.set(tr.inner.x / 1000, tr.inner.y / 1000, tr.inner.z / 1000);
  outer.updateMatrixWorld(true);
  const v = inner.localToWorld(new THREE.Vector3(local.x / 1000, local.y / 1000, local.z / 1000));
  return { x: v.x * 1000, y: v.y * 1000, z: v.z * 1000 };
}

const zero = { x: 0, y: 0, z: 0 };

describe('partTransform (as rendered by three.js)', () => {
  it.each([0, 1])('door hinge=%i: the free edge swings outward to +z', (hinge) => {
    const t = getTemplate('door');
    const [front] = t.build({ ...defaultParams(t), hinge });
    const freeX = hinge === 0 ? front.pos.x + front.size.x / 2 : front.pos.x - front.size.x / 2;
    const p = rendered(1, zero, { x: freeX, y: 0, z: front.pos.z }, front.motion);
    expect(p.z).toBeGreaterThan(front.pos.z + 300);
  });

  it('closed and unexploded is exactly the original position', () => {
    const t = getTemplate('door');
    const [front] = t.build(defaultParams(t));
    const p = rendered(0, zero, { x: 123, y: 456, z: 7 }, front.motion);
    expect(p.x).toBeCloseTo(123, 9);
    expect(p.y).toBeCloseTo(456, 9);
    expect(p.z).toBeCloseTo(7, 9);
  });

  it('drawer slides forward; explode offset adds on top', () => {
    const t = getTemplate('drawer');
    const [front] = t.build(defaultParams(t));
    const p = rendered(1, { x: 0, y: 0, z: 100 }, { x: 0, y: 0, z: 0 }, front.motion);
    expect(p.z).toBeCloseTo((500 - 16) * 0.85 + 100);
  });

  it('static panels only move by the explode offset', () => {
    expect(rendered(1, { x: 5, y: 6, z: 7 }, { x: 1, y: 1, z: 1 }, undefined)).toMatchObject({ x: 6, y: 7, z: 8 });
  });
});
