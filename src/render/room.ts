import * as THREE from 'three';
import { signedArea, wallKey, type Room } from '../core';
import { floorTexture } from './textures';

/**
 * Floor, walls (with openings cut out) and obstacles. Walls whose outer side faces the camera hide
 * themselves; in an elevation view only the chosen wall shows. Everything fades in explode.
 */
interface WallView {
  key: string;
  group: THREE.Group;
  normal: THREE.Vector3; // into the room
  mid: THREE.Vector3;
}

const FADED = 0.12;

export class RoomView {
  readonly group = new THREE.Group();
  private floor: THREE.Mesh | null = null;
  private walls: WallView[] = [];
  private obstacles: THREE.Object3D[] = [];
  private readonly wallMat = new THREE.MeshStandardMaterial({ roughness: 0.95 });
  private readonly obstacleMat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
  private readonly floorMat = new THREE.MeshStandardMaterial({ roughness: 0.85 });
  private readonly edgeMat = new THREE.LineBasicMaterial({ color: '#a29f98' });
  private fade = 1;
  room: Room | null = null;

  constructor() {
    this.group.name = 'room';
  }

  build(room: Room) {
    this.room = room;
    this.clear();
    this.wallMat.color.set(room.wallColor);
    this.obstacleMat.color.set(room.wallColor).offsetHSL(0, 0, -0.04);

    // Floor: ShapeGeometry lies in x/y; points are (x, −z) so rotating −90° about x lands them on (x, 0, z).
    const shape = new THREE.Shape(room.corners.map((c) => new THREE.Vector2(c.x, -c.z)));
    const fg = new THREE.ShapeGeometry(shape);
    this.floor = new THREE.Mesh(fg, this.floorMat);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    this.floor.userData.kind = 'floor';
    if (room.floor.finish === 'color') {
      this.floorMat.map = null;
      this.floorMat.color.set(room.floor.color);
    } else {
      this.floorMat.map = floorTexture(room.floor.finish, room.floor.color, room.floor.rotation);
      this.floorMat.color.set('#ffffff');
    }
    this.floorMat.needsUpdate = true;
    this.group.add(this.floor);

    // Walls
    const pts = room.corners;
    const n = pts.length;
    const sign = signedArea(pts) > 0 ? 1 : -1;
    const dirs = pts.map((a, i) => {
      const b = pts[(i + 1) % n]!;
      const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      return { x: (b.x - a.x) / len, z: (b.z - a.z) / len, len };
    });
    const convex = (i: number) => {
      const din = dirs[(i - 1 + n) % n]!;
      const dout = dirs[i]!;
      return (din.x * dout.z - din.z * dout.x) * sign > 0;
    };
    pts.forEach((a, i) => {
      const b = pts[(i + 1) % n]!;
      const key = wallKey(a.id, b.id);
      const t = room.walls[key]?.thickness ?? 100;
      const d = dirs[i]!;
      const inward = new THREE.Vector3(-d.z * sign, 0, d.x * sign);
      const outward = inward.clone().negate();
      const extStart = convex(i) ? t : 0;
      const extEnd = convex((i + 1) % n) ? t : 0;
      // Pieces along the wall, in "along" coordinates from corner a: full-height spans and spans around openings.
      const openings = room.openings.filter((o) => o.wall === key).sort((p, q) => p.offset - q.offset);
      const pieces: { from: number; to: number; y0: number; y1: number }[] = [];
      let cursor = -extStart;
      for (const o of openings) {
        if (o.offset > cursor) pieces.push({ from: cursor, to: o.offset, y0: 0, y1: room.height });
        if (o.sill > 0) pieces.push({ from: o.offset, to: o.offset + o.width, y0: 0, y1: o.sill });
        if (o.sill + o.height < room.height)
          pieces.push({ from: o.offset, to: o.offset + o.width, y0: o.sill + o.height, y1: room.height });
        cursor = Math.max(cursor, o.offset + o.width);
      }
      if (d.len + extEnd > cursor) pieces.push({ from: cursor, to: d.len + extEnd, y0: 0, y1: room.height });
      const group = new THREE.Group();
      for (const p of pieces) {
        const len = p.to - p.from;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, p.y1 - p.y0, t), this.wallMat);
        const along = (p.from + p.to) / 2;
        mesh.position.set(
          a.x + d.x * along + (outward.x * t) / 2,
          (p.y0 + p.y1) / 2,
          a.z + d.z * along + (outward.z * t) / 2,
        );
        mesh.rotation.y = Math.atan2(-d.z, d.x);
        mesh.receiveShadow = true;
        mesh.userData.kind = 'wall';
        mesh.userData.wall = key;
        group.add(mesh);
      }
      this.group.add(group);
      this.walls.push({
        key,
        group,
        normal: inward,
        mid: new THREE.Vector3(a.x + (d.x * d.len) / 2, room.height / 2, a.z + (d.z * d.len) / 2),
      });
    });

    for (const o of room.obstacles) {
      const size = new THREE.Vector3(o.max.x - o.min.x, o.max.y - o.min.y, o.max.z - o.min.z);
      const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
      const mesh = new THREE.Mesh(geo, this.obstacleMat);
      mesh.position.set((o.min.x + o.max.x) / 2, (o.min.y + o.max.y) / 2, (o.min.z + o.max.z) / 2);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData.kind = 'obstacle';
      mesh.userData.obstacle = o.id;
      mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), this.edgeMat));
      this.obstacles.push(mesh);
      this.group.add(mesh);
    }
  }

  /** Hide walls between the camera and the room; in elevation view show only that wall. */
  updateVisibility(camera: THREE.Camera, elevationWall: string | null) {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const ortho = (camera as THREE.OrthographicCamera).isOrthographicCamera;
    for (const w of this.walls) {
      if (elevationWall) {
        w.group.visible = w.key === elevationWall;
        continue;
      }
      const toCam = ortho ? dir.clone().negate() : camera.position.clone().sub(w.mid);
      w.group.visible = w.normal.dot(toCam) >= -1e-6; // camera on the room side of the wall
    }
  }

  /** Fade walls and obstacles towards `target` opacity (explode). Returns true while still fading. */
  stepFade(target: number, dt: number): boolean {
    const goal = target > 0 ? FADED : 1;
    this.fade = goal + (this.fade - goal) * Math.exp(-6 * Math.min(dt, 1 / 30));
    if (Math.abs(this.fade - goal) < 1e-3) this.fade = goal;
    const translucent = this.fade < 0.999;
    for (const m of [this.wallMat, this.obstacleMat]) {
      if (m.transparent !== translucent) {
        m.transparent = translucent;
        m.depthWrite = !translucent;
        m.needsUpdate = true;
      }
      m.opacity = this.fade;
    }
    return this.fade !== goal;
  }

  pickTargets(): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    if (this.floor) out.push(this.floor);
    for (const w of this.walls) if (w.group.visible) out.push(...w.group.children);
    if (this.fade > 0.5) out.push(...this.obstacles);
    return out;
  }

  wallFor(key: string): { normal: THREE.Vector3; mid: THREE.Vector3 } | null {
    const w = this.walls.find((x) => x.key === key);
    return w ? { normal: w.normal.clone(), mid: w.mid.clone() } : null;
  }

  private clear() {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) o.geometry.dispose();
    });
    this.group.clear();
    this.walls = [];
    this.obstacles = [];
    this.floor = null;
  }

  dispose() {
    this.clear();
    for (const m of [this.wallMat, this.obstacleMat, this.floorMat, this.edgeMat]) m.dispose();
  }
}
