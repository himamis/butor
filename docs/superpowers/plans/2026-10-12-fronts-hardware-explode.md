# Fronts, Hardware, Open/Close & Exploded View — Plan

**Spec:** `docs/superpowers/specs/2026-10-12-fronts-hardware-explode-design.md`

## Global constraints
- mm everywhere; params numeric (selects via `options`).
- Open/explode are UI state: never saved, never in undo history.
- Overlaps computed on the closed, unexploded design.

## Review focus
1. Left vs right hinge: free edge must swing outward (+z) for both.
2. Handle / drawer box must move with its front (same motion id).
3. Old saved files without new params load with defaults.
4. Cutout larger than the front must not produce broken geometry (clamped).
5. Explode amount 0 / closed state = exact original positions.

## Tasks
1. **Test setup** — add vitest; characterization tests for geometry, snapping, cutlist, persistence, store undo.
2. **Motion math** (TDD) — `src/lib/motion.ts`: `applyMotion(m, t, p): Vec3`.
3. **Cutout outline** (TDD) — `src/lib/cutoutShape.ts`: `frontOutline(w, h, cutout?) → { outline, holes }`, clamps cutout inside the panel.
4. **Hardware + templates** (TDD) — types, `templates/hardware.ts` (`handleParams`, `frontWithHandle`), door / drawer / carcass-doors; template invariants tests.
5. **Cut list hardware** (TDD) — `hardwareList(objs)`, cutout naming, CSV includes hardware.
6. **Explode math** (TDD) — `src/lib/explode.ts`: `partExplodeOffset`, `objectExplodeOffset`.
7. **Rendering + UI** — animated parts in `ObjectMesh`, extruded fronts, knob/bar meshes, select params, open/close + explode controls, gizmo hidden when exploded.
8. **Smoke script + docs** — `scripts/smoke.mjs`, README update, final review.
