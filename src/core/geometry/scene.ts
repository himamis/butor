import type { CatalogRegistry, ResolvedMaterials, UnitLayout } from '../catalog/types';
import { unitLayout } from '../invariants';
import type { Design } from '../schema/design';
import type { Entity, Front, Unit } from '../schema/entities';
import type { Vec3 } from '../schema/primitives';
import { obbFromLocal, type OBB } from './obb';
import type { Motion, Part, PartDraft } from './part';

/** Gap left on every side of a front (so neighbouring fronts are 2 × FRONT_GAP apart). */
export const FRONT_GAP = 1.5;

export interface ScenePart extends Part {
  obb: OBB; // closed state, room coordinates
}

export interface SceneEntity {
  id: string;
  kind: Entity['kind'];
  parts: ScenePart[];
  localBounds: { min: Vec3; max: Vec3 };
  bounds: OBB; // all parts, room coordinates
}

export interface SceneModel {
  entities: Map<string, SceneEntity>;
  parts: Map<string, ScenePart>;
}

/* ───────────────────────── materials ───────────────────────── */

export function resolveMaterials(e: Entity, defaults: Design['defaults']): ResolvedMaterials {
  const base: ResolvedMaterials = {
    carcass: defaults.carcass,
    back: defaults.back,
    interior: defaults.interior,
    front: defaults.front,
    handle: defaults.handle,
  };
  if (e.kind === 'unit') return { ...base, ...Object.fromEntries(Object.entries(e.materials).filter(([, v]) => v)) };
  if (e.kind === 'part' && e.material)
    return { ...base, carcass: e.material, interior: e.material, front: e.material, back: e.material };
  return base;
}

/* ───────────────────────── fronts ───────────────────────── */

/**
 * The rectangle a front covers: from the unit's outer edge (or the middle of a divider) on each side,
 * over its height range, inset by FRONT_GAP. Unit-local mm.
 */
export function frontRect(u: Unit, f: Pick<Front, 'columns' | 'y'>, l: UnitLayout) {
  const half = l.dividerThickness / 2;
  const [c0, c1] = f.columns;
  const first = l.columns[c0];
  const last = l.columns[c1];
  if (!first || !last) throw new Error('front covers a column that does not exist');
  const left = c0 === 0 ? -u.size.w / 2 : first.x0 - half;
  const right = c1 === l.columns.length - 1 ? u.size.w / 2 : last.x0 + last.width + half;
  return { x0: left + FRONT_GAP, x1: right - FRONT_GAP, y0: f.y[0] + FRONT_GAP, y1: f.y[1] - FRONT_GAP };
}

/* ───────────────────────── building ───────────────────────── */

function finish(drafts: PartDraft[], entity: string, scope: string): Part[] {
  const keys = new Set<string>();
  return drafts.map((d) => {
    if (keys.has(d.key)) throw new Error(`${scope}: duplicate part key "${d.key}"`);
    keys.add(d.key);
    for (const v of [d.center.x, d.center.y, d.center.z, d.size.x, d.size.y, d.size.z]) {
      if (!Number.isFinite(v)) throw new Error(`${scope}/${d.key}: non-finite geometry`);
    }
    if (d.size.x <= 0 || d.size.y <= 0 || d.size.z <= 0) throw new Error(`${scope}/${d.key}: non-positive size`);
    return { ...d, id: `${entity}/${scope}/${d.key}`, entity };
  });
}

function invalidPart(e: Entity, size: Vec3, message: string, materials: ResolvedMaterials): Part {
  return {
    id: `${e.id}/invalid`,
    entity: e.id,
    key: 'invalid',
    label: e.name,
    role: 'invalid',
    shape: { kind: 'box' },
    center: { x: 0, y: size.y / 2, z: 0 },
    size,
    material: { id: materials.carcass },
    invalid: message,
  };
}

