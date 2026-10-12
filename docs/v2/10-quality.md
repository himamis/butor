# 10 — Quality: tests, budgets, CI

## Test pyramid

| Layer | Tool | What | Where |
|---|---|---|---|
| Property tests | Vitest + fast-check | Core invariants over random inputs: ops ↔ inverse, catalog invariants (04), snapping never moves more than the threshold, scene build determinism | `src/core/**/*.prop.test.ts` |
| Unit tests | Vitest | Pure functions: geometry, snapping cases, checks, cut list, hardware rules, migrations, share codec, AI loop with fake providers, server security | `*.test.ts` next to the code |
| Golden snapshots | Vitest | Per template: parts for default params + edge cases; cut list of reference designs | `__snapshots__/` — changing them requires a template version bump (04) |
| End-to-end | Playwright test runner | User flows in a real browser (WebGL via SwiftShader in CI) | `e2e/` |
| Visual regression | Playwright `toHaveScreenshot` | Key views of reference designs (3D, front, top, exploded, open, print sheet) | `e2e/visual/` |
| Performance | Playwright + custom metrics | Budgets from 07 | `e2e/perf/` |

## End-to-end conventions (lessons from v1's smoke script)

- **Select by role or `data-testid`, never by visible text** — new content ("…closes the back…") collided
  with `text=Close` in v1.
- Test hooks: in test builds the app exposes `window.__butor = { store, scene, pick(screenPoint) }` and
  a `worldToScreen(mm)` helper, so tests can click exact 3D points.
- Each test starts from a fixture design (`e2e/fixtures/*.butor.json`) loaded through the real import path.
- Viewer tests open the share link in a **new page of the same browser context** (shared storage), so
  "the viewer never touches storage" is actually tested.
- Fragment-only navigation does not reload the page: navigate then `reload()` when testing links.
- Run the suite twice in CI: on `http://localhost` (secure context) and on a **non-localhost http origin**
  (`--host-resolver-rules="MAP butor.test 127.0.0.1"`, `http://butor.test:5173`) to catch secure-context-only APIs.
- AI e2e uses an in-test mock OpenAI-compatible server; no real API keys in CI.

## Required end-to-end flows

1. Place a preset wardrobe from the library; resize with a handle; the opposite face stays; undo is one step.
2. Add a column and three drawers by dropping into the unit; open the unit; the drawers slide with their fronts.
3. Move a unit next to another and against a wall; snapping makes both flush; guides appear.
4. Room edit: drag a corner; add a window; a unit in front of it is flagged.
5. Measure: wall → unit front (exact depth), floor → unit top (exact height).
6. Copy/paste lines units up flush; paste into another design.
7. Share: open link in the same context; edits are impossible; the visitor's designs are unchanged; damaged link message.
8. Import an old-version file and a file with an unknown template; export; re-import; identical.
9. Cut list and hardware of a reference design match snapshots; CSV downloads.
10. AI with the mock server: one request → one transaction → undo; concurrent edit → conflict handling.
11. Error containment: inject an entity whose build throws → error box + check entry; the rest renders.

## Budgets enforced in CI (see 07)

Measured on the CI runner in a 100-unit fixture: idle frames = 0; draw calls ≤ 80; scene rebuild for one
entity ≤ 2 ms; snapping query ≤ 1 ms; editor JS ≤ 600 KB gzipped. Budgets fail the build when exceeded by > 10 %.

## CI (GitHub Actions)

```
on: [push, pull_request]
jobs:
  check:   typecheck, lint, dependency-cruiser boundaries, unit + property tests, golden snapshots
  e2e:     build, start server, Playwright (localhost + butor.test), upload traces/screenshots on failure
  perf:    100-unit budgets (on main and on PRs touching render/ or core/geometry/)
```

`main` is protected: all jobs green before merge.

## Definition of done (per feature)

- Acceptance criteria from 01 covered by e2e tests.
- Core logic covered by unit/property tests written first (red → green).
- No new dependency boundary violations; budgets green.
- README / user help updated (shortcut sheet is generated).
