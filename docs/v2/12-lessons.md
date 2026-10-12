# 12 — Lessons from v1

Concrete problems v1 hit, each already paid for once. The v2 design avoids them; keep this list in mind
when touching the related code.

## Platform

| Problem | What happened | Rule |
|---|---|---|
| Secure-context-only APIs | `crypto.randomUUID` is undefined on `http://192.168.x.x`; drag-and-drop crashed for LAN users only | No secure-context-only API without fallback (`core/ids.ts`, clipboard). CI runs on a non-localhost http origin. |
| Effects returning values | Newer Chrome returns a Promise from `element.scrollTo()`; `useEffect(() => el.scrollTo(…))` returned it to React and crashed the panel | Effect bodies always use braces (enforced by a small custom ESLint rule that rejects concise-body arrow functions passed to `useEffect`/`useLayoutEffect`). |
| Hash navigation | Changing only the URL fragment does not reload the page | Tests navigate + reload; the app listens to `hashchange` if it must react. |
| Lost first click | Listeners attached in an effect after a tool switch missed a click made immediately after the switch | Input listeners are permanent (controller); tools are state, not listener sets. |

## 3D

| Problem | What happened | Rule |
|---|---|---|
| Euler order | Reading yaw via `rotation.y` (XYZ order) clamps to ±90°; rotating past 90° jumped back | Yaw from quaternions in `YXZ` order; better: keep rotation as a number in the document, never read it back from three.js. |
| Continuous rendering | The scene re-rendered 60×/s while idle | `frameloop: demand`; request frames explicitly; clamp animation `dt`. |
| Draw calls | One mesh + one fat-line outline per panel (~1 150 draw calls for 40 units) | Instancing by material (07). |
| Shadows | Shadow map re-rendered every frame although the light never moves | Update shadows only on scene changes. |
| Seamless textures | Per-plank random tones differed between a tile's overhang and its wrap → visible bands every metre | Randomness keyed by position modulo the tile. |
| Walls hiding content | Near walls block front/side views; walls hide exploded parts | Hide camera-facing walls; fade walls in explode; elevation view clips. |

## State and data

| Problem | What happened | Rule |
|---|---|---|
| Duplicate rules | Clamping and validation existed separately in the store, the file loader and the AI operations | One operations layer (05); schemas generate validation. |
| Numeric enums | `hinge: 0/1`, `handle: 0–3` leaked into files and the AI schema | String enums only. |
| Template drift | Changing a template's build silently changed saved designs | Template versions + golden snapshots (04). |
| All-or-nothing loading | One unknown object made the loader reject the whole design — and the autosave with it | Opaque entities; never drop data silently (09). |
| Free-floating interiors | Drawers "inside" a carcass were independent objects; resizing the carcass left them behind | Units own columns, items and fronts (03). |
| Copies overlapping | Paste offset of 50 mm made every copy collide (red) | Copies land flush beside the selection. |
| Undo granularity | Colour pickers and text fields created one history entry per keystroke/drag | Preview while editing, commit once (05). |
| Clipboard snapshot | Pasting later edits of the original surprised users | Snapshot at copy time. |
| Unit conversions | `mm()`/`toMm()` at every three.js boundary | Millimetres in the scene. |

## AI and server

| Problem | What happened | Rule |
|---|---|---|
| Key exfiltration | The server attached `ANTHROPIC_API_KEY` to a browser-chosen base URL; any web page could trigger it with a `text/plain` POST | Keys only go to their configured endpoint; JSON + Origin checks (08). |
| Implicit SDK credentials | With no key passed, the SDK read env credentials itself — even for a custom URL | Refuse custom URLs without an explicit key before constructing the client. |
| Unanswered tool calls | A model invented a tool name; the call got no result; every later turn failed | Every tool call gets a result. |
| Truncated tool input | A reply cut off at `max_tokens` carried partial operations | Never apply tool calls from a cut-off reply; validate parsed input. |
| Local server quirks | Missing tool-call ids, arguments as objects | Normalise in the adapter; echo generated ids. |
| Concurrent edits | The AI's result overwrote edits made while it was thinking | Revisions + rebase (05). |
| Unbounded history | The whole design JSON was appended every turn until requests exceeded limits | Cap and ask for a new chat; send compact design summaries. |
| Forced tool choice | `tool_choice: any/tool` is rejected by current Claude models | Use `auto` and steer in the prompt. |

## Testing

| Problem | What happened | Rule |
|---|---|---|
| Text selectors | New template descriptions matched `text=Close`, `text=Top` | Roles and test ids only. |
| Separate contexts | `browser.newPage()` creates a new context with separate storage; the "viewer never touches storage" test checked nothing | Same-context pages for storage tests. |
| Timing assumptions | Debounced autosave from a previous step fired during the next check | Await a store-level "saved" signal, not sleeps. |
| Tests that cannot fail | An "is zero when amount is 0" test exercised only an early return | Property tests over ranges; mutation-test critical core modules occasionally. |
| Implemented logic tested only indirectly | `applyMotion` was tested; the renderer used different code | Test the function the renderer calls (pure transform functions in core). |
