import type { Unit } from '../schema/entities';
import type { CatalogRegistry, UnitLayout } from './types';

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

const REVEAL = 10; // mm a drawer front extends past its box, above and below, where nothing else is in the way

/**
 * The height span of a new front for an external drawer in column `ci` (from the unit's bottom edge): the
 * drawer box plus a reveal, cut back where it would meet an existing front over the same column.
 */
export function drawerFrontSpan(
  u: Unit,
  ci: number,
  layout: UnitLayout,
  drawer: { y: number; height: number },
): [number, number] | null {
  const box0 = layout.floorY + drawer.y;
  const box1 = box0 + drawer.height;
  let y0 = Math.max(0, box0 - REVEAL);
  let y1 = Math.min(u.size.h, box1 + REVEAL);
  for (const f of u.fronts) {
    if (ci < f.columns[0] || ci > f.columns[1]) continue;
    if (f.y[1] > y0 && f.y[0] < box0 + 1) y0 = Math.max(y0, f.y[1]); // a front below
    if (f.y[0] < y1 && f.y[1] > box1 - 1) y1 = Math.min(y1, f.y[0]); // a front above
  }
  return y1 - y0 >= drawer.height / 2 ? [Math.round(y0), Math.round(y1)] : null;
}
