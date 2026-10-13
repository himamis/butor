# 01 — Features

Each feature lists what the user can do and **acceptance criteria (AC)** an end-to-end test can check.
Features marked **(new)** did not exist in v1.

---

## F1. Designs

- A start screen lists saved designs (name, thumbnail, last edited) with **New**, **Open**, **Rename**,
  **Duplicate**, **Delete**, **Import file**. **(new)**
- Every change autosaves to the current design.
- **Export** saves a `.butor.json` file; **Import** opens one as a new design.

AC
- Creating, renaming, duplicating and deleting designs survives a page reload.
- A file exported from one browser imports in another with identical geometry and cut list.
- Only the current file format is read: a file in any other format version is refused with a clear message (no migrations).
- A design containing an unknown template still opens; the unknown entities are listed in a warning and kept untouched in the file (not dropped).

## F2. Room

- Floor polygon with presets (rectangle, L-shape, cut corner) and editable corners — by numbers and by
  **dragging corners and walls in a top-down room-edit tool**. **(new: dragging)**
- Ceiling height; wall thickness per wall. **(new: per wall)**
- **Openings** on walls: door (width, height), window (width, height, sill height), passage. **(new)**
- **Obstacles**: column (floor-to-ceiling box), beam (ceiling box), radiator (wall box at a height),
  skirting board (strip along walls), generic box. **(new: generic obstacles; v1 had columns only)**
- Floor finish: plain colour, wood planks, chevron parquet, herringbone, tiles, concrete; colour; **pattern
  rotation** (0/90°). **(new: herringbone, rotation)**
- Wall colour.

AC
- Dragging a corner in room-edit mode moves it with grid snapping; walls follow; undo restores.
- Furniture overlapping an obstacle or blocking an opening is flagged.
- A room cannot have fewer than 3 corners or self-intersecting walls (the edit is refused with a message).

## F3. Catalog and library

- Library panel: search (all words must match name, description or keywords; `/` focuses), category chips
  with counts, collapsible sections, cards with description and default size.
- Categories: **Wardrobes, Cabinets, Fronts, Interior, Panels, Base & trim**.
- Drag a card into the room to place it, **or into a unit's column** to add an item there. Valid drop
  targets highlight while dragging. **(new: drop into units)**
- Catalog content at launch: everything v1 had (24 templates) re-expressed in the unit model, plus lift-up
  flap, herringbone floor, radiator/beam/skirting obstacles.

AC
- Searching "sliding door" lists the sliding door and the sliding-door wardrobe; "door" in Interior lists nothing.
- Dropping a drawer onto a unit column adds it to that column at the drop height (snapped), not as a free entity.

## F4. Units (new structure)

- A unit has size (w × h × d), construction (board, back panel type, top/bottom style, optional plinth and
  cornice), **columns** and **fronts**.
- **Columns**: add, remove, reorder; width fixed (mm) or auto (shares the remaining width). Dividers are
  generated between columns.
- **Items** in a column, each at a height: shelf (fixed or adjustable), hanging rail, drawer (internal or
  external front), pull-out basket, trouser rack, shoe shelf, divider tray. Items can be dragged up and
  down inside their column with snapping to a 32 mm hole system or the grid.
- **Fronts** cover a rectangle of the unit front defined by a column range and a height range: hinged door
  (left/right), double door, lift-up flap, sliding door (track 1/2), drawer front. Handles: none, knob, bar
  (length), grip cutout (hole/notch), push-to-open.
- Resizing a unit **reflows** it: auto columns share width; items keep their height from the column floor
  (and are clamped if the unit gets lower); fronts keep their column/height spans.

AC
- Widening a 2-column unit with one auto column grows only the auto column; items stay attached.
- Lowering a unit below an item removes nothing silently: the item is clamped to the top or flagged.
- A front cannot overlap another front on the same unit (the op is refused).
- Opening a unit animates its doors (hinge), flaps (up) and drawers (slide) — fronts, boxes and handles move together.

## F5. Placing and editing

- Select (click, shift-click, **marquee: Shift + drag in empty space (new)**), move by dragging the object
  itself **(new — no separate move gizmo)**, rotate (90° steps with `R`, free with the rotate ring or
  numbers), resize with face handles, numeric properties for everything.
- Copy/paste/duplicate: copies land **flush beside** the selection; repeated pastes line up.
- Group/ungroup; lock; delete; undo/redo (100+ steps); keyboard shortcuts with an on-screen cheat sheet (`?`). **(new: cheat sheet)**
- Properties panel is **generated from the template schema**: enums as selects/segmented controls, booleans
  as toggles, lengths with mm units and min/max.

