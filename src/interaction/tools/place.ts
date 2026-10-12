import {
  defaultsOf,
  drawerFrontSpan,
  newId,
  snapContext,
  snapItemY,
  snapMove,
  unitLayout,
  type EntityInput,
  type Op,
  type Unit,
  type UnitLayout,
  type UnitTemplate,
  type Vec3,
} from '../../core';
import { intersectPlane, pxToMm, toLocal, toWorld } from '../geom';
import type { EditorPort, ViewPort } from '../types';

/** What is being dragged from the library. */
export interface PlaceEntry {
  kind: 'preset' | 'unit' | 'part' | 'item' | 'front';
  id: string;
  name: string;
}

/** Builds the EntityInput for presets/units/parts (the app owns the catalog presets). */
export type EntityFactory = (
  entry: PlaceEntry,
  position: { x: number; z: number },
  rotation: number,
) => EntityInput | null;

const WALL_REACH = 600; // mm: closer than this to a wall, a unit turns to face into the room and stands against it

/**
 * Placing from the library (docs/v2/06-interaction.md#tools): a preview follows the cursor; dropping commits it.
 * Units and parts go on the floor (facing into the room near walls); items and fronts go into a unit column.
 */
export class PlaceTool {
  private placed: string | null = null;

  constructor(
    private readonly editor: EditorPort,
    private readonly view: ViewPort,
    private readonly entry: PlaceEntry,
    private readonly factory: EntityFactory,
  ) {}

  move(x: number, y: number, alt = false) {
    this.editor.cancelPreview();
    this.view.setTarget(null);
    this.view.setGuides([]);
    if (this.entry.kind === 'item' || this.entry.kind === 'front') this.intoUnit(x, y, alt);
    else this.onFloor(x, y, alt);
  }

  drop(): string | null {
    this.view.setTarget(null);
    this.view.setGuides([]);
    this.editor.setStatus(null);
    this.editor.commitPreview();
    const id = this.placed;
    if (id && this.editor.design().entities[id]) this.editor.select([id]);
    return id;
  }

  cancel() {
    this.view.setTarget(null);
    this.view.setGuides([]);
    this.editor.setStatus(null);
    this.editor.cancelPreview();
  }

