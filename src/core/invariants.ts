import type { CatalogRegistry, ItemTemplate, UnitLayout, UnitTemplate } from './catalog/types';
import { isSimplePolygon } from './geometry/polygon';
import type { Design } from './schema/design';
import type { Unit } from './schema/entities';
import { wallKey } from './schema/room';

/**
 * Structural invariants of a design (docs/v2/03-data-model.md). Returns readable problems; empty = valid.
 * Operations run this after every op and refuse changes that would break it.
 */
export function checkDesign(d: Design, catalog: CatalogRegistry): string[] {
  const problems: string[] = [];
  checkIds(d, problems);
  checkOrder(d, problems);
  checkGroups(d, problems);
  checkRoom(d, problems);
  for (const e of Object.values(d.entities)) if (e.kind === 'unit') problems.push(...checkUnit(e, catalog));
  return problems;
}

function checkIds(d: Design, out: string[]) {
  const seen = new Set<string>();
  const add = (id: string) => {
    if (seen.has(id)) out.push(`duplicate id "${id}"`);
    seen.add(id);
  };
  for (const [key, e] of Object.entries(d.entities)) {
    if (key !== e.id) out.push(`entity stored under "${key}" has id "${e.id}"`);
    add(e.id);
    if (e.kind === 'unit') {
      for (const c of e.columns) {
        add(c.id);
        for (const i of c.items) add(i.id);
      }
      for (const f of e.fronts) add(f.id);
    }
  }
  for (const g of Object.values(d.groups)) add(g.id);
  for (const c of d.room.corners) add(c.id);
  for (const o of d.room.openings) add(o.id);
  for (const o of d.room.obstacles) add(o.id);
}

function checkOrder(d: Design, out: string[]) {
  const ids = Object.keys(d.entities);
  if (
    d.order.length !== ids.length ||
    new Set(d.order).size !== d.order.length ||
    d.order.some((id) => !d.entities[id])
  ) {
    out.push('order must list every entity exactly once');
  }
}

function checkGroups(d: Design, out: string[]) {
  const owner = new Map<string, string>();
  for (const [key, g] of Object.entries(d.groups)) {
    if (key !== g.id) out.push(`group stored under "${key}" has id "${g.id}"`);
    if (new Set(g.members).size < 2) out.push(`group "${g.id}" needs at least two different members`);
    for (const m of g.members) {
      if (!d.entities[m]) out.push(`group "${g.id}" refers to missing entity "${m}"`);
      const other = owner.get(m);
      if (other && other !== g.id) out.push(`entity "${m}" is in more than one group`);
      owner.set(m, g.id);
    }
  }
}

function checkRoom(d: Design, out: string[]) {
  const { corners, walls, openings, height } = d.room;
  if (!isSimplePolygon(corners)) out.push('room walls must not self-intersect (and need 3+ distinct corners)');
  const expected = new Map<string, number>();
  corners.forEach((c, i) => {
    const n = corners[(i + 1) % corners.length]!;
    expected.set(wallKey(c.id, n.id), Math.hypot(n.x - c.x, n.z - c.z));
  });
  for (const key of expected.keys()) if (!walls[key]) out.push(`missing wall ${key}`);
  for (const key of Object.keys(walls)) if (!expected.has(key)) out.push(`wall ${key} does not match a room edge`);
  for (const o of openings) {
    const len = expected.get(o.wall);
    if (len === undefined) out.push(`opening "${o.id}" is on a wall that does not exist`);
    else if (o.offset + o.width > len + 1e-6)
      out.push(`opening "${o.id}" extends beyond the wall (${Math.round(len)} mm)`);
    if (o.sill + o.height > height + 1e-6) out.push(`opening "${o.id}" is taller than the room`);
  }
}

/** Unit-level invariants: layout builds, items fit and do not overlap, fronts fit and do not overlap. */
export function checkUnit(u: Unit, catalog: CatalogRegistry): string[] {
  const out: string[] = [];
  const t = catalog.get(u.template.id);
  if (!t || t.kind !== 'unit') return [`unit "${u.id}": "${u.template.id}" is not a unit template`];
  const layout = unitLayout(u, t, catalog);
  if ('error' in layout) return [`unit "${u.id}": ${layout.error}`];

  u.columns.forEach((col, ci) => {
    const spans: { id: string; from: number; to: number }[] = [];
    for (const item of col.items) {
      const it = catalog.get(item.template.id);
      if (!it || it.kind !== 'item') {
        out.push(`item "${item.id}": "${item.template.id}" is not an item template`);
        continue;
      }
      const h = (it as ItemTemplate).height(item.params, { layout, column: ci });
      if (item.y + h > layout.inner.h + 1e-6)
        out.push(`item "${item.id}" in column ${ci + 1} reaches above the top of the column`);
      spans.push({ id: item.id, from: item.y, to: item.y + h });
    }
    spans.sort((a, b) => a.from - b.from);
    for (let i = 1; i < spans.length; i++) {
      const a = spans[i - 1]!,
        b = spans[i]!;
      if (a.to > b.from + 1e-6) out.push(`items "${a.id}" and "${b.id}" overlap in column ${ci + 1}`);
    }
  });

  const n = u.columns.length;
  u.fronts.forEach((f, i) => {
    const [c0, c1] = f.columns;
    if (c0 > c1 || c1 >= n) out.push(`front "${f.id}" covers column ${c1 + 1}, but the unit has ${n}`);
    if (f.y[0] >= f.y[1]) out.push(`front "${f.id}" has no height`);
    if (f.y[1] > u.size.h + 1e-6) out.push(`front "${f.id}" reaches above the unit`);
    const ft = catalog.get(f.template.id);
    if (!ft || ft.kind !== 'front') out.push(`front "${f.id}": "${f.template.id}" is not a front template`);
    if (f.drawer) {
      const inCovered = u.columns.slice(c0, c1 + 1).some((c) => c.items.some((it) => it.id === f.drawer));
      if (!inCovered) out.push(`front "${f.id}" moves with drawer "${f.drawer}", which is not in a column it covers`);
    }
    for (const g of u.fronts.slice(i + 1)) {
      const colsOverlap = f.columns[0] <= g.columns[1] && g.columns[0] <= f.columns[1];
      const ysOverlap = f.y[0] < g.y[1] - 1e-6 && g.y[0] < f.y[1] - 1e-6;
      if (colsOverlap && ysOverlap) out.push(`fronts "${f.id}" and "${g.id}" overlap`);
    }
  });
  return out;
}

export function unitLayout(u: Unit, t: UnitTemplate, catalog: CatalogRegistry): UnitLayout | { error: string } {
  const trackFronts = u.fronts.some((f) => {
    const ft = catalog.get(f.template.id);
    return ft?.kind === 'front' && ft.mount === 'track';
  });
  try {
    return t.layout(u, { trackFronts });
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
