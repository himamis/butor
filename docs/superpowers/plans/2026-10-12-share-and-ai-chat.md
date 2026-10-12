# Share Link & AI Chat — Plan

**Spec:** `docs/superpowers/specs/2026-10-12-share-and-ai-chat-design.md`

## Review focus
1. A shared link can never modify the recipient's autosave or design state.
2. Model output that is malformed (bad JSON, unknown ops, wrong types) never corrupts the design.
3. A failed model call leaves the design untouched and shows the error.
4. Anthropic history stays append-only (assistant content echoed unchanged).
5. API keys never reach other browsers or the share link.

## Tasks
1. Share codec (TDD) — `src/lib/share.ts`: `encodeShare(design)`, `decodeShare(hash) → Design | null`.
2. Read-only store + viewer UI — `readOnly` flag guarded in `commit`/`updateObjectsLive`; `ViewerApp` layout; no autosave in viewer.
3. Operations (TDD) — `src/ai/operations.ts`: op types, JSON schema, `applyOperations`.
4. Prompt + catalog — `src/ai/prompt.ts`: system prompt with template catalog and conventions; design summary.
5. Providers + loop (TDD with fake model) — `src/ai/providers/anthropic.ts`, `openaiCompat.ts`, `src/ai/agent.ts` `runAgent(...)`.
6. Server route — `server/chatPlugin.ts` Vite plugin for dev + preview.
7. Chat UI — `src/components/ChatPanel.tsx`, settings, one undo step per request.
8. Smoke + README.
