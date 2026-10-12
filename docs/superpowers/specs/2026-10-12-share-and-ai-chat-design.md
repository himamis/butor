# Share Link & AI Chat — Design Addendum

Date: 2026-10-12 · Extends the wardrobe designer specs.

## Share (read-only viewer)
- Toolbar **Share**: compresses the design (lz-string) into `#view=<data>` on the current origin, copies the link. On `localhost` the dialog reminds to use the network address.
- Viewer mode (hash present): toolbar with views, Open/Close all, Explode, Cut list; status bar with overall dimensions. No library, properties, gizmo, selection, shortcuts, drag & drop, file buttons.
- Store `readOnly`: `commit` / live updates are no-ops. The viewer never reads or writes autosave.
- Broken link → message "This share link is damaged" with a link to the editor.

## AI chat
- Toolbar **AI** toggles a chat panel in place of the properties panel. Chat history is in memory only.
- Settings (localStorage): provider `anthropic` | `openai-compatible`, model, base URL, optional API key.
  - Anthropic: official `@anthropic-ai/sdk`, default model `claude-opus-5-5`, effort `medium`, server-side refusal fallback (`fallbacks: "default"`) for models that support it.
  - OpenAI-compatible: `POST {baseUrl}/chat/completions` with `tools` (e.g. Ollama `http://localhost:11434/v1`).
- Server: Vite plugin route `POST /api/chat` (dev + preview). Keys from env (`ANTHROPIC_API_KEY`, `LLM_API_KEY`) or the request. Runs the tool loop (max 6 model calls) and returns `{ design, history, reply, changes }`.
- One tool `apply_operations({ operations })`; ops: `add`, `update`, `delete`, `group`, `ungroup`, `set_room`. Pure `applyOperations(design, ops) → { design, results }` validates (unknown template/id errors, params clamped) and reports new ids.
- Each user request sends the current design; history is provider-native and append-only (assistant content echoed unchanged).
- The returned design is committed as one undo step.

## Tests
- Unit: share encode/decode, `applyOperations`, read-only guard, both provider adapters + agent loop with a fake model.
- Smoke: viewer mode checks.
