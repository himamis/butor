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
- Import pipeline: parse → `format` check → **schema migrations** (`core/migrate`, `schemaVersion` n → n+1
  → …) → **template migrations** (per `TemplateRef.version`) → zod validation → structural invariants.
  - Newer `schemaVersion` than the app knows → refused with "made with a newer version".
  - Unknown templates / newer template versions → `OpaqueEntity`, listed in a warning, preserved on export.
  - Invalid entities → kept as `OpaqueEntity` with the validation error, never silently dropped.
- Export writes the current document unchanged (opaque entities included).

### Migration rules

- Migrations are pure functions `(old) => new`, one per version step, each with a fixture test
  (`fixtures/schema-v{n}.json` → expected v{n+1}).
- Migrations never depend on the current catalog code (they are frozen snapshots of logic at that version).

## Share links

- Format: `{origin}/view#d=<base64url(deflate-raw(JSON))>&v=1`.
  - Compression via `CompressionStream('deflate-raw')`, with a pure-JS fallback for browsers without it.
  - The fragment (`#`) never reaches the server.
- Contents: the design document with materials; no view state except an optional initial camera.
- The viewer route:
  - does not open the IndexedDB `designs` store at all (cannot read or overwrite the visitor's designs);
  - validates and migrates the shared document exactly like an import;
  - shows "This link is damaged" for anything that fails to decode or validate.
- Typical size: 10–20 units ≈ 2–4 KB of URL. Above 60 KB the Share dialog offers **"Download as file"**
  instead (some chat apps truncate long URLs).
- On `localhost`, the Share dialog explains that the link only works on this computer and shows the LAN
  address if the server reports one (`GET /api/host` returns the network URLs the server is listening on).

## Print sheet and exports

- Print sheet is a separate lazy-loaded route rendering SVG elevations (from the scene model, not
  screenshots) + tables; printed with the browser's print dialog to PDF; PNG via SVG rasterisation.
- CSV exports (cut list, hardware) use `;`-safe quoting and a header row; numbers in mm without units.