AC
- Every edit is exactly one undo step; a drag is one step regardless of how many pointer moves it had.
- Locked entities cannot be moved, resized, deleted or changed by the AI.
- Pasting into another design (after opening it) works.

## F6. Snapping and guides

- One snapping engine for move, resize, place, measure and room edit: faces flush, edges aligned, centres,
  walls, obstacles, floor/ceiling, grid (1/10/50 mm), 32 mm system inside units.
- **Snap guides** show what was snapped to (a highlighted face/line and the distance). **(new)**
- Hold `Alt` to temporarily disable snapping. **(new)**

AC
- Moving a unit within 20 mm of a wall makes it flush; the guide shows the wall.
- With `Alt` held, the unit moves freely to 1 mm.

## F7. Views and visibility

- 3D orbit; Front / Top / Side orthographic; **wall elevation view**: pick a wall and look straight at it with
  its openings and the units against it **(new)**.
- Walls facing the camera hide automatically; exploded view (walls fade); open/close all and per unit;
  hide fronts.

AC
- Elevation view of a wall shows only that wall's side of the room, square-on, with dimensions.

## F8. Dimensions, measuring and checks

- Selection dimensions, overall dimensions, **clearances** to the nearest wall/unit on each side **(new)**.
- Measure tool: click a surface (sets direction), then a second point; snaps to faces, edges and corners **(new: edge/corner snapping)**; measurements persist until cleared.
- Checks panel **(new)** lists problems with a click-to-zoom:
  - overlaps (part-level, closed state);
  - **door swing clearance**: an opening door hits a wall, obstacle or other unit;
  - **drawer pull-out clearance**;
  - unit taller than ceiling, unit blocking an opening;
  - unit not against a wall (warning only).

AC
- A hinged door whose swing arc intersects an adjacent wall is listed under "Door swing clearance".
- Clicking a check frames the camera on it and selects the entities involved.

## F9. Materials

- Material library: boards (name, thickness options, colour or texture, grain direction, price per m²,
  edge banding type/price per m), metals/finishes for handles and rails. **(new)**
- Assign materials per unit: carcass, back, interior, fronts; override per item/front.
- Apply-to-all and apply-to-selection.

AC
- Changing a unit's carcass board thickness from 18 to 25 mm rebuilds the unit with the new thickness and updates the cut list.

## F10. Outputs

- **Cut list**: per board material — part name, length × width (length along grain), thickness, edge
  banding per edge, quantity; grouped and merged; CSV and PDF. **(new: grain, banding, per material)**
- **Hardware list**: hinges (count by door height), runners (pairs, length by drawer depth), handles,
  rails, baskets, racks, sliding-door track sets, flap stays.
- **Cost estimate**: boards (area × price + waste factor), edge banding, hardware unit prices. **(new)**
- **Print sheet**: PDF/PNG with front elevation per unit and per wall, top view, dimensions, cut list and
  hardware. **(new)**

AC
- The cut list of a reference design matches a stored snapshot exactly.
- The print sheet renders without the browser UI and fits A4/A3 landscape.

## F11. Sharing

- **Share** creates a read-only link containing the whole design (compressed in the URL fragment).
- The viewer can orbit, switch views, open/close, explode, measure, see the cut list — and nothing else.
- The viewer never reads or writes the visitor's own storage.

AC
- Opening a link in a browser with saved designs leaves those designs byte-identical.
- A damaged link shows a message, not a blank page.

## F12. AI assistant

- Chat panel that edits the design through the operations layer: "add a 1000 mm wardrobe with two doors
  next to the left one", "make all fronts walnut", "put three drawers at the bottom of column 2".
- Each request is one transaction (one undo step); the reply lists the changes.
- Providers: Anthropic (default) and any OpenAI-compatible endpoint (local models).
- If the user edits during a request, the AI result is rebased if possible, otherwise not applied and the
  model is told.

AC
- With a scripted mock model, a request adds a unit; undo removes it.
- Malformed tool input never changes the design and is reported back to the model.

## F13. General

- Works over plain-http LAN addresses (no secure-context-only APIs without fallback).
- Every panel is wrapped in an error boundary; a failure in one area never blanks the app; the design is
  never lost.
- Keyboard accessible: all toolbar actions have shortcuts and tooltips; focus is visible.
- UI language: English; strings are kept in one module so translation is possible later.
