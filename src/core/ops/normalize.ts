import { parseParams } from '../catalog/params';
import type { AnyTemplate, CatalogRegistry, TemplateKind } from '../catalog/types';
import type { Entity, Front, Item, Unit } from '../schema/entities';
import type { TemplateRef } from '../schema/primitives';
import type { EntityInput } from './schema';

export class OpError extends Error {}

/** Ids are assigned up front by `withIds`; reaching here without one is a bug, not bad input. */
export const need = (id: string | undefined): string => {
  if (!id) throw new Error('internal: operation applied without its ids (withIds was skipped)');
  return id;
};
export const fail = (message: string): never => {
  throw new OpError(message);
};

/** Resolves a template reference against the catalog. */
export function resolveTemplate<K extends TemplateKind>(
  catalog: CatalogRegistry,
  ref: { id: string },
  kind: K,
): { template: Extract<AnyTemplate, { kind: K }>; ref: TemplateRef } {
  const t = catalog.get(ref.id);
  if (!t) return fail(`unknown template "${ref.id}"`);
  if (t.kind !== kind) return fail(`"${ref.id}" is a ${t.kind} template, not a ${kind} template`);
  return { template: t as Extract<AnyTemplate, { kind: K }>, ref: { id: t.id } };
}

/** Validates params against the template (with clamping notes). */
export function templateParams(
  t: AnyTemplate,
  input: unknown,
  base: Record<string, unknown> | undefined,
  notes: string[],
) {
  const r = parseParams(t.params, input, base);
  notes.push(...r.notes);
  if (!r.ok) return fail(`${t.name}: ${r.error}`);
  return r.value;
}

/** Turns an EntityInput into a complete Entity: ids, defaults, validated params. */
export function normalizeEntity(input: EntityInput, catalog: CatalogRegistry, notes: string[]): Entity {
  const base = {
    id: need(input.id),
    position: { x: input.position.x, y: input.position.y ?? 0, z: input.position.z },
    rotation: input.rotation ?? 0,
    locked: input.locked ?? false,
  };
  if (input.kind === 'part') {
    const { template, ref } = resolveTemplate(catalog, input.template, 'part');
    return {
      kind: 'part',
      ...base,
      name: input.name ?? template.name,
      template: ref,
      params: templateParams(template, input.params, undefined, notes),
      ...(input.material ? { material: input.material } : {}),
    };
  }
  const { template, ref } = resolveTemplate(catalog, input.template, 'unit');
  const size = { ...template.defaultSize, ...stripUndefined(input.size ?? {}) };
  // withIds supplies the default column, so `columns` is always present here.
  const columns = (input.columns ?? []).map((c) => ({
    id: need(c.id),
    width: c.width ?? 'auto',
    items: (c.items ?? []).map((i) => normalizeItem(i, catalog, notes)).sort((a, b) => a.y - b.y),
  }));
  const fronts = (input.fronts ?? []).map((f) => normalizeFront(f, catalog, notes));
  const unit: Unit = {
    kind: 'unit',
    ...base,
    name: input.name ?? template.name,
    template: ref,
    params: templateParams(template, input.params, undefined, notes),
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
    template: { id: string };
    y: number;
    params?: Record<string, unknown> | undefined;
    material?: string | undefined;
  },
  catalog: CatalogRegistry,
  notes: string[],
): Item {
  const { template, ref } = resolveTemplate(catalog, i.template, 'item');
  return {
    id: need(i.id),
    template: ref,
    y: i.y,
    params: templateParams(template, i.params, undefined, notes),
    ...(i.material ? { material: i.material } : {}),
  };
}

export function normalizeFront(
  f: {
    id?: string | undefined;
    template: { id: string };
    columns: [number, number];
    y: [number, number];
    params?: Record<string, unknown> | undefined;
    item?: string | undefined;
    material?: string | undefined;
  },
  catalog: CatalogRegistry,
  notes: string[],
): Front {
  const { template, ref } = resolveTemplate(catalog, f.template, 'front');
  return {
    id: need(f.id),
    template: ref,
    columns: f.columns,
    y: f.y,
    params: templateParams(template, f.params, undefined, notes),
    ...(f.item ? { item: f.item } : {}),
    ...(f.material ? { material: f.material } : {}),
  };
}

export function stripUndefined<T extends object>(o: T): { [K in keyof T]: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as {
    [K in keyof T]: Exclude<T[K], undefined>;
  };
}
