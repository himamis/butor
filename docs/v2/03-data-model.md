# 03 — Data model

The design document is plain JSON, validated by zod schemas in `core/schema`. It stores **intent**; all
geometry is derived (see 07 and 04).

## Design

```ts
interface Design {
  schemaVersion: 1;              // bumps with document-shape changes; migrations in core/migrate
  id: Id;                        // stable across saves and exports
  name: string;
  revision: number;              // increments on every committed transaction (used by AI rebase)
  room: Room;
  entities: Record<Id, Entity>;  // map for O(1) lookup and stable ids
  order: Id[];                   // creation/display order
  groups: Record<Id, Group>;     // explicit groups instead of a groupId field on entities
  materials: MaterialLibrary;    // materials used by this design (copied from defaults on first use)
  defaults: { carcass: MaterialId; front: MaterialId; back: MaterialId; interior: MaterialId; handle: MaterialId };
  meta: { createdAt: string; updatedAt: string; app: string };
}

type Id = string;                // 21-char url-safe random id (core/ids.ts; works without crypto.randomUUID)
```

## Room

```ts
interface Room {
  corners: Corner[];             // ≥ 3, counter-clockwise seen from above, no self-intersection
  height: number;                // ceiling, mm
  walls: Record<WallKey, Wall>;  // keyed by `${cornerIdA}-${cornerIdB}`
  openings: Opening[];
  obstacles: Obstacle[];
  floor: { finish: 'color' | 'planks' | 'chevron' | 'herringbone' | 'tiles' | 'concrete'; color: Hex; rotation: 0 | 90 };
  wallColor: Hex;
}
interface Corner { id: Id; x: number; z: number }
interface Wall { thickness: number; color?: Hex }
interface Opening {
  id: Id; wall: WallKey; kind: 'door' | 'window' | 'passage';
  offset: number;                // from the wall's first corner along the wall, mm
  width: number; height: number; sill: number;   // sill = 0 for doors
  swing?: { side: 'left' | 'right'; inward: boolean };  // doors: used by clearance checks
}
interface Obstacle {
  id: Id; kind: 'column' | 'beam' | 'radiator' | 'skirting' | 'box';
  // axis-aligned box in room coordinates; skirting is generated along walls from {height, depth}
  min: Vec3; max: Vec3;
  label?: string;
}
```

Columns from v1 become `Obstacle{kind:'column'}` spanning floor to ceiling.

## Entities

```ts
type Entity = Unit | FreePart | OpaqueEntity;

interface Placement {
  position: Vec3;                // bottom-centre in room coordinates, mm
  rotation: number;              // degrees about +y; 0, 90, 180, 270 get exact axis-aligned maths
  locked: boolean;
  name: string;
}

interface Unit extends Placement {
  kind: 'unit';
  id: Id;
  template: TemplateRef;         // e.g. { id: 'unit.standard', version: 2 }
  params: Record<string, unknown>; // validated by the template's schema (see 04)
  size: { w: number; h: number; d: number };
  materials: Partial<{ carcass: MaterialId; back: MaterialId; interior: MaterialId; front: MaterialId }>;
  columns: Column[];             // left → right as seen from the front
  fronts: Front[];
}

interface Column {
  id: Id;
  width: number | 'auto';       // inner width; 'auto' columns share what fixed columns leave
  items: Item[];                 // sorted by y
}

interface Item {
  id: Id;
  template: TemplateRef;         // 'item.shelf', 'item.rail', 'item.drawer', 'item.basket', …
  y: number;                     // bottom of the item above the column floor (top of the unit bottom panel), mm
  params: Record<string, unknown>;
  material?: MaterialId;
}

interface Front {
  id: Id;
  template: TemplateRef;         // 'front.door', 'front.flap', 'front.sliding', 'front.drawer'
  columns: [first: number, last: number];  // inclusive column index range it covers
  y: [bottom: number, top: number];        // height range, mm from the unit's floor (0 = unit bottom edge)
  params: Record<string, unknown>;         // hinge side, handle, gap, track, …
  drawer?: Id;                   // for 'front.drawer': the item it moves with
  material?: MaterialId;
}

interface FreePart extends Placement {
  kind: 'part';
  id: Id;
  template: TemplateRef;         // 'part.panel', 'part.filler', 'part.plinth', 'part.cornice', …
  params: Record<string, unknown>;
  material?: MaterialId;
}

/** An entity whose template is unknown (newer file, removed template). Kept verbatim, shown as a box. */
interface OpaqueEntity extends Placement {
  kind: 'opaque';
  id: Id;
  raw: unknown;                  // the original JSON, written back unchanged on save
  bounds: { w: number; h: number; d: number };  // best effort from raw, for display and collisions
}

interface Group { id: Id; members: Id[]; name?: string }
interface TemplateRef { id: string; version: number }
```

