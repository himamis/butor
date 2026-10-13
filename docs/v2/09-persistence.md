# 09 — Persistence & sharing

## Storage (`persistence/`)

IndexedDB database `butor`, version 1:

| Store | Key | Value |
|---|---|---|
| `designs` | `id` | the `Design` document |
| `index` | `id` | `{ id, name, updatedAt, thumbnail (small PNG data URL) }` for the start screen |
| `view` | `designId` | view state worth keeping per design (camera, explode amount, hidden fronts) |
| `settings` | key | app settings (grid, units display, AI settings without keys) |

- **Autosave**: debounced 500 ms after each committed transaction, and on `visibilitychange`/`pagehide`.
- Writes are serialised per design; a failed write shows a non-blocking warning and retries.
- If IndexedDB is unavailable (private mode, blocked), the app works in memory and says so.
- Clipboard (copy/paste) is in memory; cross-tab paste uses `BroadcastChannel` when available.
- Never use secure-context-only APIs without a fallback (`crypto.randomUUID`, `navigator.clipboard`):
  the app is served over plain http on LANs.

## Files

- Extension `.butor.json`, MIME `application/json`.
- Content: `{ format: 'butor-design', ...Design }`.
- Import pipeline: parse → `format` check → `schemaVersion` check → zod validation → structural invariants.
  - There are **no migrations**: any `schemaVersion` other than the app's is refused with "made with a
    different version". Backward compatibility with older files (including v1) is not a goal.
  - Unknown templates → `OpaqueEntity`, listed in a warning, preserved on export.
  - Invalid entities → kept as `OpaqueEntity` with the validation error, never silently dropped.
- Export writes the current document unchanged (opaque entities included).

## Share links

- Format: `{origin}/view#d=<base64url(deflate-raw(JSON))>&v=1`.
  - Compression with a pure-JS raw deflate (`fflate`): identical output in every browser and in Node tests.
  - The fragment (`#`) never reaches the server.
- Contents: the design document with materials; no view state except an optional initial camera.
- The viewer route:
  - does not open the IndexedDB `designs` store at all (cannot read or overwrite the visitor's designs);
  - validates the shared document exactly like an import (other format versions are refused);
  - shows "This link is damaged" for anything that fails to decode or validate.
- Typical size: 10–20 units ≈ 2–4 KB of URL. Above 60 KB the Share dialog offers **"Download as file"**
  instead (some chat apps truncate long URLs).
- On `localhost`, the Share dialog explains that the link only works on this computer and shows the LAN
  address if the server reports one (`GET /api/host` returns the network URLs the server is listening on).

## Print sheet and exports

- Print sheet is a separate lazy-loaded route rendering SVG elevations (from the scene model, not
  screenshots) + tables; printed with the browser's print dialog to PDF; PNG via SVG rasterisation.
- CSV exports (cut list, hardware) use `;`-safe quoting and a header row; numbers in mm without units.
