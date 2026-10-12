import { parseParams } from '../catalog/params';
import type { AnyTemplate, CatalogRegistry, TemplateKind } from '../catalog/types';
import { checkDesign, checkUnit } from '../invariants';
import { Design, SCHEMA_VERSION } from '../schema/design';
import { Entity, type Group, type OpaqueEntity } from '../schema/entities';

export type ImportResult = { ok: true; design: Design; warnings: string[] } | { ok: false; error: string };

/** Document-shape migrations: SCHEMA_MIGRATIONS[n] turns a version-n document into version n + 1. */
const SCHEMA_MIGRATIONS: Record<number, (doc: Record<string, unknown>) => Record<string, unknown>> = {};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Turns untrusted JSON (a file, a share link, storage) into a valid current design (docs/v2/09).
 * Entities that cannot be interpreted are kept verbatim as opaque entities — never dropped.
 */
export function importDesign(raw: unknown, catalog: CatalogRegistry): ImportResult {
  if (!isObj(raw) || typeof raw.schemaVersion !== 'number')
    return { ok: false, error: 'This is not a Butor design file.' };
  if (raw.schemaVersion > SCHEMA_VERSION)
    return {
      ok: false,
      error: `This design was made with a newer version of Butor (format ${raw.schemaVersion}). Update the app to open it.`,
    };
  let doc: Record<string, unknown> = raw;
  for (let v = raw.schemaVersion; v < SCHEMA_VERSION; v++) {
    const step = SCHEMA_MIGRATIONS[v];
    if (!step) return { ok: false, error: `Cannot read design format ${raw.schemaVersion}.` };
    doc = step(doc);
  }

  // Everything except entities, order and groups must be valid as is.
  const shell = Design.safeParse({ ...doc, entities: {}, order: [], groups: {} });
  if (!shell.success) {
    const issue = shell.error.issues[0];
    return { ok: false, error: `The design file is damaged (${issue?.path.join('.')}: ${issue?.message}).` };
  }

  const warnings: string[] = [];
  const entities: Record<string, Entity> = {};
  const rawEntities = isObj(doc.entities) ? doc.entities : {};
  for (const [key, rawEntity] of Object.entries(rawEntities)) {
    const e = importEntity(key, rawEntity, catalog);
    if (e.kind === 'opaque' && !(isObj(rawEntity) && rawEntity.kind === 'opaque'))
      warnings.push(`"${e.name}" (${e.id}) could not be read and is kept unchanged: ${e.reason}`);
    entities[e.id] = e;
  }

  const rawOrder = Array.isArray(doc.order) ? doc.order.filter((id): id is string => typeof id === 'string') : [];
  const order = [...new Set(rawOrder.filter((id) => entities[id]))];
  for (const id of Object.keys(entities)) if (!order.includes(id)) order.push(id);
  if (order.length !== rawOrder.length || order.some((id, i) => rawOrder[i] !== id))
    warnings.push('the list of objects was repaired');

  const groups: Record<string, Group> = {};
  const grouped = new Set<string>();
  for (const g of Object.values(isObj(doc.groups) ? doc.groups : {})) {
    if (!isObj(g) || typeof g.id !== 'string' || !Array.isArray(g.members)) continue;
    const members = [
      ...new Set(g.members.filter((m): m is string => typeof m === 'string' && !!entities[m] && !grouped.has(m))),
    ];
    if (members.length >= 2 && members.length === g.members.length) {
      groups[g.id] = { id: g.id, members, ...(typeof g.name === 'string' ? { name: g.name } : {}) };
      members.forEach((m) => grouped.add(m));
    } else warnings.push(`group "${g.id}" referred to missing or already grouped objects and was removed`);
  }

  const design: Design = { ...shell.data, entities, order, groups };
  const problems = checkDesign(design, catalog);
  if (problems.length)
    return { ok: false, error: `The design file is inconsistent: ${problems.slice(0, 3).join('; ')}` };
  return { ok: true, design, warnings };
}

function importEntity(key: string, raw: unknown, catalog: CatalogRegistry): Entity {
  const parsed = Entity.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return opaque(key, raw, `invalid ${issue?.path.join('.') || 'entity'}: ${issue?.message}`);
  }
  const e = parsed.data;
  if (e.kind === 'opaque') return e;
  try {
    if (e.kind === 'part') {
      const t = template(catalog, e.template, 'part');
      return {
        ...e,
        template: { id: t.id, version: t.version },
        params: migrateParams(t, e.template.version, e.params),
      };
    }
    const t = template(catalog, e.template, 'unit');
    const unit = {
      ...e,
      template: { id: t.id, version: t.version },
      params: migrateParams(t, e.template.version, e.params),
      columns: e.columns.map((c) => ({
        ...c,
        items: c.items.map((i) => {
          const it = template(catalog, i.template, 'item');
          return {
            ...i,
            template: { id: it.id, version: it.version },
            params: migrateParams(it, i.template.version, i.params),
          };
        }),
      })),
      fronts: e.fronts.map((f) => {
        const ft = template(catalog, f.template, 'front');
        return {
          ...f,
          template: { id: ft.id, version: ft.version },
          params: migrateParams(ft, f.template.version, f.params),
        };
      }),
    };
    const problems = checkUnit(unit, catalog);
    if (problems.length) return opaque(key, raw, problems.slice(0, 2).join('; '));
    return unit;
  } catch (err) {
    return opaque(key, raw, err instanceof Error ? err.message : String(err));
  }
}

function template<K extends TemplateKind>(
  catalog: CatalogRegistry,
  ref: { id: string; version: number },
  kind: K,
): Extract<AnyTemplate, { kind: K }> {
  const t = catalog.get(ref.id);
  if (!t) throw new Error(`unknown template "${ref.id}"`);
  if (t.kind !== kind) throw new Error(`"${ref.id}" is not a ${kind} template`);
  if (ref.version > t.version) throw new Error(`"${ref.id}" version ${ref.version} is newer than this app`);
  return t as Extract<AnyTemplate, { kind: K }>;
}

function migrateParams(t: AnyTemplate, from: number, params: Record<string, unknown>): Record<string, unknown> {
  let p = params;
  for (let v = from; v < t.version; v++) {
    const step = t.migrate?.[v];
    if (!step) throw new Error(`no migration for "${t.id}" from version ${v}`);
    p = step(p);
  }
  const r = parseParams(t.params, {}, p);
  if (!r.ok) throw new Error(`${t.name}: ${r.error}`);
  return r.value;
}

function opaque(key: string, raw: unknown, reason: string): OpaqueEntity {
  const r = isObj(raw) ? raw : {};
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const pos = isObj(r.position) ? r.position : {};
  const size = isObj(r.size) ? r.size : isObj(r.bounds) ? r.bounds : {};
  const positive = (v: unknown) => Math.max(1, Math.min(100_000, num(v, 500)));
  return {
    kind: 'opaque',
    id: typeof r.id === 'string' && r.id ? r.id : key,
    name: typeof r.name === 'string' ? r.name.slice(0, 200) : 'Unknown object',
    position: { x: num(pos.x, 0), y: Math.max(0, num(pos.y, 0)), z: num(pos.z, 0) },
    rotation: num(r.rotation, 0),
    locked: r.locked === true,
    raw,
    reason: reason.slice(0, 500),
    bounds: { w: positive(size.w), h: positive(size.h), d: positive(size.d) },
  };
}
