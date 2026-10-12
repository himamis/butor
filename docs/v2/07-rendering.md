# 07 — Rendering

v1 rendered one React component and one mesh (plus an outline) per panel: about two draw calls per panel
(~1 150 per frame for 40 units) and continuous redraws until retro-fitted. v2 renders the derived scene
model **imperatively with instancing**, in millimetres, on demand.

## Scene model (from `core/geometry`)

```ts
interface SceneModel {
  parts: Map<PartId, ScenePart>;               // world transform + part data, per entity cached
  byEntity: Map<Id, PartId[]>;
  bounds: Map<Id, OBB>;                        // per entity
  room: RoomGeometry;                          // floor polygon, wall boxes, openings, obstacles
  revision: number;
}
interface ScenePart extends Part { world: Matrix4; entityBounds: OBB }
```

The renderer subscribes to scene-model changes and receives a **diff** (added/changed/removed part ids),
so editing one entity touches only its parts.

## Units: millimetres in the scene

The three.js scene uses **mm directly**: camera `near = 10`, `far = 200 000`; light and shadow camera sized
in mm. No `mm()`/`toMm()` conversions exist anywhere (v1 had them at every boundary).

## Batching

| What | How | Draw calls |
|---|---|---|
| Box parts (≈ 90 % of all parts) | One `InstancedMesh` of a unit cube **per material**; instance matrix = part transform × size scale | 1 per material |
| Outlines of box parts | One `InstancedBufferGeometry` of the 12 cube edges (`LineSegments`) per material; same matrices | 1 per material |
| Cylinders (rails), knobs | `InstancedMesh` per shape per finish | few |
| Extrusions (fronts with cutouts) | Individual meshes, cached geometry by shape hash | 1 each (rare) |
| Room | Floor mesh; wall boxes `InstancedMesh`; openings cut by splitting wall segments | few |
| Overlays | Dimensions, guides, measurements, handles: small dedicated meshes/lines; labels as DOM (one positioned layer, not per-label React portals) | few |

Per-instance attributes: colour tint (selection blue, overlap red, hover), opacity flag (faded walls). A
50-unit design renders in **< 60 draw calls** regardless of panel count.

### Motion (open/close, explode)

Animated values (door angle, drawer slide, explode amount) live in an **animation store** outside React.
Each frame while anything animates, the renderer recomputes the affected instance matrices:

```
world = entityPlacement × explodeOffset(part, amount) × motionTransform(part.motion, t) × part.local × scale(size)
```

`motionTransform` and `explodeOffset` are pure functions in core (tested; v1's `partTransform`/`explode`
carried over). Only instances of animating entities are updated (`instanceMatrix.updateRange`).

## Frame loop

- **On demand**: nothing renders while idle. A frame is requested by: camera change, scene diff, overlay
  change, animation in progress, resize of the canvas.
- Animation steps use `dt = min(delta, 1/30)` — the first frame after idle has a huge delta.
- **Shadow map** updates only when the scene model changes (and once at the end of a drag), not on camera moves.
- Hover highlight updates the instance tint only (no React render).

## Picking

- `InstancedMesh.raycast` returns `instanceId` → lookup table → `PartId` → entity, face normal (from the
  hit face of the unit cube, transformed), and part role.
- The controller (06) asks for one pick per pointer event; tools reuse it.
- Overlays (handles, gizmo) are picked first via a separate small scene.
- Walls hidden because they face the camera, and faded walls in explode, are excluded from picking.

## Materials and appearance

- One `MeshStandardMaterial` per material in the design (board colour/texture, finish metalness).
- Floor textures are generated on a canvas (planks, chevron, herringbone, tiles, concrete) as seamless 1 m
  tiles; per-plank randomness is keyed by the plank's position **modulo the tile** so tiles repeat without
  seams (v1 lesson). Rotation 0/90 via texture rotation.
- Lighting: hemisphere + one directional light with soft shadows; tone mapping ACES; no environment map
  needed for v2.

## Views

- 3D: perspective, orbit around the selection or room centre.
- Front / Top / Side / Wall elevation: orthographic, rotate disabled, pan/zoom only; walls between camera
  and room hidden; the elevation view clips everything in front of the chosen wall's plane.
- "Frame selection" (`F`) fits the camera to the selection bounds.

## Performance budgets (checked in CI, see 10)

| Scenario | Budget |
|---|---|
| Idle, any design | 0 frames rendered per second |
| 100 units, orbiting | ≤ 80 draw calls per frame; main-thread frame time ≤ 8 ms (CI GPU) |
| Drag one unit in a 100-unit design | scene rebuild ≤ 2 ms (one entity), snapping query ≤ 1 ms |
| Open all doors (100 units) | animation frames ≤ 12 ms |
| Initial load | ≤ 600 KB gzipped JS for the editor shell; AI chat and print sheet lazy-loaded |