  private onFloor(x: number, y: number, alt: boolean) {
    const p = intersectPlane(this.view.ray(x, y), { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    if (!p) return;
    const design = this.editor.design();
    // Near a wall: face into the room and stand against it.
    let rotation = 0;
    let at = { x: p.x, z: p.z };
    let wallNormal: { x: number; z: number } | null = null;
    let wallPoint: { x: number; z: number } | null = null;
    const cs = design.room.corners;
    let bestD = WALL_REACH;
    cs.forEach((a, i) => {
      const b = cs[(i + 1) % cs.length]!;
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const dir = { x: (b.x - a.x) / len, z: (b.z - a.z) / len };
      const t = (p.x - a.x) * dir.x + (p.z - a.z) * dir.z;
      if (t < 0 || t > len) return;
      const inward = { x: -dir.z, z: dir.x };
      const d = (p.x - a.x) * inward.x + (p.z - a.z) * inward.z;
      if (d >= -50 && d < bestD) {
        bestD = d;
        wallNormal = inward;
        wallPoint = { x: a.x + dir.x * t, z: a.z + dir.z * t };
      }
    });
    if (wallNormal && wallPoint) {
      const n = wallNormal as { x: number; z: number };
      rotation = Math.round((Math.atan2(n.x, n.z) * 180) / Math.PI);
      at = wallPoint;
    }
    this.placed = newId();
    const input = this.factory(this.entry, at, rotation);
    if (!input) return;
    let entity: EntityInput = { ...input, id: this.placed, position: { x: at.x, z: at.z }, rotation };
    let r = this.editor.preview([{ type: 'entity.add', entity }], `Add ${this.entry.name}`);
    if (!r.ok) {
      this.editor.setStatus(r.results.find((x) => !x.ok)?.message ?? 'Cannot place here');
      return;
    }
    const placed = this.editor.scene().entities.get(this.placed);
    if (!placed) return;
    const bounds = placed.bounds;
    // Against a wall: move out along the wall normal until the back face (local min z) touches the wall.
    let delta: Vec3 = { x: 0, y: 0, z: 0 };
    if (wallNormal) {
      const n = wallNormal as { x: number; z: number };
      const back = -placed.localBounds.min.z;
      delta = { x: n.x * back, y: 0, z: n.z * back };
    }
    if (this.editor.snapping() && !alt) {
      const ctx = snapContext(
        design,
        this.editor.committedScene(),
        [],
        this.editor.grid(),
        pxToMm(this.view, bounds.center),
      );
      const moved = {
        ...bounds,
        center: { x: bounds.center.x + delta.x, y: bounds.center.y, z: bounds.center.z + delta.z },
      };
      const s = snapMove(ctx, moved, { x: 0, y: 0, z: 0 });
      delta = { x: delta.x + s.delta.x, y: 0, z: delta.z + s.delta.z };
    }
    if (delta.x !== 0 || delta.z !== 0) {
      entity = { ...entity, position: { x: at.x + delta.x, z: at.z + delta.z } };
      r = this.editor.preview([{ type: 'entity.add', entity }], `Add ${this.entry.name}`);
    }
    this.editor.setStatus(null);
  }

  private intoUnit(x: number, y: number, alt: boolean) {
    const hit = this.view.pick(x, y);
    const design = this.editor.design();
    const unit = hit?.kind === 'part' && hit.entityId ? design.entities[hit.entityId] : undefined;
    if (!unit || unit.kind !== 'unit' || unit.locked) {
      this.editor.setStatus(this.entry.kind === 'item' ? 'Drop into a unit column' : 'Drop onto a unit');
      return;
    }
    const t = this.editor.catalog.get(unit.template.id);
    if (!t || t.kind !== 'unit') return;
    const layout = unitLayout(unit, t as UnitTemplate, this.editor.catalog);
    if ('error' in layout) return;
    const front = toWorld({ x: 0, y: 0, z: layout.innerZ[1] }, unit);
    const n = toWorld({ x: 0, y: 0, z: 1 }, { position: { x: 0, y: 0, z: 0 }, rotation: unit.rotation });
    const p = intersectPlane(this.view.ray(x, y), front, n) ?? hit!.point;
    const local = toLocal(p, unit);
    let ci = layout.columns.findIndex((c) => local.x >= c.x0 && local.x <= c.x0 + c.width);
    if (ci < 0) ci = local.x < 0 ? 0 : layout.columns.length - 1;
    const c = layout.columns[ci]!;
    this.view.setTarget({
      center: toWorld(
        { x: c.x0 + c.width / 2, y: layout.floorY + layout.inner.h / 2, z: (layout.innerZ[0] + layout.innerZ[1]) / 2 },
        unit,
      ),
      half: { x: c.width / 2, y: layout.inner.h / 2, z: (layout.innerZ[1] - layout.innerZ[0]) / 2 },
      rotation: unit.rotation,
    });
    const ops =
      this.entry.kind === 'item'
        ? this.itemOps(unit, layout, ci, local.y, alt, p)
        : this.frontOps(unit, layout, ci, local.y);
    if (typeof ops === 'string') {
      this.editor.setStatus(ops);
      return;
    }
    const r = this.editor.preview(ops, `Add ${this.entry.name}`);
    this.editor.setStatus(r.ok ? null : (r.results.find((q) => !q.ok)?.message ?? 'Does not fit here'));
  }

  private itemOps(unit: Unit, layout: UnitLayout, ci: number, localY: number, alt: boolean, at: Vec3): Op[] | string {
    const t = this.editor.catalog.get(this.entry.id);
    if (!t || t.kind !== 'item') return 'Unknown item';
    const params = defaultsOf(t.params); // the new item's height comes from its default params
    const height = t.height(params, { layout, column: ci });
    const col = unit.columns[ci]!;
    const neighbours = col.items.map((i) => {
      const it = this.editor.catalog.get(i.template.id);
      return { from: i.y, to: i.y + (it?.kind === 'item' ? it.height(i.params, { layout, column: ci }) : 0) };
    });
    let y = Math.max(0, Math.min(layout.inner.h - height, localY - layout.floorY - height / 2));
    if (this.editor.snapping() && !alt) y = snapItemY(y, { neighbours, height, threshold: pxToMm(this.view, at) }).y;
    this.placed = null;
    return [{ type: 'unit.item.add', unit: unit.id, column: col.id, template: { id: t.id }, y: Math.round(y) }];
  }

  /** A new front takes the free height span of the column under the cursor (between existing fronts). */
  private frontOps(unit: Unit, layout: UnitLayout, ci: number, localY: number): Op[] | string {
    const covering = unit.fronts.filter((f) => ci >= f.columns[0] && ci <= f.columns[1]).map((f) => f.y);
    if (this.entry.id === 'front.drawer') {
      const free = unit.columns[ci]!.items.find((i) => {
        if (
          i.template.id !== 'item.drawer' ||
          i.params.style !== 'external' ||
          unit.fronts.some((f) => f.drawer === i.id)
        )
          return false;
        const y0 = layout.floorY + i.y;
        const y1 = y0 + Number(i.params.height ?? 200);
        return localY >= y0 - 30 && localY <= y1 + 30;
      });
      if (!free) return 'Add an external drawer to this column first';
      const span = drawerFrontSpan(unit, ci, layout, { y: free.y, height: Number(free.params.height ?? 200) });
      if (!span) return 'There is already a front over that drawer';
      return [
        {
          type: 'unit.front.add',
          unit: unit.id,
          template: { id: 'front.drawer' },
          columns: [ci, ci],
          y: span,
          drawer: free.id,
        },
      ];
    }
    const edges = [0, unit.size.h, ...covering.flat()].sort((a, b) => a - b);
    let span: [number, number] | null = null;
    for (let i = 0; i < edges.length - 1; i++) {
      const a = edges[i]!,
        b = edges[i + 1]!;
      if (localY >= a && localY <= b && !covering.some(([c, d]) => c < b && a < d)) span = [a, b];
    }
    if (!span || span[1] - span[0] < 100) return 'No free space for a front there';
    this.placed = null;
    return [{ type: 'unit.front.add', unit: unit.id, template: { id: this.entry.id }, columns: [ci, ci], y: span }];
  }
}
