# Wardrobe Designer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A minimal local web app to design a wardrobe in 3D from a library of parametric templates, inside a configurable room, with save/load and a cut list.

**Architecture:** One zustand store holds the `Design` (room + objects) plus selection and undo history. Templates are pure functions `build(params) → Panel[]` in local millimeter coordinates. A react-three-fiber viewport renders the room and objects (scene in meters = mm/1000); pure helper modules (geometry, snapping, cutlist, persistence) do the math and I/O.

**Tech Stack:** Vite, React 18, TypeScript, three, @react-three/fiber, @react-three/drei, zustand.

**Spec:** `docs/superpowers/specs/2026-10-12-wardrobe-designer-design.md`

## Global Constraints

- Units: millimeters in UI, data and saved files; scene renders meters (mm / 1000).
- Resizing edits template params, never scales meshes.
- Rotation is around the vertical (Y) axis only.
- No unit tests (user decision). Verification per task = `npm run build` passes + manual browser check with `npm run dev`.
- No external asset files: floor textures are generated on a canvas.
- All `localStorage` access wrapped in try/catch.
- Minimal UI: plain CSS, no UI framework.

## Review Focus

1. Loading a malformed or older `.json` file → app shows an alert and keeps the current design (no crash, no blank screen).
2. Corrupt `localStorage` autosave → app starts with the default design.
3. Param input left empty / out of range / non-number → value is clamped to the param's min/max, never NaN.
4. Room polygon with fewer than 3 points → removing a point is disabled at 3.
5. Group transform followed by undo → all members return together in one undo step.

Each of these is checked manually in the task that owns the code.

---

## File Structure

```
index.html
package.json, tsconfig.json, vite.config.ts
src/
  main.tsx              – React entry
  App.tsx               – layout (toolbar, library, viewport, properties, status bar)
  styles.css            – layout + minimal styling
  types.ts              – all shared types
  units.ts              – mm ↔ m helpers
  templates/
    index.ts            – registry: TEMPLATES, getTemplate(id)
    sidePanel.ts, horizontalPanel.ts, backPanel.ts, rail.ts,
    door.ts, drawer.ts, carcass.ts
  state/
    store.ts            – zustand store, actions, undo/redo
    defaults.ts         – default room, room presets, color presets
  lib/
    geometry.ts         – world-space boxes, bounds, overlaps
    snapping.ts         – grid + face/wall snapping
    cutlist.ts          – cut list rows + CSV
    persistence.ts      – save/load file, autosave
    textures.ts         – canvas floor textures
  components/
    Toolbar.tsx, Library.tsx, Viewport.tsx, RoomMesh.tsx,
    ObjectMesh.tsx, SelectionGizmo.tsx, Dimensions.tsx,
    Properties.tsx, RoomPanel.tsx, StatusBar.tsx, CutListDialog.tsx
```

## Core Types (`src/types.ts`) — used by every task

```ts
export type Vec3 = { x: number; y: number; z: number };

export type PanelRole = 'carcass' | 'back' | 'door' | 'drawer' | 'rail';

/** Axis-aligned box in the object's local frame, mm. pos = box center. */
export interface Panel {
  name: string;           // e.g. "Side panel"
  role: PanelRole;
  pos: Vec3;
  size: Vec3;             // x = width, y = height, z = depth
  shape?: 'box' | 'cylinder'; // cylinder = rail along X
}

export interface ParamDef {
  key: string; label: string;
  default: number; min: number; max: number; step?: number;
}

export interface TemplateDef {
  id: string; name: string; category: string;
  params: ParamDef[];     // must include width, height, depth
  build(p: Record<string, number>): Panel[];
}

/** Object local frame: x ∈ [-w/2, w/2], y ∈ [0, h], z ∈ [-d/2, d/2].
 *  position = bottom-center in room coords, mm. */
export interface SceneObject {
  id: string;
  templateId: string;
  name: string;
  params: Record<string, number>;
  position: Vec3;
  rotationY: number;      // degrees
  color: string;          // hex
  doorColor?: string;     // overrides color for door/drawer roles
  groupId?: string;
  locked?: boolean;
}

export type FloorKind = 'color' | 'wood' | 'tiles' | 'concrete';

export interface Room {
  points: { x: number; z: number }[]; // floor polygon, mm, counter-clockwise
  height: number;
  wallThickness: number;
  floorKind: FloorKind;
  floorColor: string;
  wallColor: string;
}

export interface Design {
  version: 1;
  room: Room;
  objects: SceneObject[];
}
```

---

### Task 1: Project scaffold + layout shell

**Files:** Create `package.json`, `index.html`, `tsconfig.json`, `vite.config.ts`, `src/main.tsx`, `src/App.tsx`, `src/styles.css`, `src/types.ts`, `src/units.ts`.

