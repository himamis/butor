# Wardrobe Designer

A small local 3D app for designing a wardrobe in a room. All sizes are in millimeters.

## Run

```bash
npm install
npm run dev     # open http://localhost:5173
```

## Using it

- **Add parts:** drag a template from the library on the left into the 3D view.
- **Select:** click an object. Shift-click to add to the selection. Click empty space to deselect.
- **Move / rotate:** use the gizmo (Move / Rotate in the toolbar), or type exact values in the right panel. Moves snap to the grid and flush against other objects and walls.
- **Resize:** edit the size fields. Resizing changes the part's real dimensions, so panel thickness stays the same.
- **Room:** click empty space to see room settings: shape presets, editable corners, height, floor finish and wall color.
- **Views:** 3D, Front, Top and Side in the toolbar. Walls facing the camera are hidden automatically.
- **Overlaps:** intersecting parts turn red and are counted in the status bar.
- **Save / Open:** designs are `.json` files. Your work is also autosaved in the browser.
- **Cut list:** lists every panel with its size and quantity; export as CSV.

### Shortcuts

| Key | Action |
|---|---|
| Ctrl/⌘ Z, Ctrl/⌘ Shift Z | Undo, redo |
| Ctrl/⌘ D | Duplicate |
| Ctrl/⌘ G, Ctrl/⌘ Shift G | Group, ungroup |
| Delete / Backspace | Delete selection |
| R, Shift R | Rotate selection 90° clockwise / counter-clockwise |
| G, T | Move mode, rotate mode |
| Esc | Deselect |

## Adding a template

1. Create a file in `src/templates/`, e.g. `myPart.ts`, exporting a `TemplateDef`:
   - `params`: must include `width`, `height`, `depth` (mm), plus any extras (`thickness`, `shelves`…).
   - `build(params)`: returns the panels in the object's local frame — `x ∈ [-w/2, w/2]`, `y ∈ [0, h]`, `z ∈ [-d/2, d/2]` (front is `+z`). Use the `box()` helper from `helpers.ts`.
2. Add it to the `TEMPLATES` list in `src/templates/index.ts`.

It then appears in the library under its `category`.
