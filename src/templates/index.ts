import type { ParamDef, TemplateDef } from '../types';
import { sidePanel } from './sidePanel';
import { horizontalPanel } from './horizontalPanel';
import { backPanel } from './backPanel';
import { rail } from './rail';
import { door } from './door';
import { drawer } from './drawer';
import { carcass } from './carcass';
import { carcassDoors } from './carcassDoors';
import { slidingWardrobe, wardrobe } from './wardrobes';
import { cornerUnit, drawerUnit, openShelving, shoeCabinet, topCabinet } from './cabinets';
import { slidingDoor } from './slidingDoor';
import { innerDrawers, pullOutBasket, shelfRail, shoeShelf, trouserRack } from './interior';
import { cornice, filler, plinth } from './trim';
import { CATEGORIES, matchesQuery } from './categories';
import type { Category } from '../types';

export { CATEGORIES };

/** Template library. To add a template: create a file in this folder and list it here. */
export const TEMPLATES: TemplateDef[] = [
  // Wardrobes
  wardrobe, slidingWardrobe,
  // Cabinets
  carcass, carcassDoors, drawerUnit, topCabinet, shoeCabinet, openShelving, cornerUnit,
  // Fronts
  door, drawer, slidingDoor,
  // Interior
  rail, shelfRail, innerDrawers, pullOutBasket, trouserRack, shoeShelf,
  // Panels
  sidePanel, horizontalPanel, backPanel, filler,
  // Base & trim
  plinth, cornice,
];

/** Templates matching a free-text query (all words must match), optionally within one category. */
export function searchTemplates(query: string, category: Category | null = null): TemplateDef[] {
  return TEMPLATES.filter((t) => (!category || t.category === category) && matchesQuery(t, query));
}

const byId = new Map(TEMPLATES.map((t) => [t.id, t]));

export function hasTemplate(id: string): boolean {
  return byId.has(id);
}

export function getTemplate(id: string): TemplateDef {
  const t = byId.get(id);
  if (!t) throw new Error(`Unknown template: ${id}`);
  return t;
}

export function defaultParams(t: TemplateDef): Record<string, number> {
  return Object.fromEntries(t.params.map((p) => [p.key, p.default]));
}

/** NaN → default, then clamp to [min, max]. */
export function clampParam(def: ParamDef, v: number): number {
  if (!Number.isFinite(v)) return def.default;
  return Math.min(def.max, Math.max(def.min, v));
}
