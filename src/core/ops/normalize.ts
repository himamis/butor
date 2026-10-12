import { parseParams } from '../catalog/params';
import type { AnyTemplate, CatalogRegistry, TemplateKind } from '../catalog/types';
import type { Entity, Front, Item, Unit } from '../schema/entities';
import type { TemplateRef } from '../schema/primitives';
import type { EntityInput } from './schema';

export class OpError extends Error {}
export const fail = (message: string): never => {
  throw new OpError(message);
};

/** Resolves a template reference (version defaults to current; older versions are migrated). */
export function resolveTemplate<K extends TemplateKind>(
  catalog: CatalogRegistry,
  ref: { id: string; version?: number | undefined },
  kind: K,
): { template: Extract<AnyTemplate, { kind: K }>; ref: TemplateRef; fromVersion: number } {
  const t = catalog.get(ref.id);
  if (!t) return fail(`unknown template "${ref.id}"`);
  if (t.kind !== kind) return fail(`"${ref.id}" is a ${t.kind} template, not a ${kind} template`);
  const version = ref.version ?? t.version;
  if (version > t.version) return fail(`"${ref.id}" version ${version} is newer than this app (${t.version})`);
  return {
    template: t as Extract<AnyTemplate, { kind: K }>,
    ref: { id: t.id, version: t.version },
    fromVersion: version,
  };
}

/** Migrates params from an older template version, then validates them (with clamping notes). */
export function templateParams(
  t: AnyTemplate,
  fromVersion: number,
  input: unknown,
  base: Record<string, unknown> | undefined,
  notes: string[],
) {
  let params = input;
  if (fromVersion < t.version) {
    let p = (input ?? {}) as Record<string, unknown>;
    for (let v = fromVersion; v < t.version; v++) p = t.migrate?.[v]?.(p) ?? p;
    params = p;
  }
  const r = parseParams(t.params, params, base);
  notes.push(...r.notes);
  if (!r.ok) return fail(`${t.name}: ${r.error}`);
  return r.value;
}

/** Turns an EntityInput into a complete Entity: ids, defaults, validated params. */
export function normalizeEntity(
  input: EntityInput,
  catalog: CatalogRegistry,
  newId: () => string,
  notes: string[],
): Entity {
  const base = {
    id: input.id ?? newId(),
    position: { x: input.position.x, y: input.position.y ?? 0, z: input.position.z },
    rotation: input.rotation ?? 0,
    locked: input.locked ?? false,
  };
  if (input.kind === 'part') {
    const { template, ref, fromVersion } = resolveTemplate(catalog, input.template, 'part');
    return {
      kind: 'part',
      ...base,
      name: input.name ?? template.name,
      template: ref,
      params: templateParams(template, fromVersion, input.params, undefined, notes),
      ...(input.material ? { material: input.material } : {}),
    };
  }
  const { template, ref, fromVersion } = resolveTemplate(catalog, input.template, 'unit');
  const size = { ...template.defaultSize, ...stripUndefined(input.size ?? {}) };
  const columns = (input.columns ?? [{ width: 'auto' as const, items: [] }]).map((c) => ({
    id: c.id ?? newId(),
    width: c.width ?? 'auto',
    items: (c.items ?? []).map((i) => normalizeItem(i, catalog, newId, notes)).sort((a, b) => a.y - b.y),
  }));
  const fronts = (input.fronts ?? []).map((f) => normalizeFront(f, catalog, newId, notes));
  const unit: Unit = {
    kind: 'unit',
    ...base,
    name: input.name ?? template.name,
    template: ref,
    params: templateParams(template, fromVersion, input.params, undefined, notes),
    size,
    materials: stripUndefined(input.materials ?? {}),
    columns,
    fronts,
  };
  return unit;
}

export function normalizeItem(
  i: {
    id?: string | undefined;
    template: { id: string; version?: number | undefined };
    y: number;
    params?: Record<string, unknown> | undefined;
    material?: string | undefined;
  },
  catalog: CatalogRegistry,
  newId: () => string,
  notes: string[],
): Item {
  const { template, ref, fromVersion } = resolveTemplate(catalog, i.template, 'item');
  return {
    id: i.id ?? newId(),
    template: ref,
    y: i.y,
    params: templateParams(template, fromVersion, i.params, undefined, notes),
    ...(i.material ? { material: i.material } : {}),
  };
}

export function normalizeFront(
  f: {
    id?: string | undefined;
    template: { id: string; version?: number | undefined };
    columns: [number, number];
    y: [number, number];
    params?: Record<string, unknown> | undefined;
    drawer?: string | undefined;
    material?: string | undefined;
  },
  catalog: CatalogRegistry,
  newId: () => string,
  notes: string[],
): Front {
  const { template, ref, fromVersion } = resolveTemplate(catalog, f.template, 'front');
  return {
    id: f.id ?? newId(),
    template: ref,
    columns: f.columns,
    y: f.y,
    params: templateParams(template, fromVersion, f.params, undefined, notes),
    ...(f.drawer ? { drawer: f.drawer } : {}),
    ...(f.material ? { material: f.material } : {}),
  };
}

export function stripUndefined<T extends object>(o: T): { [K in keyof T]: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as {
    [K in keyof T]: Exclude<T[K], undefined>;
  };
}
