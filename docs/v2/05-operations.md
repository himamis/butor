# 05 — Operations & history

**Every change to a design is a transaction of operations applied by `core/ops`.** The toolbar, drag
tools, properties panel, paste, import, AI assistant and undo all use the same function. Validation,
clamping and error messages exist exactly once.

## API

```ts
type Transaction = { ops: Op[]; label: string };          // label shows in history and the AI change list

interface ApplyResult {
  doc: Design;                   // new document (structurally shared with the old one)
  inverse: Op[];                 // applying these restores the old document exactly
  results: OpResult[];           // one per op: { ok, message, created?: Id[] }
  ok: boolean;                   // all ops succeeded
}

function applyTransaction(doc: Design, tx: Transaction, ctx: OpContext): ApplyResult;
interface OpContext { newId(): Id; now(): string; catalog: CatalogRegistry; mode: 'strict' | 'partial' }
```

- **strict** (UI, paste, import, undo): the transaction is atomic — any failing op rejects the whole
  transaction and the document is unchanged.
- **partial** (AI): valid ops apply, invalid ops are reported; the model gets the report and can fix them.
- `newId` and `now` are injected so results are deterministic in tests and on the server.
- The function is pure and synchronous; it never throws for bad input (bad input → failed `OpResult`).

## Operation set

All ops are zod-validated discriminated unions (`type` field). Lengths in mm, enums as strings.

| Op | Purpose |
|---|---|
| `entity.add { entity }` | Add a unit/part/preset (ids assigned if missing) |
| `entity.remove { ids }` | Remove entities (refused for locked) |
| `entity.move { ids, delta \| to }` | Move (refused for locked) |
| `entity.rotate { ids, degrees, pivot? }` | Rotate about the selection centre |
| `entity.update { id, name?, locked?, params?, materials? }` | Partial update; params merged then schema-validated |
| `unit.resize { id, size, anchor }` | Resize with reflow; `anchor` = which face stays fixed (e.g. `{x: 'min'}`) |
| `unit.column.add { unit, at, width }` / `.remove` / `.update { width }` / `.move { from, to }` | Column structure |
| `unit.item.add { unit, column, template, y, params }` / `.update` / `.remove` / `.move { column, y }` | Interior items |
| `unit.front.add { unit, template, columns, y, params }` / `.update` / `.remove` | Fronts |
| `group.create { members }` / `group.dissolve { id }` | Groups (≥ 2 distinct members) |
| `room.update { height?, floor?, wallColor? }` | Room settings |
| `room.corner.move { id, to }` / `room.corner.insert { after, at }` / `room.corner.remove { id }` | Floor polygon (refused if < 3 corners or self-intersecting) |
| `room.wall.update { key, thickness }` | Walls |
| `room.opening.add/update/remove`, `room.obstacle.add/update/remove` | Openings, obstacles |
| `material.add/update` | Design material library |

Each op module exports `{ schema, apply(doc, op, ctx) → { doc, inverse, result } }`. The structural
invariants from 03 are checked after every op; a violation fails that op with a readable message
("Front would overlap 'Door 2' on 'Left wardrobe'").

### Limits applied by validation (not by callers)

Coordinates within ±100 m; names ≤ 200 chars; ≤ 200 room corners; ≤ 2 000 entities; template params
clamped to schema min/max with a note in the result ("width clamped to 2400 (100–2400)").

## History

```ts
interface HistoryEntry { label: string; ops: Op[]; inverse: Op[]; revisionBefore: number }
```

- Undo applies `inverse` (strict); redo re-applies `ops` (strict). History holds 200 entries.
- **Drags**: tools apply *preview* transactions to a scratch document (not history) on each pointer move,
  and commit one transaction at the end → one undo step. `Esc` during a drag discards the preview.
- **Text inputs** commit on blur/Enter; colour pickers commit when the picker closes (preview while open).
- Undo/redo are disabled while a drag preview is active.

## Rebase (for the AI and future collaboration)

Every committed transaction increments `doc.revision`. A transaction prepared against an older revision
(e.g. an AI turn that took 20 s while the user kept editing) is **rebased**:

1. Re-apply its ops in strict mode on the current document.
2. If all succeed, commit as one transaction.
3. If any fails (the entity was deleted, the column no longer exists), nothing is applied; the caller gets
   the failure list (the AI client tells the model on the next turn).

Ops reference entities by id and positions in local terms, which makes most rebases succeed.

## Generated artefacts from the op schemas

- **AI tool schema**: `zod-to-json-schema(OpSchema)` → the `apply_operations` tool's input schema, with
  every template's param schema inlined per template id (so the model sees enums and limits).
- **Op documentation** for the AI system prompt: generated from schema descriptions.
- **Fuzz tests**: random op sequences (fast-check) must keep all invariants and round-trip through inverse.

## Required tests

1. For every op type: `apply(apply(doc, op).inverse) ≡ doc` (deep equality) for random valid docs/ops.
2. Strict transactions are atomic: inject a failing op at a random position → document unchanged.
3. Random op sequences never produce a document that fails schema validation.
4. Locked entities are never changed by any op except `entity.update { locked: false }`.
5. Rebase: ops prepared at revision n apply after unrelated edits; fail cleanly after conflicting ones.
