# 06 — Interaction & snapping

v1 grew one ad-hoc pointer handler per feature (gizmo, resize handles, drop, measure) coordinated by
timestamps and listener tricks. v2 has **one input controller** and **one snapping engine**.

## Input controller (`interaction/controller.ts`)

Owns all pointer and keyboard input on the canvas.

```ts
interface Tool {
  id: ToolId;                                   // 'select' | 'place' | 'measure' | 'room' | ...
  cursor(hit: Hit | null): string;
  onPointerDown?(e: ToolPointer): ToolResult;   // may return { capture: true } to start a drag
  onDrag?(e: ToolPointer): ToolResult;          // only while captured
  onDragEnd?(e: ToolPointer, cancelled: boolean): ToolResult;
  onClick?(e: ToolPointer): ToolResult;         // pointer down+up within CLICK_SLOP, no drag
  onHover?(hit: Hit | null): void;
  onKey?(e: KeyboardEvent): boolean;            // true = handled
  overlay(): OverlaySpec;                       // what the renderer should draw for this tool (guides, previews)
}

interface ToolPointer {
  screen: Vec2; ray: Ray;                       // mm units
  hit: Hit | null;                              // picked part/face (see 07: picking)
  modifiers: { shift: boolean; alt: boolean; mod: boolean };
}

type ToolResult = void | { capture?: boolean; preview?: Transaction; commit?: Transaction; cancel?: true };
```

Controller responsibilities, in one place:

- **Click vs drag**: a drag starts after the pointer moves > 4 px (`CLICK_SLOP`) while pressed.
- **Pointer capture** on drag start; release on end; `Esc` cancels (discarding the preview).
- **Camera arbitration**: the camera control is disabled while a tool has capture, and when the press
  starts on an interactive target (handle, gizmo, selected object). Empty-space drags orbit; with the
  select tool, `Shift` + empty-space drag starts a marquee.
- **Preview/commit**: forwards `preview` to the design store's scratch document and `commit` to history.
- **Pick on demand**: one raycast per pointer event, shared by all consumers.

### Tools

| Tool | Gesture | Behaviour |
|---|---|---|
| **Select** (default) | click / shift-click / marquee | Select entities (or an item/front inside a selected unit: click once = unit, again = the part under the cursor — "drill-down") |
| | drag a selected entity | Move on the floor plane (snapped) |
| | drag a face handle | Resize that face (`unit.resize` with anchor = opposite face) |
| | drag the rotate ring | Rotate (15° steps; `Shift` = 90°) |
| | drag an item inside a unit | Move it within / between columns (32 mm system) |
| **Place** | from library drag | Ghost follows the cursor, snapped; valid targets highlight; drop commits `entity.add` or `unit.item.add` |
| **Measure** | click, click | Direction from the first face normal; snaps to faces, edges, corners; persistent measurements (view state) |
| **Room edit** | drag corners, walls, openings | Edits the room; walls show lengths; corners snap to grid and to 90° |
| **Pan/orbit** | empty-space drag, wheel, middle button | Camera only |

Viewer mode registers only Select (camera + open/close by double-click), Measure and Pan/orbit.

### Keyboard (one registry, `interaction/shortcuts.ts`)

Shortcuts are declared with a scope (`editor`, `viewer`, `any`) and are ignored while focus is in a text
input. The `?` cheat sheet is generated from the registry.

| Key | Action | Key | Action |
|---|---|---|---|
| Ctrl/⌘ Z / ⇧Z | Undo / redo | Ctrl/⌘ C / V / D | Copy / paste / duplicate |
| Delete | Delete | Ctrl/⌘ G / ⇧G | Group / ungroup |
| R / ⇧R | Rotate ±90° | M | Measure |
| G | Room edit | O | Open/close selection |
| E | Explode | 1–5 | 3D / Front / Top / Side / Wall elevation |
| / | Search library | Esc | Cancel / deselect / leave tool |
| F | Frame selection | Alt (hold) | Snapping off |
| ? | Shortcut sheet | | |

## Snapping engine (`core/snapping`)

Pure; used by move, resize, place, measure and room edit.

```ts
interface SnapQuery {
  kind: 'move' | 'face' | 'point' | 'corner';
  moving?: { box: OBB; faces?: FaceRef[] };     // for move/resize
  point?: Vec3;                                 // for measure/room edit
  exclude: Id[];                                // the entities being dragged
  grid: number;                                 // 1 | 10 | 50
  threshold: number;                            // mm in world, derived from screen px (≈ 8 px)
}
interface SnapResult {
  delta: Vec3;                                  // correction to apply
  guides: Guide[];                              // what was snapped to, for the overlay
}
```

### Candidates (built once per scene model change, spatially indexed)

| Source | Candidates |
|---|---|
| Entities | faces (6 per OBB), edges, corners, centres (x and z) |
| Unit internals | column floors, item tops/bottoms, 32 mm hole lines (for items) |
| Room | wall inner faces, wall ends, opening edges, obstacle faces, floor (y = 0), ceiling |
| Grid | lines every `grid` mm (lowest priority) |

### Resolution

1. Per axis, collect candidates within `threshold` of a moving face/point.
2. Pick by priority, then distance: **flush face contact > face alignment > edge/centre alignment > grid**.
3. Faces only snap when the boxes overlap on the other two axes (with the threshold as tolerance) — no
   snapping to things far away along another axis.
4. Grid snapping applies to the **resulting position**, not the move delta, so off-grid objects return to the grid.
5. Rotated entities (non-multiples of 90°) snap their bottom-centre to the grid only.
6. `Alt` held → no snapping.

Guides render as a highlighted target face/line plus a small label with the snapped distance (e.g. "flush",
"0 mm to wall", "aligned").

## Selection model

```ts
interface Selection {
  entities: Id[];                              // top-level selection (groups expand to their members)
  inner?: { entity: Id; kind: 'column' | 'item' | 'front'; id: Id };  // drill-down inside one unit
}
```

The properties panel shows the inner target when set (an item's or front's schema form), otherwise the entity.
