# 04 — Catalog & templates

The catalog is the library of everything the user can place. Every entry is a **template**: a typed
parameter schema plus a pure build function. Templates are where most future growth happens ("add a
pull-out mirror"), so adding one must be cheap and safe.

## Template kinds

| Kind | Placed | Build input | Examples |
|---|---|---|---|
| `unit` | In the room | unit size, params, columns, fronts, materials | standard wardrobe frame, corner L frame, open shelving frame, top cabinet frame |
| `item` | In a unit column | the column's inner box + item params | shelf, rail, drawer, basket, trouser rack, shoe shelf, divider tray |
| `front` | On a unit's front | the covered rectangle + params | hinged door, double door, lift-up flap, sliding door, drawer front |
| `part` | In the room | params | panel, filler strip, plinth, cornice, loose shelf |
| `preset` | In the room | — | a ready-made unit document fragment: "Hinged wardrobe 1000", "Drawer unit 4", "Sliding wardrobe 1800" |

**Presets** replace v1's "variant" templates and pre-assembled wardrobes: a preset is just a stored unit
(size + columns + items + fronts) that is inserted via a normal `entity.add` op. The library shows presets
and templates side by side.

## Template definition

```ts
interface TemplateBase<P extends z.ZodTypeAny> {
  id: string;                    // 'item.drawer'
  version: number;               // bump on any change to schema or build output
  kind: 'unit' | 'item' | 'front' | 'part';
  name: string;
  category: Category;            // 'Wardrobes' | 'Cabinets' | 'Fronts' | 'Interior' | 'Panels' | 'Base & trim'
  description: string;           // one line, searchable
  tags: string[];                // search synonyms: 'closet', 'chest', 'kickboard'
  params: P;                     // zod schema with UI metadata (below)
  migrate?: Record<number, (old: unknown) => unknown>;  // from version N to N+1
  icon?: string;                 // generated thumbnail key
}

interface ItemTemplate<P> extends TemplateBase<P> {
  kind: 'item';
  height(params: z.infer<P>, ctx: ColumnContext): number;    // vertical space it occupies
  clearance?: { above?: number; below?: number };             // e.g. rail needs 50 mm above
  build(params: z.infer<P>, ctx: ColumnContext): PartDraft[];
}

interface ColumnContext {
  inner: { w: number; h: number; d: number };  // the column's inner box
  y: number;                                    // the item's y
  materials: ResolvedMaterials;                 // carcass/interior/front boards with thicknesses
  frontZone: number;                            // depth reserved in front (e.g. sliding tracks)
}
```

`PartDraft` is `Part` without `id`/`entity`; the engine assigns ids from a role path the build returns.

### Parameter schemas with UI metadata

Use small helpers so every param carries label, unit and limits once:

```ts
const drawer = defineItem({
  id: 'item.drawer', version: 1, name: 'Drawer', category: 'Interior',
  description: 'Drawer with box and runners; front inside the column or on the unit front.',
  tags: ['drawer', 'pull-out'],
  params: z.object({
    frontHeight: mm({ label: 'Height', min: 80, max: 600, default: 200 }),
    style: choice({ label: 'Front', options: { internal: 'Inside column', external: 'On unit front' }, default: 'external' }),
    handle: handleParam(),          // shared: none | knob | bar(length) | grip(hole|notch) | push
    runners: choice({ label: 'Runners', options: { side: 'Side-mounted', under: 'Undermount' }, default: 'under' }),
  }),
  height: (p) => p.frontHeight,
  build: (p, ctx) => drawerParts(p, ctx),
});
```

- `mm()`, `choice()`, `toggle()`, `count()`, `color()`, `materialRef()` return zod types annotated with
  metadata (`.describe()` + a side registry). From one schema we generate:
  - **validation** (core ops and file import),
  - **the properties form** (app renders controls from metadata: number with mm suffix, select or segmented control, toggle),
  - **the AI tool schema** (JSON Schema with labels as descriptions and enums as strings),
  - **defaults** for new instances.
- Enums are **strings** (`'left' | 'right'`), never numeric codes.

### Shared builders (`catalog/builders`)

Reusable, tested building blocks — templates compose these instead of hand-placing boxes:

- `carcass(size, construction, columns)` → sides, top, bottom, dividers, back (grooved or nailed), plinth.
- `hingedDoor(rect, hinge, handle)`, `flap(rect, handle)`, `slidingDoor(rect, track, handle)`, `drawerFront(rect, handle)`.
- `drawerBox(column, height, runners)` → sides, back, bottom + runner hardware.
- `handle(kind, placement)` → knob/bar/grip/push parts + hardware entries.
- `hingesFor(doorHeight)`, `runnerLength(depth)` — hardware rules in one place.

## Build pipeline (in `core/geometry`, using the registry)

```
buildEntity(entity, materials) →
  unit:  carcass parts
         + for each column: layout → for each item: template.build(params, columnCtx)
         + for each front: template.build(params, frontRectCtx)  (drawer fronts get the drawer's motion id)
         + validate: every part inside the unit's bounds (fronts/handles allowed in front zone), no NaN
  part:  template.build(params)
  opaque: one box from bounds, role 'invalid'
→ Part[] (with stable ids) — cached by (entity revision, template versions, materials revision)
```

A build that throws or produces invalid parts yields one `invalid` part and a check entry; it never
breaks the rest of the scene.

## Versioning and migration

- Every stored `TemplateRef` has the version it was created with.
- On load, `migrate` steps run from the stored version to the current one (`1 → 2 → 3`).
- **Changing a template's build output without bumping the version is a test failure**: each template has
  golden snapshots of its parts for its default params and two edge cases; a diff fails CI unless the version
  is bumped and the snapshot updated in the same change.
- Unknown template ids, or a version newer than the app knows, load as `OpaqueEntity` (03) and are saved back verbatim.

## Catalog-wide invariants (property tests over every template)

For random valid params (fast-check) and every handle/option combination:

1. All parts have finite, positive sizes.
2. All non-front, non-handle parts lie inside the entity's (or column's) box, within 0.01 mm.
3. No two board parts of the same entity intersect by more than 0.5 mm (closed state).
4. Every moving group has exactly one motion id; drawer fronts share the drawer box's motion.
5. Hinged fronts swing outward (+z); flaps lift up; sliding doors move only along x.
6. Every board part has a material and thickness; the cut list can classify it.
7. Build is deterministic: same input → byte-identical output.

## Launch catalog

| Category | Templates / presets |
|---|---|
| Wardrobes | presets: hinged wardrobe (1 or 2 doors, rail, top shelf), sliding-door wardrobe (2 or 3 doors), wardrobe with drawers |
| Cabinets | unit frames: standard, open shelving, corner L, top cabinet; presets: drawer unit, shoe cabinet, bookcase |
| Fronts | hinged door, double door, lift-up flap, sliding door, drawer front, glass door |
| Interior | shelf, adjustable shelf, hanging rail, pull-down rail, drawer, inner drawer, wire basket, trouser rack, shoe shelf, divider tray, tie/belt rack |
| Panels | panel, divider, filler strip, end panel, back panel |
| Base & trim | plinth, cornice, light strip (decorative), wall-mounting rail |

Search, categories and keywords behave as in F3.
