import * as THREE from 'three';
import type { OBB } from '../core';

/**
 * Interaction overlays drawn on top of the scene (no depth test): resize handles on the faces of the
 * selected unit, a rotate ring under the selection, snap guides and a drop-target highlight.
 */
export interface HandleSpec {
  id: string; // e.g. "x+" = right face
  position: { x: number; y: number; z: number };
}

export interface GuideSpec {
  from: { x: number; y: number; z: number };
  to: { x: number; y: number; z: number };
}

const HANDLE = new THREE.BoxGeometry(60, 60, 60);
const HANDLE_MAT = new THREE.MeshBasicMaterial({
  color: '#2f6fed',
  depthTest: false,
  transparent: true,
  opacity: 0.95,
});
const HANDLE_HOT = new THREE.MeshBasicMaterial({
  color: '#ff8a00',
  depthTest: false,
  transparent: true,
  opacity: 0.95,
});
const RING_MAT = new THREE.MeshBasicMaterial({
  color: '#2f6fed',
  depthTest: false,
  transparent: true,
  opacity: 0.55,
  side: THREE.DoubleSide,
});
const GUIDE_MAT = new THREE.LineBasicMaterial({ color: '#e5484d', depthTest: false });
const TARGET_MAT = new THREE.LineBasicMaterial({ color: '#30a46c', depthTest: false });
const MEASURE_MAT = new THREE.LineBasicMaterial({ color: '#8e4ec6', depthTest: false });
const TICK = 40; // mm, end ticks of a measurement

export class Overlays {
  readonly group = new THREE.Group();
  private handles: THREE.Mesh[] = [];
  private ring: THREE.Mesh | null = null;
  private guides: THREE.LineSegments | null = null;
  private target: THREE.LineSegments | null = null;
  private hot: string | null = null;
  private measures: THREE.LineSegments | null = null;

  constructor() {
    this.group.name = 'overlays';
    this.group.renderOrder = 10;
  }

  /** Face handles and an optional rotate ring (radius in mm) at the bottom centre of `ringAt`. */
  setHandles(handles: HandleSpec[], ring: { center: { x: number; y: number; z: number }; radius: number } | null) {
    for (const h of this.handles) this.group.remove(h);
    this.handles = handles.map((h) => {
      const m = new THREE.Mesh(HANDLE, h.id === this.hot ? HANDLE_HOT : HANDLE_MAT);
      m.position.set(h.position.x, h.position.y, h.position.z);
      m.renderOrder = 20;
      m.userData.handle = h.id;
      this.group.add(m);
      return m;
    });
    if (this.ring) {
      this.group.remove(this.ring);
      this.ring.geometry.dispose();
      this.ring = null;
    }
    if (ring) {
      this.ring = new THREE.Mesh(new THREE.RingGeometry(ring.radius - 25, ring.radius + 25, 64), RING_MAT);
      this.ring.rotation.x = -Math.PI / 2;
      this.ring.position.set(ring.center.x, ring.center.y + 2, ring.center.z);
      this.ring.renderOrder = 19;
      this.ring.userData.handle = 'rotate';
      this.group.add(this.ring);
    }
  }

  setHot(id: string | null) {
    this.hot = id;
    for (const h of this.handles) h.material = h.userData.handle === id ? HANDLE_HOT : HANDLE_MAT;
  }

  setGuides(lines: GuideSpec[]) {
    if (this.guides) {
      this.group.remove(this.guides);
      this.guides.geometry.dispose();
      this.guides = null;
    }
    if (!lines.length) return;
    const pts = lines.flatMap((l) => [
      new THREE.Vector3(l.from.x, l.from.y, l.from.z),
      new THREE.Vector3(l.to.x, l.to.y, l.to.z),
    ]);
    this.guides = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), GUIDE_MAT);
    this.guides.renderOrder = 21;
    this.group.add(this.guides);
  }

  /** Outlines a box (e.g. the unit column a dragged item would drop into). */
  setTarget(box: OBB | null) {
    if (this.target) {
      this.group.remove(this.target);
      this.target.geometry.dispose();
      this.target = null;
    }
    if (!box) return;
    const g = new THREE.EdgesGeometry(new THREE.BoxGeometry(box.half.x * 2, box.half.y * 2, box.half.z * 2));
    this.target = new THREE.LineSegments(g, TARGET_MAT);
    this.target.position.set(box.center.x, box.center.y, box.center.z);
    this.target.rotation.y = (box.rotation * Math.PI) / 180;
    this.target.renderOrder = 21;
    this.group.add(this.target);
  }

  /** Measurement lines with small end ticks across them. */
  setMeasures(lines: GuideSpec[]) {
    if (this.measures) {
      this.group.remove(this.measures);
      this.measures.geometry.dispose();
      this.measures = null;
    }
    if (!lines.length) return;
    const pts: THREE.Vector3[] = [];
    for (const l of lines) {
      const a = new THREE.Vector3(l.from.x, l.from.y, l.from.z);
      const b = new THREE.Vector3(l.to.x, l.to.y, l.to.z);
      pts.push(a, b);
      const dir = b.clone().sub(a);
      if (dir.lengthSq() < 1e-9) continue;
      const side = new THREE.Vector3()
        .crossVectors(
          dir,
          Math.abs(dir.y) > 0.9 * dir.length() ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0),
        )
        .setLength(TICK / 2);
      for (const p of [a, b]) pts.push(p.clone().add(side), p.clone().sub(side));
    }
    this.measures = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), MEASURE_MAT);
    this.measures.renderOrder = 22;
    this.group.add(this.measures);
  }

  pickTargets(): THREE.Object3D[] {
    return [...this.handles, ...(this.ring ? [this.ring] : [])];
  }

  dispose() {
    this.setHandles([], null);
    this.setGuides([]);
    this.setTarget(null);
    this.setMeasures([]);
  }
}