**Produces:** `types.ts` as above; `units.ts` exports `mm(v: number): number` (mm → m) and `toMm(v: number): number`.

- [ ] Step 1: `npm create vite@latest . -- --template react-ts` (or write files by hand), then `npm i three @react-three/fiber @react-three/drei zustand` and `npm i -D @types/three`.
- [ ] Step 2: Write `types.ts` and `units.ts` exactly as specified.
- [ ] Step 3: `App.tsx` renders a CSS grid: toolbar (top), library (left, 220px), viewport (center), properties (right, 280px), status bar (bottom). Placeholders for each region.
- [ ] Step 4: Verify: `npm run build` passes; `npm run dev` shows the five regions.
- [ ] Step 5: `git init` (if needed) and commit "chore: scaffold wardrobe designer".

### Task 2: Templates

**Files:** Create `src/templates/*.ts`.

**Produces:** `TEMPLATES: TemplateDef[]`, `getTemplate(id: string): TemplateDef`, `defaultParams(t: TemplateDef): Record<string, number>`, `clampParam(def: ParamDef, v: number): number` (NaN → default, then clamp to min/max).

Templates (all mm; frame per `SceneObject` doc comment):

| id | category | params (default) | panels |
|---|---|---|---|
| `side-panel` | Panels | width 18, height 2200, depth 580 | one carcass box w×h×d |
| `horizontal-panel` | Panels | width 800, height 18, depth 580 | one carcass box |
| `back-panel` | Panels | width 800, height 2200, depth 8 | one back box |
| `rail` | Interior | width 760, height 30, depth 30 | cylinder along X, role rail |
| `door` | Fronts | width 400, height 2190, depth 18 | one door box |
| `drawer` | Fronts | width 764, height 200, depth 500, thickness 16 | front (door role, full w×h, thickness deep, at front z), two sides, back, bottom (drawer role) |
| `carcass` | Units | width 800, height 2200, depth 580, thickness 18, shelves 3 (0–10) | 2 sides, top, bottom, 8 mm back at rear, `shelves` evenly spaced inner shelves |

- [ ] Step 1: Write each template file and the registry.
- [ ] Step 2: Verify `npm run build` passes. Commit "feat: starter templates".

### Task 3: Store, defaults, undo/redo

**Files:** Create `src/state/defaults.ts`, `src/state/store.ts`.

**Consumes:** types, `getTemplate`, `defaultParams`, `clampParam`.

