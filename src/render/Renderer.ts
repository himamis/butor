import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { spreadOffset, type Design, type SceneModel, type Vec3 } from '../core';
import { Animation } from './animation';
import { PartBatches, type Tints } from './batches';
import { MaterialCache } from './materials';
import { RoomView } from './room';
import { Overlays, type GuideSpec, type HandleSpec } from './overlays';

export type ViewMode = '3d' | 'front' | 'top' | 'side' | 'elevation';

export interface ViewState {
  mode: ViewMode;
  elevationWall: string | null; // wall key for the elevation view
  explode: number; // 0 = assembled; target amount when exploding
  open: Set<string>; // entity ids shown open
  tints: Tints;
}

export interface Hit {
  kind: 'part' | 'floor' | 'wall' | 'obstacle' | 'handle';
  handle?: string;
  point: Vec3; // mm
  normal: Vec3; // world, unit length
  partId?: string;
  entityId?: string;
  wall?: string;
  obstacle?: string;
}

const ELEVATION_DEPTH = 1200; // mm in front of a wall kept in its elevation view

/**
 * Imperative three.js renderer (docs/v2/07-rendering.md). Draws on demand only: a frame is rendered when
 * something requests one (design or view change, camera movement, animation in progress).
 */
export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  private readonly materials = new MaterialCache();
  private readonly parts = new PartBatches(this.materials);
  private readonly room = new RoomView();
  private readonly anim = new Animation();
  readonly overlays = new Overlays();
  private readonly persp: THREE.PerspectiveCamera;
  private readonly ortho: THREE.OrthographicCamera;
  private camera: THREE.Camera;
  private readonly controls: OrbitControls;
  private readonly sun: THREE.DirectionalLight;
  private readonly clip = new THREE.Plane();
  private readonly resizeObserver: ResizeObserver;
  private design: Design | null = null;
  private sceneModel: SceneModel | null = null;
  private view: ViewState = {
    mode: '3d',
    elevationWall: null,
    explode: 0,
    open: new Set(),
    tints: { selected: new Set(), problems: new Set(), hover: null, hideFronts: false },
  };
  private frameRequested = false;
  private lastFrame = 0;
  private spreadTarget = new Map<string, Vec3>();
  readonly stats = { frames: 0, calls: 0, triangles: 0 };

  constructor(private readonly container: HTMLElement) {
    this.gl = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });
    this.gl.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap;
    this.gl.shadowMap.autoUpdate = false; // the light never moves: update only when the design changes
    this.gl.localClippingEnabled = true;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.domElement.style.display = 'block';
    container.appendChild(this.gl.domElement);

    this.scene.background = new THREE.Color('#f4f3ef');
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#c9c2b5', 1.6));
    this.sun = new THREE.DirectionalLight('#ffffff', 1.8);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.scene.add(this.sun, this.sun.target, this.room.group, this.parts.group, this.overlays.group);

    // Millimetres everywhere: near/far in mm.
    this.persp = new THREE.PerspectiveCamera(45, 1, 10, 200_000);
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 10, 200_000);
    this.camera = this.persp;
    this.controls = new OrbitControls(this.persp, this.gl.domElement);
    this.controls.addEventListener('change', () => this.requestRender());

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  /** New design or derived scene. Rebuilds batches when the scene model changed. */
  setDesign(design: Design, scene: SceneModel) {
    const roomChanged = design.room !== this.design?.room;
    const first = !this.design;
    this.design = design;
    if (scene !== this.sceneModel) {
      this.sceneModel = scene;
      this.parts.rebuild(scene, design);
      this.parts.updateTints(this.view.tints);
      this.updateSpread();
    }
    if (roomChanged) {
      this.room.build(design.room);
      this.fitShadow(design);
      if (first) this.applyCamera(true);
    }
    this.syncOpenTargets();
    this.parts.updateMatrices(
      (id) => this.anim.open(id),
      this.anim.explode(),
      (id) => this.spreadNow(id),
      this.view.tints,
    );
    this.gl.shadowMap.needsUpdate = true;
    this.requestRender();
  }

  setView(view: ViewState) {
    const modeChanged = view.mode !== this.view.mode || view.elevationWall !== this.view.elevationWall;
    const tintsChanged = view.tints !== this.view.tints;
    this.view = view;
    this.anim.setExplode(view.explode);
    this.syncOpenTargets();
    this.updateSpread();
    if (tintsChanged) {
      this.parts.updateTints(view.tints);
      this.parts.updateMatrices(
        (id) => this.anim.open(id),
        this.anim.explode(),
        (id) => this.spreadNow(id),
        view.tints,
      );
    }
    if (modeChanged) this.applyCamera(true);
    this.requestRender();
  }

  /** Fits the camera to the room (or to a box) for the current view. */
  frame(box?: THREE.Box3) {
    this.applyCamera(true, box);
    this.requestRender();
  }

  /** Fits the camera to an axis-aligned box in room mm (e.g. the entities of a check). */
  frameBounds(min: Vec3, max: Vec3) {
    this.frame(new THREE.Box3(new THREE.Vector3(min.x, min.y, min.z), new THREE.Vector3(max.x, max.y, max.z)));
  }

  requestRender() {
    if (this.frameRequested) return;
    this.frameRequested = true;
    requestAnimationFrame((t) => this.renderFrame(t));
  }

  /** Renders immediately with all animations finished (screenshots, tests, print). */
  settle() {
    this.anim.jump();
    this.parts.updateMatrices(
      (id) => this.anim.open(id),
      this.anim.explode(),
      (id) => this.spreadNow(id),
      this.view.tints,
    );
    this.room.stepFade(this.view.explode, 1);
    this.gl.shadowMap.needsUpdate = true;
    this.draw();
  }

  pick(clientX: number, clientY: number): Hit | null {
    const r = this.gl.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const handle = ray.intersectObjects(this.overlays.pickTargets(), false)[0];
    if (handle) {
      const p = handle.point;
      return {
        kind: 'handle',
        handle: handle.object.userData.handle as string,
        point: { x: p.x, y: p.y, z: p.z },
        normal: { x: 0, y: 1, z: 0 },
      };
    }
    const hits = ray.intersectObjects([...this.parts.pickTargets(), ...this.room.pickTargets()], false);
    for (const h of hits) {
      if (this.view.mode === 'elevation' && this.clip.distanceToPoint(h.point) < 0) continue; // clipped away
      const point = { x: h.point.x, y: h.point.y, z: h.point.z };
      const normal = h.face ? this.worldNormal(h) : { x: 0, y: 1, z: 0 };
      const ref = this.parts.partFromHit(h);
      if (ref) return { kind: 'part', point, normal, partId: ref.part.id, entityId: ref.entity.id };
      const kind = h.object.userData.kind as Hit['kind'] | undefined;
      if (kind)
        return {
          kind,
          point,
          normal,
          ...(h.object.userData.wall ? { wall: h.object.userData.wall } : {}),
          ...(h.object.userData.obstacle ? { obstacle: h.object.userData.obstacle } : {}),
        };
    }
    return null;
  }

  /** World ray (mm) through a screen point. */
  ray(clientX: number, clientY: number): { origin: Vec3; dir: Vec3 } {
    const r = this.gl.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    const rc = new THREE.Raycaster();
    rc.setFromCamera(ndc, this.camera);
    const o = rc.ray.origin;
    const d = rc.ray.direction;
    return { origin: { x: o.x, y: o.y, z: o.z }, dir: { x: d.x, y: d.y, z: d.z } };
  }

  setHandles(handles: HandleSpec[], ring: { center: Vec3; radius: number } | null) {
    this.overlays.setHandles(handles, ring);
    this.requestRender();
  }

  setGuides(lines: GuideSpec[]) {
    this.overlays.setGuides(lines);
    this.requestRender();
  }

  setTarget(box: Parameters<Overlays['setTarget']>[0]) {
    this.overlays.setTarget(box);
    this.requestRender();
  }

  /** Screen position (CSS px, relative to the canvas) of a point in mm — for overlays and tests. */
  toScreen(p: Vec3): { x: number; y: number } {
    const v = new THREE.Vector3(p.x, p.y, p.z).project(this.camera);
    const r = this.gl.domElement.getBoundingClientRect();
    return { x: ((v.x + 1) / 2) * r.width, y: ((1 - v.y) / 2) * r.height };
  }

  get activeCamera(): THREE.Camera {
    return this.camera;
  }

  setControlsEnabled(on: boolean) {
    this.controls.enabled = on;
  }

  dispose() {
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.parts.dispose();
    this.room.dispose();
    this.overlays.dispose();
    this.materials.dispose();
    this.gl.dispose();
    this.gl.domElement.remove();
  }

  /* ───────────────────────── internals ───────────────────────── */

  private renderFrame(time: number) {
    this.frameRequested = false;
    const dt = this.lastFrame ? (time - this.lastFrame) / 1000 : 0;
    this.lastFrame = time;
    const animating = this.anim.step(dt);
    const fading = this.room.stepFade(this.view.explode, dt);
    if (animating) {
      // Exploding moves every part; opening only moves entities with doors/drawers.
      const ids = this.anim.explode() !== 0 || this.view.explode !== 0 ? undefined : this.parts.entitiesWithMotion();
      this.parts.updateMatrices(
        (id) => this.anim.open(id),
        this.anim.explode(),
        (id) => this.spreadNow(id),
        this.view.tints,
        ids,
      );
      this.gl.shadowMap.needsUpdate = true;
    }
    this.draw();
    if (animating || fading) this.requestRender();
    else this.lastFrame = 0; // next frame after idle starts fresh
  }

  private draw() {
    this.room.updateVisibility(this.camera, this.view.mode === 'elevation' ? this.view.elevationWall : null);
    this.gl.clippingPlanes = this.view.mode === 'elevation' && this.view.elevationWall ? [this.clip] : [];
    this.gl.render(this.scene, this.camera);
    this.stats.frames++;
    this.stats.calls = this.gl.info.render.calls;
    this.stats.triangles = this.gl.info.render.triangles;
  }

  private worldNormal(h: THREE.Intersection): Vec3 {
    const n = h.face!.normal.clone();
    const m = new THREE.Matrix4();
    if (h.object instanceof THREE.InstancedMesh && h.instanceId !== undefined) {
      h.object.getMatrixAt(h.instanceId, m);
      m.premultiply(h.object.matrixWorld);
    } else m.copy(h.object.matrixWorld);
    n.applyMatrix3(new THREE.Matrix3().getNormalMatrix(m)).normalize();
    return { x: n.x, y: n.y, z: n.z };
  }

  private syncOpenTargets() {
    if (!this.sceneModel) return;
    for (const se of this.sceneModel.entities.values()) {
      const open = this.view.open.has(se.id);
      for (const p of se.parts) if (p.motion) this.anim.setOpen(p.motion.id, open);
    }
  }

  private updateSpread() {
    this.spreadTarget.clear();
    if (!this.sceneModel) return;
    const ents = [...this.sceneModel.entities.values()];
    if (!ents.length) return;
    const xs = ents.map((e) => e.bounds.center.x);
    const zs = ents.map((e) => e.bounds.center.z);
    const center = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: 0, z: (Math.min(...zs) + Math.max(...zs)) / 2 };
    for (const e of ents) this.spreadTarget.set(e.id, spreadOffset(e.bounds.center, center, 1));
  }

  /** Spread follows the animated explode amount (spreadOffset is linear in the amount). */
  private spreadNow(id: string): Vec3 {
    const full = this.spreadTarget.get(id);
    const a = this.anim.explode();
    return full ? { x: full.x * a, y: 0, z: full.z * a } : { x: 0, y: 0, z: 0 };
  }

  private roomBox(): THREE.Box3 {
    const box = new THREE.Box3();
    const room = this.design?.room;
    if (!room) return box.set(new THREE.Vector3(0, 0, 0), new THREE.Vector3(4000, 2600, 3500));
    for (const c of room.corners) box.expandByPoint(new THREE.Vector3(c.x, 0, c.z));
    box.expandByPoint(new THREE.Vector3(room.corners[0]!.x, room.height, room.corners[0]!.z));
    return box;
  }

  private fitShadow(design: Design) {
    const box = this.roomBox();
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const r = Math.max(size.x, size.z) * 0.8 + 1000;
    this.sun.position.set(c.x + r * 0.5, design.room.height * 2.5, c.z + r * 0.8);
    this.sun.target.position.copy(c);
    const cam = this.sun.shadow.camera;
    cam.left = -r;
    cam.right = r;
    cam.top = r;
    cam.bottom = -r;
    cam.near = 100;
    cam.far = design.room.height * 6 + r * 2;
    cam.updateProjectionMatrix();
  }

  private applyCamera(reset: boolean, box = this.roomBox()) {
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.z, 1000);
    const mode = this.view.mode;
    if (mode === '3d') {
      this.camera = this.persp;
      this.controls.object = this.persp;
      this.controls.enableRotate = true;
      this.controls.maxPolarAngle = Math.PI / 2 - 0.01;
      if (reset) {
        this.persp.position.set(c.x + span * 0.45, Math.max(size.y, 2000) * 1.15, c.z + span * 1.25);
        this.controls.target.set(c.x, Math.max(size.y, 2000) * 0.4, c.z);
      }
    } else {
      this.camera = this.ortho;
      this.controls.object = this.ortho;
      this.controls.enableRotate = false;
      const far = 50_000;
      let dir = new THREE.Vector3(0, 0, 1);
      let up = new THREE.Vector3(0, 1, 0);
      let target = new THREE.Vector3(c.x, size.y / 2, c.z);
      if (mode === 'top') {
        dir = new THREE.Vector3(0, 1, 0);
        up = new THREE.Vector3(0, 0, -1);
        target = new THREE.Vector3(c.x, 0, c.z);
      } else if (mode === 'side') dir = new THREE.Vector3(1, 0, 0);
      else if (mode === 'elevation' && this.view.elevationWall) {
        const w = this.room.wallFor(this.view.elevationWall);
        if (w) {
          dir = w.normal.clone();
          target = w.mid.clone();
          // keep only what is within ELEVATION_DEPTH of the wall
          this.clip.setFromNormalAndCoplanarPoint(
            w.normal.clone().negate(),
            w.mid.clone().addScaledVector(w.normal, ELEVATION_DEPTH),
          );
        }
      }
      this.ortho.up.copy(up);
      this.ortho.position.copy(target).addScaledVector(dir, far);
      this.controls.target.copy(target);
      const r = this.gl.domElement.getBoundingClientRect();
      const aspect = r.width / Math.max(1, r.height);
      const extent = (mode === 'top' ? span : Math.max(span, size.y)) * 0.6;
      this.ortho.left = -extent * aspect;
      this.ortho.right = extent * aspect;
      this.ortho.top = extent;
      this.ortho.bottom = -extent;
      this.ortho.zoom = 1;
      this.ortho.updateProjectionMatrix();
    }
    this.controls.update();
  }

  private resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.gl.setSize(w, h, true);
    this.persp.aspect = w / h;
    this.persp.updateProjectionMatrix();
    if (this.camera === this.ortho) this.applyCamera(false);
    this.requestRender();
  }
}
