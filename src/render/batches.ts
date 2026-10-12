import * as THREE from 'three';
import type { Design, Entity, Part, SceneModel, Vec3 } from '../core';
import { frontOutlineShape } from './shapes';
import type { MaterialCache } from './materials';
import { outlineMaterial } from './materials';
import { partMatrix } from './transforms';

/**
 * All parts of the design, drawn with instancing (docs/v2/07-rendering.md#batching):
 * one InstancedMesh per (material, primitive) plus one instanced outline per material for boxes.
 * Extrusions (fronts with grip cutouts) are individual meshes — they are rare.
 */

export interface PartRef {
  part: Part;
  entity: Entity;
  entitySize: Vec3;
  batch: Batch | null; // null for extrusions
  index: number;
  outline: OutlineBatch | null;
  outlineIndex: number;
  mesh?: THREE.Mesh; // extrusions
}

interface Batch {
  mesh: THREE.InstancedMesh;
  refs: PartRef[];
}

interface OutlineBatch {
  lines: THREE.LineSegments;
  matrices: THREE.InstancedBufferAttribute;
  colors: THREE.InstancedBufferAttribute;
  count: number;
}

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYLINDER = new THREE.CylinderGeometry(0.5, 0.5, 1, 20);
const EDGES = new THREE.EdgesGeometry(BOX);
const OUTLINE = new THREE.Color('#7d7f86');
const OUTLINE_SELECTED = new THREE.Color('#2f6fed');
const WHITE = new THREE.Color(1, 1, 1);

export interface Tints {
  selected: Set<string>; // entity ids
  problems: Set<string>; // entity ids
  hover: string | null; // entity id
  hideFronts: boolean;
}

const SELECTED_TINT = new THREE.Color(0.82, 0.88, 1.08);
const PROBLEM_TINT = new THREE.Color(1.05, 0.62, 0.6);
const HOVER_TINT = new THREE.Color(0.93, 0.96, 1.04);
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

export class PartBatches {
  readonly group = new THREE.Group();
  private batches: Batch[] = [];
  private outlines: OutlineBatch[] = [];
  private extrusions: THREE.Mesh[] = [];
  private refs = new Map<string, PartRef>();
  private byEntity = new Map<string, PartRef[]>();
  private readonly outlineMat = outlineMaterial();
  private readonly tmp = new THREE.Matrix4();

  constructor(private readonly materials: MaterialCache) {
    this.group.name = 'parts';
  }

  /** Rebuilds every batch from the scene model (cheap: a few ms for thousands of parts). */
  rebuild(scene: SceneModel, design: Design) {
    this.clear();
    const groups = new Map<string, PartRef[]>();
    const outlineGroups = new Map<string, PartRef[]>();
    for (const se of scene.entities.values()) {
      const entity = design.entities[se.id];
      if (!entity) continue;
      const lb = se.localBounds;
      const entitySize = { x: lb.max.x - lb.min.x, y: lb.max.y, z: lb.max.z - lb.min.z };
      const list: PartRef[] = [];
      for (const part of se.parts) {
        const ref: PartRef = { part, entity, entitySize, batch: null, index: -1, outline: null, outlineIndex: -1 };
        list.push(ref);
        this.refs.set(part.id, ref);
        const matId = part.role === 'invalid' ? '__invalid' : part.material.id;
        if (part.shape.kind === 'extrusion') {
          const mesh = new THREE.Mesh(frontOutlineShape(part), this.materials.get(matId, design.materials[matId]));
          mesh.matrixAutoUpdate = false;
          mesh.castShadow = mesh.receiveShadow = true;
          mesh.userData.partId = part.id;
          ref.mesh = mesh;
          this.extrusions.push(mesh);
          this.group.add(mesh);
          continue;
        }
        const key = `${matId}|${part.shape.kind}`;
        (groups.get(key) ?? groups.set(key, []).get(key)!).push(ref);
        if (part.shape.kind === 'box' && part.role !== 'handle' && part.role !== 'hardware' && part.role !== 'rail') {
          (outlineGroups.get(matId) ?? outlineGroups.set(matId, []).get(matId)!).push(ref);
        }
      }
      this.byEntity.set(se.id, list);
    }
    for (const [key, refs] of groups) {
      const [matId, shape] = key.split('|') as [string, string];
      const mesh = new THREE.InstancedMesh(
        shape === 'cylinder' ? CYLINDER : BOX,
        this.materials.get(matId, design.materials[matId]),
        refs.length,
      );
      mesh.castShadow = mesh.receiveShadow = matId !== '__invalid';
      mesh.frustumCulled = false; // bounds of instanced meshes are not tracked
      const batch: Batch = { mesh, refs };
      refs.forEach((r, i) => {
        r.batch = batch;
        r.index = i;
        mesh.setColorAt(i, WHITE);
      });
      this.batches.push(batch);
      this.group.add(mesh);
    }
    for (const refs of outlineGroups.values()) {
      const geo = new THREE.InstancedBufferGeometry();
      geo.setAttribute('position', EDGES.getAttribute('position'));
      const matrices = new THREE.InstancedBufferAttribute(new Float32Array(refs.length * 16), 16);
      const colors = new THREE.InstancedBufferAttribute(new Float32Array(refs.length * 3), 3);
      matrices.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aMatrix', matrices);
      geo.setAttribute('aColor', colors);
      geo.instanceCount = refs.length;
      const lines = new THREE.LineSegments(geo, this.outlineMat);
      lines.frustumCulled = false;
      const ob: OutlineBatch = { lines, matrices, colors, count: refs.length };
      refs.forEach((r, i) => {
        r.outline = ob;
        r.outlineIndex = i;
        OUTLINE.toArray(colors.array, i * 3);
      });
      this.outlines.push(ob);
      this.group.add(lines);
    }
  }

