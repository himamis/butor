import type { Unit } from '../schema/entities';
import type { CatalogRegistry, ItemTemplate, UnitLayout } from './types';

export interface Span {
  id: string;
  from: number;
  to: number;
}

/** Vertical spans the items of column `ci` occupy (from the column floor), bottom first. */
export function columnSpans(u: Unit, ci: number, layout: UnitLayout, catalog: CatalogRegistry): Span[] {
  return (u.columns[ci]?.items ?? [])
    .map((i) => {
      const t = catalog.get(i.template.id);
      const h = t?.kind === 'item' ? t.height(i.params, { layout, column: ci }) : 0;
      return { id: i.id, from: i.y, to: i.y + h };
    })
    .sort((a, b) => a.from - b.from);
}

/** The lowest height where an item `height` tall fits between `spans` in a column `innerH` tall, or null. */
export function freeSpot(spans: Span[], height: number, innerH: number): number | null {
  let y = 0;
  for (const s of spans) {
    if (s.from - y >= height) return Math.round(y);
    y = Math.max(y, s.to);
  }
  return innerH - y >= height ? Math.ceil(y) : null;
}

const REVEAL = 10; // mm an attached front extends past its item, above and below, where nothing else is in the way

/**
 * The height span of a new front for an item in column `ci` (from the unit's bottom edge): the item plus a
 * reveal, cut back where it would meet an existing front over the same column.
 */
export function itemFrontSpan(
  u: Unit,
  ci: number,
  layout: UnitLayout,
  item: { y: number; height: number },
): [number, number] | null {
  const box0 = layout.floorY + item.y;
  const box1 = box0 + item.height;
  let y0 = Math.max(0, box0 - REVEAL);
  let y1 = Math.min(u.size.h, box1 + REVEAL);
  for (const f of u.fronts) {
    if (ci < f.columns[0] || ci > f.columns[1]) continue;
    if (f.y[1] > y0 && f.y[0] < box0 + 1) y0 = Math.max(y0, f.y[1]); // a front below
    if (f.y[0] < y1 && f.y[1] > box1 - 1) y1 = Math.min(y1, f.y[0]); // a front above
  }
  return y1 - y0 >= item.height / 2 ? [Math.round(y0), Math.round(y1)] : null;
}

export interface FrontSlot {
  item: string; // item id
  column: number; // column index
  y: number; // item bottom above the column floor
  height: number;
}

/** Items that take a front (per their template) and have none yet, bottom first within each column. */
export function freeFrontItems(u: Unit, layout: UnitLayout, catalog: CatalogRegistry): FrontSlot[] {
  return u.columns.flatMap((c, ci) =>
    c.items
      .filter((i) => {
        const t = catalog.get(i.template.id);
        return t?.kind === 'item' && !!t.takesFront?.(i.params) && !u.fronts.some((f) => f.item === i.id);
      })
      .map((i) => {
        const t = catalog.get(i.template.id) as ItemTemplate;
        return { item: i.id, column: ci, y: i.y, height: t.height(i.params, { layout, column: ci }) };
      })
      .sort((a, b) => a.y - b.y),
  );
}

/** Names of the item templates that can take a front (for messages). */
export function frontTakingItems(catalog: CatalogRegistry): string[] {
  return catalog
    .all()
    .filter((t) => t.kind === 'item' && t.takesFront)
    .map((t) => t.name.toLowerCase());
}

/**
 * A free height span (from the unit's bottom edge) for a new front over columns [c0, c1]: the one containing
 * `at` when given, otherwise the tallest. Null when there is none.
 */
export function freeFrontSpan(u: Unit, columns: [number, number], at?: number): [number, number] | null {
  const [c0, c1] = columns;
  const covering = u.fronts.filter((f) => f.columns[0] <= c1 && c0 <= f.columns[1]).map((f) => f.y);
  const edges = [0, u.size.h, ...covering.flat()].sort((a, b) => a - b);
  let best: [number, number] | null = null;
  for (let i = 0; i < edges.length - 1; i++) {
    const a = edges[i]!;
    const b = edges[i + 1]!;
    if (b <= a || covering.some(([c, d]) => c < b && a < d)) continue;
    if (at !== undefined) {
      if (at >= a && at <= b) return [a, b];
    } else if (!best || b - a > best[1] - best[0]) best = [a, b];
  }
  return at === undefined ? best : null;
}
