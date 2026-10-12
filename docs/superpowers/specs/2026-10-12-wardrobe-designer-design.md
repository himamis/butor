# Wardrobe Designer — Design Spec

Date: 2026-10-12

## Goal

A minimal local web app for designing a living-room wardrobe in 3D. The user asks Claude for furniture building blocks ("templates"); Claude adds them to a template library; the user drags them into a room, positions, rotates and resizes them, colors them, and saves the design.

## Stack

- Vite + React + TypeScript
- three.js via `@react-three/fiber` and `@react-three/drei`
- `zustand` for state (with undo/redo history)
- No unit tests; verification is manual in the browser.
- Run with `npm run dev`.

Units: millimeters in the UI, data and saved files. The 3D scene renders in meters (mm / 1000) for camera precision.

## Templates

- One file per template in `src/templates/`, registered in `src/templates/index.ts`.
- A template defines: `id`, `name`, `category`, `params` (numeric, with defaults and min/max — at least `width`, `height`, `depth`, and usually `thickness`), and `build(params) → Panel[]`.
- A `Panel` is a box: local position, size (x, y, z), and a role (`carcass` | `door` | `rail` …) used for coloring and the cut list.
- **Resizing edits params, never scales the mesh**, so panel thickness stays constant.
- Starter templates: side panel, horizontal panel (top/bottom/shelf), back panel, hanging rail, door, drawer, carcass (open box with N shelves).
- New templates are added by Claude on request: add a file + one line in the index.

## UI layout

- **Left sidebar — Library:** templates grouped by category; drag a card onto the 3D view to place it (dropped on the floor at the cursor).
- **Center — 3D view:** orbit camera, room, objects. Click selects; transform gizmo (move / rotate) on the selected object. Toolbar: move/rotate mode, grid-snap size (1 / 10 / 50 mm), undo, redo, save, load.
- **Right sidebar — Properties:**
  - Selected object: name, position (x, y, z), rotation (Y in 90° steps + free value), template params (width/height/depth/thickness/…), color, duplicate, delete.
  - Nothing selected: Room settings (see below) and design-wide color ("apply to all").
- **Bottom — Overall dimensions** of the whole wardrobe (bounding box of all objects) as W × H × D.

## Dimensions

- Selected object: dimension lines with labels for width, height, depth drawn in 3D.
- Overall: bounding-box dimension lines around all objects, toggleable.

## Grouping

- Shift-click to multi-select. "Group" (Ctrl+G) makes the selection one unit that moves/rotates together; "Ungroup" (Ctrl+Shift+G) splits it. Clicking any member selects the whole group.
- Groups are stored as a `groupId` on objects; the gizmo acts on the group's bounding-box center.

## Views

- Toolbar buttons: 3D (perspective orbit), Front, Top, Side (orthographic, looking along -Z, -Y, -X respectively; pan/zoom only).

## Overlap warnings

- Objects whose world-space panel boxes intersect (beyond a 0.5 mm tolerance) are tinted red, and a warning count shows in the bottom bar. Touching faces do not count.

## Snapping

- Movement snaps to the grid step.
- Objects snap flush to faces of nearby objects and to walls/floor when within a threshold (e.g. 20 mm).

## Room

- Floor plan is a polygon of corner points (x, z), with ceiling height.
- Presets: rectangle, L-shape, rectangle with cut corner. Corner coordinates are editable as a list in the properties panel (add / remove / edit points).
- Walls are extruded from the polygon; rendered semi-transparent from the camera side so they don't block the view.
- Floor: color, or a texture (wood, tiles, concrete) — procedural/canvas-generated, no external assets.
- Wall color.

## Colors

- Per-object color picker (hex), plus a few wood-tone presets.
- "Apply to all objects" action.

## Persistence

- Save: download the design as a `.json` file (room + objects + params + colors).
- Load: open a `.json` file.
- Autosave to `localStorage` on every change; restored on reload. Wrapped in try/catch.

## Cut list

- Button opens a table of all panels: part name, length × width × thickness, color, quantity (identical panels merged). Export as CSV.

## Out of scope

Cost estimates, windows/doors in walls, hardware, multiple rooms, photoreal rendering, unit tests.
