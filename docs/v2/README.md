# Butor v2 — Design Specification

Butor is a browser-based 3D wardrobe designer: plan a room, build wardrobes from units, fill them with
interior fittings and fronts, check that everything fits, and hand a cut list, hardware list and drawing
to a workshop.

This folder specifies **v2, a rewrite from scratch**. v1 (the code in this repository today) proved the
product; v2 keeps what worked and redesigns what grew by accretion. Everything an implementer needs is
here: read it in order, then build milestone by milestone ([11-roadmap.md](11-roadmap.md)).

## Documents

| # | Document | Covers |
|---|---|---|
| 01 | [Features](01-features.md) | Everything the user can do, with acceptance criteria |
| 02 | [Architecture](02-architecture.md) | Modules, dependency rules, stack, runtime topology |
| 03 | [Data model](03-data-model.md) | The design document: room, units, columns, items, fronts, parts, materials |
| 04 | [Catalog & templates](04-catalog.md) | Typed template schemas, build functions, versioning |
| 05 | [Operations & history](05-operations.md) | The single validated mutation API, transactions, undo |
| 06 | [Interaction & snapping](06-interaction.md) | Tool system, input controller, snapping engine |
| 07 | [Rendering](07-rendering.md) | Scene model, instancing, picking, animation, performance budgets |
| 08 | [AI assistant](08-ai.md) | Chat editing, providers, server, security |
| 09 | [Persistence & sharing](09-persistence.md) | Design storage, files, share links, migrations |
| 10 | [Quality](10-quality.md) | Unit, property, end-to-end and visual tests; budgets; CI |
| 11 | [Roadmap](11-roadmap.md) | Milestones with exit criteria, in build order |
| 12 | [Lessons from v1](12-lessons.md) | Concrete pitfalls already paid for — do not repeat |

## Goals

1. **Real wardrobe structure.** A wardrobe is a unit with columns and compartments. Interior fittings and
   fronts belong to a unit and reflow when it changes. Resizing a unit never leaves its drawers behind.
2. **One way to change a design.** The UI, the AI assistant, paste, import and undo all go through one
   validated operations layer. Rules live in one place.
3. **Schemas are the source of truth.** Template parameters are typed schemas. Validation, the properties
   panel, the AI tool schema, file migration and documentation are generated from them.
4. **Workshop-grade output.** Boards with thickness, grain and edge banding; hinges and runners; cost;
   a printable sheet. A cabinet maker can build from the export.
5. **Fast with large designs.** 100 units at interactive frame rates; nothing renders while idle.
6. **Safe to share and to run on a LAN.** Read-only links; secrets never leave the server; works over
   plain-http LAN addresses.

## Non-goals (v2)

- Photorealistic rendering (path tracing, HDRI lighting).
- Real-time multi-user editing. The operation model is designed so it can be added later; it is not built.
- Editing on phones. The read-only viewer works on phones; the editor targets desktop and tablet with a mouse or pen.
- CNC/nesting export and panel optimisation. The cut list is the hand-off.
- Multiple rooms per design.

## Glossary

| Term | Meaning |
|---|---|
| **Design** | The document the user edits: one room plus everything in it. Saved, shared and versioned as a whole. |
| **Room** | Floor polygon, walls (with thickness and height), openings (doors, windows), obstacles (columns, radiators, beams, skirting). |
| **Entity** | A top-level thing placed in the room: a **unit** or a **free part**. |
| **Unit** | A wardrobe or cabinet carcass with structure: sides, top, bottom, back, **columns** separated by dividers, **items** inside columns and **fronts** in front. |
| **Column** | A vertical section of a unit between two sides/dividers. Has a width (fixed or auto). |
| **Item** | An interior fitting in a column at a height: shelf, rail, drawer, basket, trouser rack, shoe shelf, … |
| **Front** | A door, flap, sliding door or drawer front covering a rectangular region of a unit's front. |
| **Free part** | A standalone catalog piece not inside a unit: panel, filler, plinth, cornice, loose shelf. |
| **Part** | One physical piece produced by the geometry engine: a board, a rail, a handle. Parts are derived, never stored. |
| **Material** | What a part is made of: a board (with thickness, colour/texture, price, edge banding) or a hardware finish. |
| **Catalog** | The library of templates: unit types, item types, front types, free-part types. |
| **Operation (op)** | A validated, invertible change to a design. |
| **Transaction** | A list of ops applied atomically; one undo step. |
| **Tool** | The active interaction mode: select, move, resize, rotate, place, measure, room edit. |
| **Snap target** | A face, edge, point, wall, obstacle, grid line or height the snapping engine can align to. |

## Units and conventions

- **All lengths are integers or decimals in millimetres**, everywhere: document, operations, geometry,
  scene, UI. There is no metre conversion anywhere in v2.
- Axes: **x** right, **y** up, **z** towards the viewer. The floor is y = 0.
- An entity's position is its **bottom-centre**; its local front faces **+z** at rotation 0.
- Rotations are about the vertical axis, in degrees, positive = counter-clockwise seen from above.