function buildUnit(u: Unit, catalog: CatalogRegistry, m: ResolvedMaterials): Part[] {
  const t = catalog.get(u.template.id);
  if (!t || t.kind !== 'unit') throw new Error(`unknown unit template "${u.template.id}"`);
  const layout = unitLayout(u, t, catalog);
  if ('error' in layout) throw new Error(layout.error);
  const parts = finish(t.build(u, layout, m), u.id, 'carcass');
  const motions = new Map<string, Motion>();
  u.columns.forEach((col, ci) => {
    const c = layout.columns[ci]!;
    for (const item of col.items) {
      const it = catalog.get(item.template.id);
      if (!it || it.kind !== 'item') throw new Error(`unknown item template "${item.template.id}"`);
      const drafts = it.build(item.params, {
        id: item.id,
        layout,
        column: ci,
        x0: c.x0,
        width: c.width,
        y: layout.floorY + item.y,
        innerZ: layout.innerZ,
        thickness: layout.dividerThickness,
        materials: m,
      });
      const motion = drafts.find((d) => d.motion)?.motion;
      if (motion) motions.set(item.id, motion);
      parts.push(...finish(drafts, u.id, `item:${item.id}`));
    }
  });
  for (const f of u.fronts) {
    const ft = catalog.get(f.template.id);
    if (!ft || ft.kind !== 'front') throw new Error(`unknown front template "${f.template.id}"`);
    const itemMotion = f.item ? motions.get(f.item) : undefined;
    const drafts = ft.build(f.params, {
      id: f.id,
      rect: frontRect(u, f, layout),
      z: u.size.d / 2,
      ...(layout.trackZone ? { trackZone: layout.trackZone } : {}),
      ...(itemMotion ? { itemMotion } : {}),
      unit: { w: u.size.w, h: u.size.h, d: u.size.d },
      opening: {
        x0: layout.columns[0]!.x0,
        x1: layout.columns[layout.columns.length - 1]!.x0 + layout.columns[layout.columns.length - 1]!.width,
        y0: layout.floorY,
        y1: layout.floorY + layout.inner.h,
      },
      materials: m,
    });
    parts.push(...finish(drafts, u.id, `front:${f.id}`));
  }
  return parts;
}

/** Entity-local parts (closed state). Never throws: failures become one invalid part. */
export function buildEntityParts(e: Entity, design: Pick<Design, 'defaults'>, catalog: CatalogRegistry): Part[] {
  const m = resolveMaterials(e, design.defaults);
  if (e.kind === 'opaque') return [invalidPart(e, { x: e.bounds.w, y: e.bounds.h, z: e.bounds.d }, e.reason, m)];
  try {
    if (e.kind === 'unit') return buildUnit(e, catalog, m);
    const t = catalog.get(e.template.id);
    if (!t || t.kind !== 'part') throw new Error(`unknown part template "${e.template.id}"`);
    return finish(t.build(e.params, m), e.id, 'part');
  } catch (err) {
    const size = e.kind === 'unit' ? { x: e.size.w, y: e.size.h, z: e.size.d } : { x: 500, y: 500, z: 500 };
    return [invalidPart(e, size, err instanceof Error ? err.message : String(err), m)];
  }
}

/* ───────────────────────── scene ───────────────────────── */

interface CacheEntry {
  defaults: Design['defaults'];
  catalog: CatalogRegistry;
  scene: SceneEntity;
}
const cache = new WeakMap<Entity, CacheEntry>();

function sceneEntity(e: Entity, design: Design, catalog: CatalogRegistry): SceneEntity {
  const hit = cache.get(e);
  if (hit && hit.defaults === design.defaults && hit.catalog === catalog) return hit.scene;
  const parts = buildEntityParts(e, design, catalog);
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const p of parts) {
    for (const k of ['x', 'y', 'z'] as const) {
      min[k] = Math.min(min[k], p.center[k] - p.size[k] / 2);
      max[k] = Math.max(max[k], p.center[k] + p.size[k] / 2);
    }
  }
  const placement = { position: e.position, rotation: e.rotation };
  const scene: SceneEntity = {
    id: e.id,
    kind: e.kind,
    parts: parts.map((p) => ({ ...p, obb: obbFromLocal(p.center, p.size, placement) })),
    localBounds: { min, max },
    bounds: obbFromLocal(
      { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 },
      { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z },
      placement,
    ),
  };
  cache.set(e, { defaults: design.defaults, catalog, scene });
  return scene;
}

/** The derived scene: every entity's parts in room coordinates. Reuses unchanged entities. */
export function buildScene(design: Design, catalog: CatalogRegistry): SceneModel {
  const entities = new Map<string, SceneEntity>();
  const parts = new Map<string, ScenePart>();
  for (const id of design.order) {
    const e = design.entities[id];
    if (!e) continue;
    const s = sceneEntity(e, design, catalog);
    entities.set(id, s);
    for (const p of s.parts) parts.set(p.id, p);
  }
  return { entities, parts };
}
