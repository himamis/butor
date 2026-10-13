# 02 — Architecture

## Principles

1. **Pure core.** Everything that decides *what the design is* (schemas, operations, geometry, snapping,
   checks, cut list) is pure TypeScript with no DOM, no three.js, no React. It runs identically in the
   browser, on the server (AI) and in tests.
2. **Derived, not stored.** The document stores intent (a unit with columns, items, fronts). Parts,
   bounds, collisions and lists are derived and cached.
3. **One mutation path.** Nothing changes the document except `applyTransaction` in core.
4. **Schemas generate the rest.** zod schemas drive validation, UI forms and AI tool schemas.
5. **Render is a projection.** The renderer reads the derived scene model and draws it; it owns no design state.
6. **Explicit interaction.** One input controller routes pointer/keyboard input to one active tool.

## Modules

```
src/
  core/            pure: no DOM, no three, no React
    schema/        zod schemas: design, room, entities, materials, ops
    catalog/       template system (registry, param schema helpers, build context) — not the templates themselves
    ops/           applyTransaction, invert, validate, rebase
    geometry/      buildScene (parts + world transforms), bounds, collisions, clearances
    snapping/      snap candidates + query
    checks/        overlap, door swing, drawer pull-out, ceiling, openings
    outputs/       cut list, hardware list, cost, print-sheet data
    ids.ts         id generation (insecure-context safe)
  catalog/         the templates (units, items, fronts, free parts), materials library defaults
  render/          three.js scene from the derived scene model; instancing; picking; animation; overlays
  interaction/     input controller, tools, shortcut registry, camera control arbitration
  app/             React UI: shell, panels (library, properties, unit editor, checks, outputs, chat), stores
  viewer/          read-only shell (reuses render + interaction with a restricted tool set)
  persistence/     IndexedDB repository, files, share links
  ai/              client side of the assistant (chat UI state, request/response types)
server/            Node server: static hosting + /api/ai; uses core + catalog
e2e/               Playwright tests, fixtures, visual baselines
```

### Dependency rules (enforced by `dependency-cruiser` in CI)

| Module | May import |
|---|---|
| `core` | `zod` only |
| `catalog` | `core` |
| `render` | `core`, `catalog`, `three` |
| `interaction` | `core`, `render` (picking API only) |
| `persistence` | `core` |
| `app`, `viewer` | everything above + React |
| `server` | `core`, `catalog`, provider SDKs |

`core` importing anything else is a build failure. This is what keeps geometry and rules testable and
shareable with the server.

## Stack

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript, `strict`, `noUncheckedIndexedAccess` | Catch index/undefined bugs early |
| Build | Vite | Fast dev server, simple config |
| UI | React 19 | Mature; team familiarity |
| 3D | three.js; react-three-fiber **only for the canvas shell and overlays** | The heavy scene is managed imperatively (see 07) |
| UI state | zustand (small stores per concern) | Simple, no boilerplate |
| Schemas | zod + zod-to-json-schema | One source for validation, forms and AI tool schemas |
| Storage | IndexedDB via `idb` | Multiple designs, larger quota than localStorage |
| Compression | `CompressionStream('deflate-raw')` with a pure-JS fallback | Share links |
| Server | Node 22 + Hono | Small, typed, runs in dev (Vite proxy) and production |
| AI | `@anthropic-ai/sdk` (default provider) + fetch for OpenAI-compatible | See 08 |
| Unit tests | Vitest + fast-check (property tests) | Core invariants |
| E2E | Playwright test runner | Real browser, traces, visual snapshots |
| Lint | ESLint, dependency-cruiser, Prettier | Boundaries and consistency |

## Runtime topology

```
Browser                                     Server (Node, same origin)
┌──────────────────────────────────┐        ┌──────────────────────────────┐
│ app / viewer (React)             │        │ static files (production)    │
│   ├─ stores (UI, selection, tool)│  HTTP  │ POST /api/ai/turn            │
│   ├─ design store ──► core ops   │ ─────► │   core + catalog (validate,  │
│   ├─ render (three, instanced)   │        │   apply on a copy)           │
│   └─ interaction controller      │        │   provider adapters          │
│ persistence (IndexedDB)          │        │ GET /api/ai/config           │
│                                  │        │ GET /api/host (LAN URLs)     │
└──────────────────────────────────┘        └──────────────────────────────┘
```

- `npm run dev`: Vite dev server proxies `/api` to the Node server started alongside (one command).
- `npm start`: production — the Node server serves the built app and the API. The AI works outside dev.
- `npm run dev -- --host` / `HOST=0.0.0.0 npm start`: LAN access.

## Data flow for an edit

```
user input ─► tool ─► (preview transaction while dragging) ─► commit transaction
                                   │                                  │
                                   ▼                                  ▼
                       core.applyTransaction(doc, ops) ─► { doc', inverse, results }
                                                                      │
                     history.push({ ops, inverse })  ◄────────────────┤
                                                                      ▼
                         core.buildScene(doc') (memoised per entity) ─► scene model
                                                                      │
                     render.sync(scene model)  ◄──────────────────────┤
                     checks.run(scene model)   ◄──────────────────────┘
```

- **Preview transactions** (during a drag) are applied to a scratch copy for rendering and snapping; only
  the final one is committed and enters history.
- The scene model is rebuilt **per changed entity** (cache keyed by entity revision), so dragging one unit
  in a 100-unit design rebuilds one unit.

## State ownership

| State | Owner | Persisted |
|---|---|---|
| Design document | design store (wraps core) | yes (IndexedDB, files, links) |
| History (undo/redo) | design store | no |
| Selection, hover | selection store | no |
| Active tool, tool state | interaction controller | no |
| View: camera mode, explode, open set, hidden fronts, measurements | view store | per design, optional |
| Panels layout, library filters | UI store | localStorage (convenience only) |
| AI conversation | ai store | no (per session) |

Rule: **anything a viewer of a share link should see is in the document; anything about how this user is
looking at it is view state.**

## Error containment

- Every panel and the canvas sit in an error boundary with "Try again".
- `buildScene` never throws for one bad entity: it returns an `invalid` part set for it (rendered as a red
  wireframe box with the error in the checks panel) and continues.
- Unknown template ids from files are preserved as **opaque entities** (see 03) and listed as warnings.
