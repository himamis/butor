# 11 — Roadmap

Build in this order. Each milestone ends with its exit criteria met and CI green. Core comes before UI so
rules are settled before anything depends on them.

## M0 — Skeleton & tooling
- Repo layout from 02, TypeScript strict, ESLint, Prettier, dependency-cruiser rules.
- Vitest + fast-check; Playwright with SwiftShader, test hooks, `butor.test` insecure-origin project.
- Node server (Hono) with static hosting and `/api/health`; `npm run dev` runs Vite + server.
- GitHub Actions with the three jobs (perf job may be a stub).

**Exit:** empty app shell renders in CI on both origins; a failing boundary import fails CI.

## M1 — Document, schemas, operations, history
- zod schemas for Design, Room, entities, materials (03); ids; schema migration framework.
- Op set (05) incl. structural invariants, strict/partial modes, inverses, rebase.
- History with preview/commit.

**Exit:** property tests: inverse round-trip for every op, atomicity, invariants under random op sequences.

## M2 — Catalog & geometry engine
- Template system with param helpers, registry, versioning + golden snapshots (04).
- Shared builders: carcass, doors, flap, sliding door, drawer box, handles, hardware rules.
- Launch catalog (04) + presets.
- `buildScene` with per-entity caching, invalid-entity handling; collisions; checks (overlap, door swing,
  drawer pull-out, ceiling, openings); cut list, hardware list, cost.

**Exit:** catalog invariants pass for all templates; reference design cut list snapshot; check tests.

## M3 — Renderer
- Instanced rendering by material, outlines, room, floor textures (incl. chevron, herringbone, rotation).
- On-demand frame loop, animation store, motion/explode transforms, shadow updates on change.
- Picking with part ids and face normals; views (3D, ortho, wall elevation, frame selection).

**Exit:** 100-unit fixture meets draw-call and idle budgets; visual baselines recorded.

## M4 — Interaction
- Input controller, tool interface, shortcut registry, camera arbitration.
- Select (click, shift, marquee, drill-down), move by dragging, rotate, face-handle resize, item dragging.
- Snapping engine with guides; `Alt` override.
- Place tool (library drag with ghost, drop into room or column).

**Exit:** e2e flows 1–3 and 6 pass.

## M5 — Room editing
- Room edit tool: corners, walls, thickness; openings; obstacles; floor/wall finishes.

**Exit:** e2e flow 4 passes.

## M6 — Application UI
- Shell, library (search, chips, sections, presets), properties panel generated from schemas, unit editor
  (columns/items/fronts), materials panel, checks panel, start screen with design list, error boundaries.

**Exit:** every template is editable without custom UI code; error containment e2e passes.

## M7 — Outputs, persistence, sharing
- IndexedDB repository, autosave, import/export with migrations and opaque entities.
- Share links + viewer route; print sheet (SVG elevations + tables), CSV exports.
- Measure tool (also in viewer).

**Exit:** e2e flows 5, 7, 8, 9 pass.

## M8 — AI assistant
- Server route with streaming, provider adapters, security measures, generated tool schema and prompt.
- Chat UI, settings, rebase/conflict handling.

**Exit:** e2e flow 10 passes; security tests pass; manual check with a real Anthropic key and a local model.

## M9 — Hardening
- Performance budgets on all fixtures; accessibility pass (focus, labels, contrast); copy edits;
  user help page generated from shortcuts and catalog.

**Exit:** all budgets green; full e2e suite green on both origins.

## v1 import

v2 imports v1 files (`version: 1` designs from this repository) through a one-way migration:

| v1 | v2 |
|---|---|
| `room.points` | `corners` with generated ids; `walls` with `wallThickness` for each |
| `room.columns[]` | `obstacles[]` with `kind: 'column'`, floor to ceiling |
| `floorKind` `wood` | `floor.finish: 'planks'` (others map by name) |
| `carcass`, `carcass-doors`, `wardrobe`, `sliding-wardrobe`, `drawer-unit`, `top-cabinet`, `shoe-cabinet`, `open-shelving` | `Unit` with columns/items/fronts reconstructed from their params |
| `corner-unit` | `Unit` with template `unit.corner` |
| Free `drawer`, `door`, `rail`, `shelf-rail`, interior items placed inside a unit's bounds | moved into that unit's column as items/fronts when they fit exactly; otherwise kept as free parts and listed in a "check these" warning |
| `side-panel`, `horizontal-panel`, `back-panel`, `filler`, `plinth`, `cornice` | `FreePart` with matching templates |
| `groupId` | `groups` |
| Numeric options (`hinge: 0/1`, `handle: 0–3`) | string enums |
| `color` / `doorColor` | design materials (a board per distinct colour) |

A v1 reference design set (from this repository's smoke fixtures) is part of the migration tests.
