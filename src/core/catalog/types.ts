import type { ParamsSchema } from './params';
import type { Unit } from '../schema/entities';
import type { Motion, PartDraft } from '../geometry/part';

/** Material ids a build should use, resolved from the entity, then the design defaults. */
export interface ResolvedMaterials {
  carcass: string;
  back: string;
  interior: string;
  front: string;
  handle: string;
}

export type TemplateKind = 'unit' | 'item' | 'front' | 'part';
export type Category = 'Wardrobes' | 'Cabinets' | 'Fronts' | 'Interior' | 'Panels' | 'Base & trim';

export interface TemplateBase {
  id: string;
  kind: TemplateKind;
  name: string;
  category: Category;
  description: string;
  tags: string[];
  params: ParamsSchema;
}

/** Where a unit's columns are, computed by its template from size, params and columns. Unit-local mm. */
export interface UnitLayout {
  inner: { w: number; h: number; d: number }; // between sides, between bottom and top, behind the front zone
  floorY: number; // column floor (top of the bottom panel) above the unit's bottom edge
  innerZ: [back: number, front: number]; // interior depth range (local z)
  columns: { x0: number; width: number }[]; // inner x ranges, left → right (local x, unit spans −w/2…w/2)
  dividerThickness: number;
  /** Depth range in front of the interior reserved for fronts on tracks (sliding doors), if any. */
  trackZone?: [back: number, front: number];
}

/** Facts about a unit's contents the layout needs but cannot know without the catalog. */
export interface LayoutHints {
  trackFronts: boolean; // the unit has fronts on tracks (sliding doors) → reserve a track zone
}

export interface UnitTemplate extends TemplateBase {
  kind: 'unit';
  minColumnWidth: number;
  /** Computes the layout, or explains why the unit's structure cannot be built. */
  layout(unit: Unit, hints: LayoutHints): UnitLayout | { error: string };
  sizeLimits: { w: [number, number]; h: [number, number]; d: [number, number] };
  defaultSize: { w: number; h: number; d: number };
  /** Carcass parts: sides, top, bottom, dividers, back, base. Items and fronts are built by their templates. */
  build(unit: Unit, layout: UnitLayout, materials: ResolvedMaterials): PartDraft[];
}

export interface ItemContext {
  layout: UnitLayout;
  column: number;
}

/** Everything an item build needs: its column's box (unit-local mm) and where the item sits. */
export interface ItemBuildContext extends ItemContext {
  id: string; // item id (motion ids derive from it)
  x0: number; // column inner left edge
  width: number; // column inner width
  y: number; // item bottom, unit-local (column floor + item.y)
  innerZ: [back: number, front: number];
  thickness: number; // interior board thickness
  materials: ResolvedMaterials;
}

/** A front's covered rectangle (unit-local, gaps already applied) and mounting depth. */
export interface FrontBuildContext {
  id: string; // front id (motion ids derive from it)
  rect: { x0: number; x1: number; y0: number; y1: number };
  z: number; // overlay fronts: their back face sits here (the carcass front edge)
  trackZone?: [back: number, front: number];
  itemMotion?: Motion; // attaching fronts move with their item
  unit: { w: number; h: number; d: number }; // to tell outer edges from shared ones
  opening: { x0: number; x1: number; y0: number; y1: number }; // the carcass's inner opening (between sides, bottom and top)
  materials: ResolvedMaterials;
}

export interface ItemTemplate extends TemplateBase {
  kind: 'item';
  /** Vertical space the item occupies in its column, mm. */
  height(params: Record<string, unknown>, ctx: ItemContext): number;
  /** Whether the item, with these params, carries a front on the unit face that moves with it (e.g. an external drawer). */
  takesFront?(params: Record<string, unknown>): boolean;
  clearance?: { above?: number; below?: number };
  build(params: Record<string, unknown>, ctx: ItemBuildContext): PartDraft[];
}

export interface FrontTemplate extends TemplateBase {
  kind: 'front';
  /** Minimum size of the covered rectangle. */
  minSize: { w: number; h: number };
  /** overlay: in front of the carcass; track: inside a track zone at the front (sliding doors). */
  mount: 'overlay' | 'track';
  /** The front belongs to one item that takes a front (it names it in `item`) and moves with it instead of opening on its own. */
  attachesToItem?: boolean;
  build(params: Record<string, unknown>, ctx: FrontBuildContext): PartDraft[];
}

export interface PartTemplate extends TemplateBase {
  kind: 'part';
  size(params: Record<string, unknown>): { w: number; h: number; d: number };
  /** Parts centred on the entity origin (x/z) with the bottom at y = 0. */
  build(params: Record<string, unknown>, materials: ResolvedMaterials): PartDraft[];
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
