# Wardrobe Designer

A small local 3D app for designing a wardrobe in a room. All sizes are in millimeters.

## Run

```bash
npm install
npm run dev     # open http://localhost:5173
npm test        # unit tests (vitest)
npm run smoke   # browser smoke test; needs the dev server and Google Chrome (CHROME=<path> to override)
                # URL=http://<lan-ip>:5173/ npm run smoke tests the plain-http LAN address too
```

To use the app from other devices on your network: `npm run dev -- --host` and open the "Network" address it prints.

## Using it

- **Add parts:** drag a template from the library on the left into the 3D view.
- **Select:** click an object. Shift-click to add to the selection. Click empty space to deselect.
- **Move / rotate:** use the gizmo (Move / Rotate in the toolbar), or type exact values in the right panel. Moves snap to the grid and flush against other objects and walls.
- **Resize:** edit the size fields. Resizing changes the part's real dimensions, so panel thickness stays the same.
- **Room:** click empty space to see room settings: shape presets, editable corners, height, floor finish and wall color.
- **Views:** 3D, Front, Top and Side in the toolbar. Walls facing the camera are hidden automatically.
- **Doors, drawers & handles:** doors and drawers have a handle setting (none, knob, bar or cutout grip). Doors also have hinge side, opening angle and handle position. "Carcass with doors" is a ready-made unit with one or two doors.
- **Open / close:** double-click a unit, tick "Open" in the right panel, or use Open all / Close all in the toolbar. This is only a view; it isn't saved.
- **Exploded view:** toggle Explode in the toolbar and adjust the amount with the slider. Moving is disabled while exploded.
- **Share:** the Share button copies a read-only link with the whole design inside it. Whoever opens it can look around, switch views, open doors and drawers, explode and see the cut list — but cannot change anything, and their own autosaved work is left alone. Links made on `localhost` only work on your computer; open the app via its network address to share with other devices.
- **AI assistant:** the AI button opens a chat that edits the design. Each request is one undo step, and the reply lists what changed. See [AI setup](#ai-setup).
- **Overlaps:** intersecting parts turn red and are counted in the status bar.
- **Save / Open:** designs are `.json` files. Your work is also autosaved in the browser.
- **Cut list:** lists every panel with its size and quantity, plus the hardware (knobs, bar handles); fronts with a grip cutout are marked. Export as CSV.

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
   - Params with `options` show as a dropdown (e.g. hinge side). Reuse `handleParam()`, `hingedDoor()` and `frontWithHandle()` from `hardware.ts` for fronts.
   - Panels that move together share a `motion` (`hinge` or `slide`); give panels a `cutout` for grip holes or notches.
   - `build(params)`: returns the panels in the object's local frame — `x ∈ [-w/2, w/2]`, `y ∈ [0, h]`, `z ∈ [-d/2, d/2]` (front is `+z`). Use the `box()` helper from `helpers.ts`.
2. Add it to the `TEMPLATES` list in `src/templates/index.ts`.

It then appears in the library under its `category`. `src/templates/templates.test.ts` automatically checks every template (parts stay inside the stated size, sizes are positive), so run `npm test` after adding one.

## AI setup

The chat runs through this app's own server (`npm run dev` or `npm run preview`), so API keys stay on the machine running it. Choose a provider under AI → Settings:

- **Anthropic (Claude)** — default model `claude-opus-5-5`. Start the server with `ANTHROPIC_API_KEY=... npm run dev`, or paste a key in Settings (stored in that browser only). If Claude declines a request for safety reasons, the API automatically retries it on Anthropic's recommended fallback model.
- **OpenAI-compatible** — any `/chat/completions` server with tool calling. Examples:
  - mlx-serve: base URL `http://localhost:11234/v1`, model `lmstudio-community/Qwen3.8-27B-MLX-4bit`
  - Ollama: `http://localhost:11434/v1`; LM Studio: `http://localhost:1234/v1`
  - Defaults can come from the environment: `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`.

The model edits the design through one tool (`apply_operations`: add, update, delete, group, ungroup, set_room). Everything it sends is validated like UI input — unknown templates or ids are rejected and sizes are clamped — and errors go back to the model so it can correct itself (up to 6 rounds per request). If you edit the design while the AI is working, its result is not applied over your edits.

Anyone who can open the app on your network can use the chat — and any server-side key — so only run it with `--host` on networks you trust.
