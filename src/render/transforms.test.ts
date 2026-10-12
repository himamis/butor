import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { movePoint, explodeOffset, type Motion, type Part } from '../core';
import { partMatrix } from './transforms';

const part = (motion?: Motion, shape: Part['shape'] = { kind: 'box' }): Part => ({
  id: 'e/p',
  entity: 'e',
  key: 'p',
  label: 'P',
  role: 'front',
  shape,
  center: { x: 100, y: 1000, z: 300 },
  size: { x: 400, y: 2000, z: 18 },
  material: { id: 'white', thickness: 18 },
  ...(motion ? { motion } : {}),
});
const placement = { position: { x: 1000, y: 0, z: 500 }, rotation: 90 };
const entitySize = { x: 800, y: 2200, z: 600 };

/** World position of a local point of the part, the way core reasons about it. */
function expected(local: { x: number; y: number; z: number }, p: Part, t: number, explode: number) {
  const moved = p.motion ? movePoint(local, p.motion, t) : local;
  const ex = explodeOffset(p.center, entitySize, explode);
  const q = { x: moved.x + ex.x, y: moved.y + ex.y, z: moved.z + ex.z };
  const v = new THREE.Vector3(q.x, q.y, q.z).applyAxisAngle(
    new THREE.Vector3(0, 1, 0),
    (placement.rotation * Math.PI) / 180,
  );
  return v.add(new THREE.Vector3(placement.position.x, placement.position.y, placement.position.z));
}

/** A corner of the unit cube mapped through the part matrix. */
function corner(m: THREE.Matrix4, sx: number, sy: number, sz: number) {
  return new THREE.Vector3(sx / 2, sy / 2, sz / 2).applyMatrix4(m);
}

describe('partMatrix', () => {
  const cases: [string, Motion | undefined][] = [
    ['static', undefined],
    ['left door', { id: 'm', kind: 'hinge', axis: 'y', pivot: { x: -100, y: 0, z: 291 }, angle: -95 }],
    ['flap', { id: 'm', kind: 'hinge', axis: 'x', pivot: { x: 0, y: 2000, z: 291 }, angle: -100 }],
    ['drawer', { id: 'm', kind: 'slide', offset: { x: 0, y: 0, z: 400 } }],
  ];
  for (const [name, motion] of cases) {
    it(`${name}: matches core movePoint + explode for every corner`, () => {
      const p = part(motion);
      for (const t of [0, 0.4, 1]) {
        for (const explode of [0, 0.7]) {
          const m = partMatrix(p, placement, entitySize, t, explode, { x: 0, y: 0, z: 0 });
          for (const s of [
            [-1, -1, -1],
            [1, 1, 1],
            [1, -1, 1],
          ] as const) {
            const local = {
              x: p.center.x + (s[0] * p.size.x) / 2,
              y: p.center.y + (s[1] * p.size.y) / 2,
              z: p.center.z + (s[2] * p.size.z) / 2,
            };
            const got = corner(m, s[0], s[1], s[2]);
            const want = expected(local, p, t, explode);
            expect(got.distanceTo(want)).toBeLessThan(1e-6);
          }
        }
      }
    });
  }

  it('cylinders along x are scaled to length and diameter', () => {
    const p: Part = { ...part(undefined, { kind: 'cylinder', axis: 'x' }), size: { x: 760, y: 25, z: 25 } };
    const m = partMatrix(p, { position: { x: 0, y: 0, z: 0 }, rotation: 0 }, entitySize, 0, 0, { x: 0, y: 0, z: 0 });
    // the unit cylinder's axis (y, length 1) maps onto x with length 760
    const a = new THREE.Vector3(0, 0.5, 0).applyMatrix4(m);
    const b = new THREE.Vector3(0, -0.5, 0).applyMatrix4(m);
    expect(Math.abs(a.x - b.x)).toBeCloseTo(760);
    expect(a.y).toBeCloseTo(b.y);
  });

  it('spread moves the whole entity in world space', () => {
    const p = part();
    const a = new THREE.Vector3().applyMatrix4(partMatrix(p, placement, entitySize, 0, 0, { x: 0, y: 0, z: 0 }));
    const b = new THREE.Vector3().applyMatrix4(partMatrix(p, placement, entitySize, 0, 0, { x: 120, y: 0, z: -40 }));
    expect(b.x - a.x).toBeCloseTo(120);
    expect(b.z - a.z).toBeCloseTo(-40);
  });
});
