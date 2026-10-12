# Fronts, Hardware, Open/Close & Exploded View — Design Addendum

Date: 2026-10-12 · Extends `2026-10-12-wardrobe-designer-design.md`

## Data model
- `ParamDef.options?: {value, label}[]` → rendered as a select; params stay numeric.
- `Panel.motion?: Motion` — panels sharing `motion.id` move together.
  - `{ kind: 'hinge', pivot: {x, z}, angle }` (deg about +Y at full open)
  - `{ kind: 'slide', offset: Vec3 }` (mm at full open)
- `Panel.cutout?: { kind: 'hole' | 'notch', cx, cy, w, h }` in the panel's front-face coords (relative to panel center). Rendered as real geometry (extruded outline with hole / notch).
- `PanelRole` adds `'handle'`; `Panel.shape` adds `'knob'` (cylinder along Z).

## Hardware
- Door / drawer / carcass-with-doors params: `handle` (None / Knob / Bar / Cutout), door `handlePos` (Top / Middle / Bottom), `handleInset` (mm from the free edge).
- Door: `hinge` (Left / Right), `openAngle` (default 95°). Handle sits on the edge opposite the hinge; the door swings outward (+z).
- Drawer: handle centered; cutout = notch in the top edge; slides out 85 % of its box depth.
- Cut list: handles become a separate hardware list (name × qty); fronts with a cutout are named "… (grip hole)" / "… (grip notch)".

## New template
- `carcass-doors`: carcass + 1 or 2 overlay doors (2 mm gaps, outer hinges), handle options. Total depth includes the doors.

## Open / close (view state, not saved, no undo)
- Double-click an object, "Open" checkbox in properties, toolbar Open all / Close all.
- Animated. Overlap checks always use the closed state.

## Exploded view (view state)
- Toolbar toggle + amount slider. Each part (static panel or moving group) moves away from its object's center; objects also spread from the scene center. Animated. The gizmo is hidden while exploded.

## Tests
- `vitest` unit tests for pure logic: templates, geometry, snapping, cut list, persistence, store undo, motion, explode, cutout outline.
- Browser smoke script saved as `scripts/smoke.mjs`.