### Structural invariants (checked by `core/schema` + ops; violating ops are refused)

1. Column inner widths: fixed widths + dividers ≤ unit inner width; auto columns get ≥ their minimum.
2. Items stay inside their column: `0 ≤ y` and `y + itemHeight ≤ column inner height`.
3. Items in a column do not overlap each other (by their height ranges plus template clearances).
4. Fronts on one unit do not overlap (column range × height range), and stay within the unit's front.
5. A `front.drawer` references an existing `item.drawer` in a covered column, and vice versa for external drawers.
6. Group members exist and are not locked into two groups.
7. Ids are unique across the document.

### Reflow on resize (performed by the `unit.resize` op, see 05)

- Width: auto columns absorb the change; if none, the right-most column does (and becomes the user's to fix if it hits minimum → op refused with message).
- Height: items keep their `y`; items that no longer fit are clamped to the highest free position, or the op is refused if that is impossible. Fronts spanning to the top are stretched with the unit (a front whose `y[1]` equals the old height follows the new height).
- Depth: items and fronts adapt through their build functions (depth is read from the column context).

## Materials

```ts
interface MaterialLibrary { [id: MaterialId]: Material }
type Material = Board | Finish;

interface Board {
  kind: 'board';
  name: string;                  // "Oak veneer MDF"
  thicknesses: number[];         // available, mm (e.g. [8, 18, 25])
  appearance: { color: Hex; texture?: 'woodgrain' | 'chevron' | 'plain'; roughness: number };
  grain: 'none' | 'length';      // whether parts must be cut with length along the grain
  price: { perM2: number; currency: string };
  edgeBanding?: { name: string; perM: number };
}

interface Finish {
  kind: 'finish';                // metal, plastic, glass for handles, rails, hardware
  name: string;
  appearance: { color: Hex; metalness: number; roughness: number };
}
```

Parts carry `board + thickness` (e.g. `{ material: 'oak-mdf', thickness: 18 }`); the cut list never
guesses thickness from dimensions.

## Derived: parts (not stored)

```ts
interface Part {
  id: string;                    // stable path: `${entityId}/${role path}`, e.g. "u1/col:c2/item:i3/side-left"
  entity: Id;
  label: string;                 // "Drawer side"
  role: 'carcass' | 'back' | 'divider' | 'shelf' | 'front' | 'drawer-box' | 'rail' | 'handle' | 'hardware' | 'trim';
  shape: { kind: 'box'; size: Vec3 }
       | { kind: 'cylinder'; axis: 'x' | 'y' | 'z'; radius: number; length: number }
       | { kind: 'extrusion'; outline: Vec2[]; holes: Vec2[][]; depth: number };  // fronts with cutouts
  local: Transform;              // relative to the entity's placement
  material: { id: MaterialId; thickness?: number };
  grainAlong?: 'x' | 'y' | 'z';  // which local axis is "length" for the cut list
  banding?: { front?: boolean; back?: boolean; left?: boolean; right?: boolean };
  motion?: Motion;               // shared by all parts that move together
  hardware?: { name: string; sku?: string };   // counted in the hardware list
  invalid?: string;              // set when the build failed (rendered as an error box)
}

type Motion =
  | { id: string; kind: 'hinge'; axis: 'y' | 'x'; pivot: Vec3; angle: number }   // 'x' = lift-up flaps
  | { id: string; kind: 'slide'; offset: Vec3 };
```

v1 → v2 mapping is in [11-roadmap.md](11-roadmap.md#v1-import).