  /** Recomputes instance matrices for the given entities (all when omitted). */
  updateMatrices(
    open: (motionId: string) => number,
    explode: number,
    spread: (entityId: string) => Vec3,
    tints: Tints,
    only?: Iterable<string>,
  ) {
    const ids = only ? [...only] : [...this.byEntity.keys()];
    for (const id of ids) {
      const refs = this.byEntity.get(id);
      if (!refs) continue;
      const s = spread(id);
      for (const r of refs) {
        const hidden = tints.hideFronts && (r.part.role === 'front' || r.part.role === 'handle');
        const m = hidden
          ? HIDDEN
          : partMatrix(
              r.part,
              r.entity,
              r.entitySize,
              r.part.motion ? open(r.part.motion.id) : 0,
              explode,
              s,
              this.tmp,
            );
        if (r.mesh) {
          r.mesh.matrix.copy(m);
          r.mesh.visible = !hidden;
        } else if (r.batch) {
          r.batch.mesh.setMatrixAt(r.index, m);
        }
        if (r.outline) m.toArray(r.outline.matrices.array, r.outlineIndex * 16);
      }
    }
    for (const b of this.batches) b.mesh.instanceMatrix.needsUpdate = true;
    for (const o of this.outlines) o.matrices.needsUpdate = true;
  }

  /** Selection / hover / problem tints. */
  updateTints(t: Tints) {
    for (const [id, refs] of this.byEntity) {
      const tint = t.problems.has(id)
        ? PROBLEM_TINT
        : t.selected.has(id)
          ? SELECTED_TINT
          : t.hover === id
            ? HOVER_TINT
            : WHITE;
      const outline = t.selected.has(id) ? OUTLINE_SELECTED : OUTLINE;
      for (const r of refs) {
        if (r.batch) r.batch.mesh.setColorAt(r.index, tint);
        if (r.outline) outline.toArray(r.outline.colors.array, r.outlineIndex * 3);
      }
    }
    for (const b of this.batches) if (b.mesh.instanceColor) b.mesh.instanceColor.needsUpdate = true;
    for (const o of this.outlines) o.colors.needsUpdate = true;
  }

  /** Entity ids whose parts move (for animated frames). */
  entitiesWithMotion(): string[] {
    return [...this.byEntity].filter(([, refs]) => refs.some((r) => r.part.motion)).map(([id]) => id);
  }

  /** Meshes to raycast and how to map a hit back to a part. */
  pickTargets(): THREE.Object3D[] {
    return [...this.batches.map((b) => b.mesh), ...this.extrusions];
  }

  partFromHit(hit: THREE.Intersection): PartRef | null {
    if (hit.object instanceof THREE.InstancedMesh && hit.instanceId !== undefined) {
      const batch = this.batches.find((b) => b.mesh === hit.object);
      return batch?.refs[hit.instanceId] ?? null;
    }
    const id = hit.object.userData.partId as string | undefined;
    return id ? (this.refs.get(id) ?? null) : null;
  }

  stats() {
    return {
      parts: this.refs.size,
      batches: this.batches.length,
      outlines: this.outlines.length,
      extrusions: this.extrusions.length,
    };
  }

  private clear() {
    for (const b of this.batches) b.mesh.dispose();
    for (const o of this.outlines) o.lines.geometry.dispose();
    for (const e of this.extrusions) e.geometry.dispose();
    this.group.clear();
    this.batches = [];
    this.outlines = [];
    this.extrusions = [];
    this.refs.clear();
    this.byEntity.clear();
  }

  dispose() {
    this.clear();
    this.outlineMat.dispose();
  }
}
