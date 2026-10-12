import type { ParamsSchema } from './params';
import type { Unit } from '../schema/entities';

export type TemplateKind = 'unit' | 'item' | 'front' | 'part';
export type Category = 'Wardrobes' | 'Cabinets' | 'Fronts' | 'Interior' | 'Panels' | 'Base & trim';

export interface TemplateBase {
  id: string;
  version: number;
  kind: TemplateKind;
  name: string;
  category: Category;
  description: string;
  tags: string[];
  params: ParamsSchema;
  /** Migrations from version N (key) to N + 1. */
  migrate?: Record<number, (params: Record<string, unknown>) => Record<string, unknown>>;
}

/** Where a unit's columns are, computed by its template from size, params and columns. Unit-local mm. */
export interface UnitLayout {
  inner: { w: number; h: number; d: number }; // between sides, between bottom and top, behind the front zone
  floorY: number; // column floor (top of the bottom panel) above the unit's bottom edge
  innerZ: [back: number, front: number]; // interior depth range (local z)
  columns: { x0: number; width: number }[]; // inner x ranges, left → right (local x, unit spans −w/2…w/2)
  dividerThickness: number;
}

export interface UnitTemplate extends TemplateBase {
  kind: 'unit';
  minColumnWidth: number;
  /** Computes the layout, or explains why the unit's structure cannot be built. */
  layout(unit: Unit): UnitLayout | { error: string };
  sizeLimits: { w: [number, number]; h: [number, number]; d: [number, number] };
  defaultSize: { w: number; h: number; d: number };
}

export interface ItemContext {
  layout: UnitLayout;
  column: number;
}

export interface ItemTemplate extends TemplateBase {
  kind: 'item';
  /** Vertical space the item occupies in its column, mm. */
  height(params: Record<string, unknown>, ctx: ItemContext): number;
  clearance?: { above?: number; below?: number };
}

export interface FrontTemplate extends TemplateBase {
  kind: 'front';
  /** Minimum size of the covered rectangle. */
  minSize: { w: number; h: number };
}

export interface PartTemplate extends TemplateBase {
  kind: 'part';
  size(params: Record<string, unknown>): { w: number; h: number; d: number };
}

export type AnyTemplate = UnitTemplate | ItemTemplate | FrontTemplate | PartTemplate;

export interface CatalogRegistry {
  get(id: string): AnyTemplate | undefined;
  all(): AnyTemplate[];
}

export function createRegistry(templates: AnyTemplate[]): CatalogRegistry {
  const byId = new Map<string, AnyTemplate>();
  for (const t of templates) {
    if (byId.has(t.id)) throw new Error(`Duplicate template id ${t.id}`);
    byId.set(t.id, t);
  }
  return { get: (id) => byId.get(id), all: () => [...byId.values()] };
}