**Produces:**
- `defaults.ts`: `DEFAULT_ROOM: Room` (4000×3500 rectangle, height 2600, wall 100, floor wood `#b8895a`, wall `#eceae4`); `ROOM_PRESETS: Record<'rectangle'|'l-shape'|'cut-corner', Room['points']>`; `COLOR_PRESETS: {name: string; hex: string}[]` (White #f4f3ef, Oak #c8a06a, Walnut #6b4a2f, Anthracite #3a3d40, Sand #d9cbb0).
- `store.ts`: `useStore` with state
  `{ design: Design; selection: string[]; past: Design[]; future: Design[]; mode: 'translate'|'rotate'; view: '3d'|'front'|'top'|'side'; grid: 1|10|50; showOverall: boolean; doorsHidden: boolean }`
  and actions:
  `commit(fn: (d: Design) => Design)` (pushes previous design to `past`, max 100, clears `future`),
  `undo()`, `redo()`,
  `addObject(templateId: string, position: Vec3)` (selects new object),
  `updateObjects(ids: string[], fn: (o: SceneObject) => SceneObject)`,
  `setParam(id: string, key: string, value: number)` (uses `clampParam`),
  `select(id: string | null, additive: boolean)` (expands to whole group),
  `deleteSelected()`, `duplicateSelected()` (offset +50 mm x, new ids, new groupId if grouped),
  `groupSelected()`, `ungroupSelected()`,
  `applyColorToAll(hex: string)`,
  `setRoom(fn: (r: Room) => Room)`,
  `loadDesign(d: Design)` (resets history and selection),
  `setUi(partial)` for mode/view/grid/showOverall/doorsHidden.
- Live drags call `updateObjectsLive(ids, fn)` (no history), and `commit` is called once at drag end via `beginDrag()` / `endDrag()` (beginDrag snapshots design; endDrag pushes snapshot to `past` if changed). This gives one undo step per drag, including group drags (Review Focus #5).
- Ids via `crypto.randomUUID()`.

- [ ] Step 1: Write both files.
- [ ] Step 2: Verify build. Commit "feat: design store with undo".

### Task 4: Viewport, room, objects, views

**Files:** Create `src/lib/textures.ts`, `src/components/Viewport.tsx`, `RoomMesh.tsx`, `ObjectMesh.tsx`. Modify `App.tsx`.

**Consumes:** store, `mm()`, templates.

**Produces:** `floorTexture(kind: FloorKind, color: string): THREE.Texture` (cached by key; 512px canvas: wood = planks with grain lines, tiles = grid with grout, concrete = noise; repeat set per meter).

- [ ] Step 1: `Viewport` — `<Canvas shadows>` with ambient + directional light. For `view === '3d'` use a perspective camera + `OrbitControls` (makeDefault). For front/top/side use drei `<OrthographicCamera makeDefault>` positioned along +Z / +Y / +X looking at the room center, with `OrbitControls enableRotate={false}`. Clicking empty space calls `select(null,false)`.
- [ ] Step 2: `RoomMesh` — floor = `THREE.Shape` from points (x, -z) rotated flat, textured or colored. Walls = one box per polygon edge (length = edge length, height = room.height, thickness = wallThickness, placed outside the polygon). Walls use `transparent` material, opacity 0.35, `depthWrite=false`, and are hidden entirely in the top view.
- [ ] Step 3: `ObjectMesh` — group at `mm(position)`, rotation `rotationY` degrees; one mesh per panel from `getTemplate(o.templateId).build(o.params)` (box or cylinder). Color: `doorColor` for door/drawer-front roles if set, else `color`; rail = `#9aa0a6` metallic. Hide door roles when `doorsHidden`. Selected → `<Edges color="#2f7cf6">`. `onPointerDown` (stopPropagation) → `select(o.id, e.shiftKey)`.
- [ ] Step 4: Toolbar buttons 3D / Front / Top / Side set `view`.
- [ ] Step 5: Verify manually: seed one carcass via console or temporary default; switch all four views. Build passes. Commit "feat: 3D viewport with room and views".

### Task 5: Library drag & drop

**Files:** Create `src/components/Library.tsx`. Modify `Viewport.tsx`.

- [ ] Step 1: Library lists `TEMPLATES` grouped by `category`, with a search box filtering by name. Each card is `draggable` and sets `dataTransfer.setData('template', id)`.
- [ ] Step 2: The viewport wrapper `div` handles `onDragOver` (preventDefault) and `onDrop`: raycast the drop point onto the floor plane y=0 with the current camera (store camera from `useThree` in a ref via a small inner component), convert to mm, snap to grid, `addObject(id, {x, y: 0, z})`. If the ray misses, use the room center.
- [ ] Step 3: Verify manually: drag each template in, in 3D and top views. Build passes. Commit "feat: drag templates from library".

### Task 6: Gizmo, snapping, grouping

**Files:** Create `src/lib/geometry.ts`, `src/lib/snapping.ts`, `src/components/SelectionGizmo.tsx`.

**Produces:**
- `geometry.ts`: `type Box = { min: Vec3; max: Vec3 }`;
  `objectSize(o): Vec3` (= width/height/depth params);
  `worldPanelBoxes(o): {box: Box; panel: Panel}[]` (rotate panel center around Y by rotationY, swap x/z sizes for 90°/270°; for non-90° angles use the AABB of the rotated box);
  `objectBox(o): Box`; `boundsOf(objs): Box | null`;
  `findOverlaps(objs, tol = 0.5): Set<string>` (pairs of objects with different ids whose panel boxes intersect by more than `tol` on all three axes; objects in the same group are still checked).
- `snapping.ts`: `snapMove(moving: Box, delta: Vec3, others: Box[], room: Room, grid: number, threshold = 20): Vec3` — round delta to grid; then for x and z, if a moving face is within threshold of an opposite face of another box (or of a wall line for axis-aligned walls), adjust to be flush; y snaps to floor 0 and to tops of other boxes. Returns the corrected delta.

Steps:
- [ ] Step 1: Write geometry + snapping.
- [ ] Step 2: `SelectionGizmo` — when selection is non-empty and not locked, render an invisible pivot `<group>` at the selection bounds' bottom-center, wrapped in drei `<TransformControls mode={mode} showY={mode==='translate'} showX={mode==='translate'} showZ={mode==='translate'}>`; in rotate mode show only Y. On `onMouseDown` → `beginDrag()` and remember the start positions. On `onObjectChange` → compute delta from the pivot, run `snapMove` (translate) or snap the angle to 15° steps (rotate; members rotate around the pivot), then `updateObjectsLive`. On `onMouseUp` → `endDrag()`. Disable OrbitControls while dragging (drei `makeDefault` controls handle this automatically).
- [ ] Step 3: Keyboard (in `App.tsx`, ignored when focus is in an input): Delete/Backspace delete; Ctrl/Cmd+D duplicate; Ctrl/Cmd+Z undo; Ctrl/Cmd+Shift+Z or Ctrl+Y redo; Ctrl/Cmd+G group; Ctrl/Cmd+Shift+G ungroup; R rotates the selection +90° (one commit); G/T toggles translate/rotate; Escape deselects.
- [ ] Step 4: Toolbar: translate/rotate toggle, grid select (1/10/50), undo, redo, group, ungroup.
- [ ] Step 5: Verify manually: move with snapping flush to a neighbour; rotate 90°; group two objects, move them, undo once → both return (Review Focus #5). Build passes. Commit "feat: transform gizmo, snapping, grouping".

### Task 7: Properties + room panel

**Files:** Create `src/components/Properties.tsx`, `src/components/RoomPanel.tsx`.

- [ ] Step 1: `Properties` with one selected object: name (text), position x/y/z, rotation (number + "⟳90°" button), each template param as a number input, color (`<input type=color>` + preset swatches), door color (optional, with a "same as body" checkbox), lock checkbox, Duplicate / Delete buttons. With multiple selected: count, color for all selected, Group/Ungroup, Delete. Number inputs commit on blur/Enter, through `clampParam` for params; reject NaN for position (keep the old value) (Review Focus #3).
- [ ] Step 2: `RoomPanel` (shown when nothing is selected): preset buttons (rectangle / L-shape / cut corner); corner list with x/z inputs, "add point" (inserts the midpoint after the selected row), "remove" (disabled when 3 points remain, Review Focus #4); height; wall color; floor kind select + floor color; "Apply color to all objects" with color input + presets; checkbox "Hide doors".
- [ ] Step 3: Verify manually: edit a carcass width to 1200 → panels stay 18 mm thick; set L-shape room and edit a corner. Build passes. Commit "feat: properties and room editing".

### Task 8: Dimensions, overlap warnings, status bar

**Files:** Create `src/components/Dimensions.tsx`, `src/components/StatusBar.tsx`. Modify `ObjectMesh.tsx`.

- [ ] Step 1: `Dimensions` — a `DimLine` component: line between two points with small end ticks and a drei `<Html>` label `"{n} mm"` (rounded). For the selection bounds: width line along the bottom-front edge, height along the front-left edge, depth along the bottom-left edge, offset 60 mm outward. If `showOverall` and there are 2+ objects: same for `boundsOf(all)` in a different color (`#e07a1f`), offset 150 mm.
- [ ] Step 2: `ObjectMesh` receives an `overlapping` flag (computed once in `Viewport` via `useMemo(findOverlaps)`), which tints the material with `#e53935` emissive.
- [ ] Step 3: `StatusBar`: overall W × H × D (mm) of all objects, object count, a "⚠ N overlapping" message when N > 0, and a "Show overall dimensions" toggle.
- [ ] Step 4: Verify manually: two overlapping carcasses turn red; touching side by side do not. Build passes. Commit "feat: dimensions and overlap warnings".

### Task 9: Persistence + cut list

**Files:** Create `src/lib/persistence.ts`, `src/lib/cutlist.ts`, `src/components/CutListDialog.tsx`. Modify `Toolbar.tsx`, `store.ts` (initial state from autosave).

**Produces:**
- `persistence.ts`: `parseDesign(json: unknown): Design | null` (checks `version === 1`, room points array of ≥3 `{x,z}` numbers, objects array with known `templateId`; fills missing params from defaults); `saveToFile(d: Design)` (Blob download `wardrobe-YYYY-MM-DD.json`); `openFile(): Promise<Design | null>`; `loadAutosave(): Design | null`; `writeAutosave(d: Design)` (try/catch). The store subscribes to `design` changes and debounces `writeAutosave` by 500 ms.
- `cutlist.ts`: `type CutRow = { part: string; length: number; width: number; thickness: number; color: string; qty: number }`; `cutList(objs): CutRow[]` — for every non-rail panel, thickness = smallest size dimension, length/width = the other two sorted descending; merge identical rows (part + dims + color); rails as separate rows with length only (thickness = diameter). `toCsv(rows): string`.

- [ ] Step 1: Write both libs; initialize the store from `loadAutosave() ?? defaultDesign`.
- [ ] Step 2: Toolbar Save / Open / Cut list buttons. Open with an invalid file → `alert('Could not read this design file.')` and keep the current design (Review Focus #1).
- [ ] Step 3: `CutListDialog` — modal table plus a "Download CSV" button.
- [ ] Step 4: Verify manually: save, reload the page (autosave restores), open the saved file, open a garbage .json (alert), set `localStorage` to junk and reload (default design, Review Focus #2), check the cut list numbers for a default carcass (2× 2200×580×18 sides etc.). Build passes. Commit "feat: save/load, autosave, cut list".

### Task 10: Polish + README

- [ ] Step 1: Short `README.md`: `npm install`, `npm run dev`, shortcuts list, and "how to add a template" (create a file in `src/templates/`, add it to `TEMPLATES`).
- [ ] Step 2: Full manual pass through every spec section. Build passes. Commit "docs: readme".
