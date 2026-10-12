import {
  newId,
  obbAabb,
  snapContext,
  snapFace,
  snapItemY,
  snapMove,
  unitLayout,
  type Guide,
  type OBB,
  type Op,
  type Unit,
  type UnitLayout,
  type UnitTemplate,
  type Vec3,
} from '../../core';
import type { GuideSpec } from '../../render/overlays';
import {
  dot,
  innerOf,
  intersectPlane,
  norm,
  pxToMm,
  scale,
  selectionBox,
  sub,
  toLocal,
  toWorld,
  worldAxis,
} from '../geom';
import type { EditorPort, Tool, ToolPointer, ViewPort } from '../types';

type Drag =
  | { kind: 'move'; ids: string[]; start: Vec3; box: OBB }
  | {
      kind: 'resize';
      id: string;
      axis: 'x' | 'y' | 'z';
      sign: 1 | -1;
      start: Vec3;
      dir: Vec3;
      normal: Vec3;
      size0: number;
      box: OBB;
    }
  | { kind: 'rotate'; ids: string[]; pivot: Vec3; a0: number }
  | { kind: 'item'; unit: string; item: string; grab: number; height: number }
  | { kind: 'marquee'; x0: number; y0: number };

const DEG = 180 / Math.PI;

/** Converts snap guides into overlay lines on the floor, spanning the moving box. */
function guideLines(guides: Guide[], box: OBB): GuideSpec[] {
  const ext = Math.max(box.half.x, box.half.z) + 400;
  return guides
    .filter((g) => g.axis !== 'y')
    .map((g) => {
      const c = box.center;
      return g.axis === 'x'
        ? { from: { x: g.at, y: 5, z: c.z - ext }, to: { x: g.at, y: 5, z: c.z + ext } }
        : { from: { x: c.x - ext, y: 5, z: g.at }, to: { x: c.x + ext, y: 5, z: g.at } };
    });
}

/** The default tool: select, move, resize, rotate, drag items, marquee (docs/v2/06-interaction.md#tools). */
export class SelectTool implements Tool {
  readonly id = 'select';
  private active: Drag | null = null;
  private pending: Drag | null = null; // decided on press, started once the pointer moves

  constructor(
    private readonly editor: EditorPort,
    private readonly view: ViewPort,
  ) {}

  down(e: ToolPointer): boolean {
    const sel = this.editor.selection();
    const design = this.editor.design();
    const scene = this.editor.committedScene();
    const hit = e.hit;
    this.pending = null;

    if (hit?.kind === 'handle' && sel.entities.length) {
      if (sel.entities.some((id) => design.entities[id]?.locked)) return false;
      if (hit.handle === 'rotate') {
        const box = selectionBox(scene, sel.entities)!;
        const p = intersectPlane(this.view.ray(e.x, e.y), { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }) ?? hit.point;
        this.pending = {
          kind: 'rotate',
          ids: sel.entities,
          pivot: box.center,
          a0: Math.atan2(-(p.z - box.center.z), p.x - box.center.x),
        };
        return true;
      }
      const id = sel.entities[0]!;
      const e0 = design.entities[id];
      if (sel.entities.length !== 1 || e0?.kind !== 'unit') return false;
      const axis = hit.handle![0] as 'x' | 'y' | 'z';
      const sign = (hit.handle![1] === '+' ? 1 : -1) as 1 | -1;
      const dir = scale(worldAxis(axis, e0.rotation), sign);
      const rayDir = this.view.ray(e.x, e.y).dir;
      let normal = sub(rayDir, scale(dir, dot(rayDir, dir)));
      if (Math.hypot(normal.x, normal.y, normal.z) < 1e-6) normal = { x: 0, y: 1, z: 0 };
      const size0 = axis === 'x' ? e0.size.w : axis === 'y' ? e0.size.h : e0.size.d;
      this.pending = {
        kind: 'resize',
        id,
        axis,
        sign,
        start: hit.point,
        dir,
        normal: norm(normal),
        size0,
        box: scene.entities.get(id)!.bounds,
      };
      return true;
    }

    if (hit?.kind === 'part' && hit.entityId) {
      const ent = design.entities[hit.entityId];
      if (!ent || ent.locked) return false;
      const inner = innerOf(hit.partId!, design);
      if (sel.inner?.kind === 'item' && inner?.kind === 'item' && inner.id === sel.inner.id && ent.kind === 'unit') {
        const item = ent.columns.flatMap((c) => c.items).find((i) => i.id === inner.id);
        const layout = this.layoutOf(ent);
        if (item && layout) {
          const t = this.editor.catalog.get(item.template.id);
          const height = t?.kind === 'item' ? t.height(item.params, { layout, column: 0 }) : 0;
          const local = toLocal(hit.point, ent);
          this.pending = {
            kind: 'item',
            unit: ent.id,
            item: item.id,
            grab: local.y - (layout.floorY + item.y),
            height,
          };
          return true;
        }
      }
      const ids = sel.entities.includes(ent.id) ? sel.entities : [ent.id];
      this.pending = { kind: 'move', ids, start: hit.point, box: selectionBox(scene, ids)! };
      return true;
    }

    if (e.shift) {
      this.pending = { kind: 'marquee', x0: e.x, y0: e.y };
      return true;
    }
    return false; // empty space: the camera orbits
  }

  dragStart() {
    this.active = this.pending;
    this.pending = null;
    const d = this.active;
    if (d?.kind === 'move') {
      // dragging an unselected entity selects it first
      const sel = this.editor.selection().entities;
      if (!d.ids.every((id) => sel.includes(id))) this.editor.select(d.ids);
    }
  }

  drag(e: ToolPointer) {
    const d = this.active;
    if (!d) return;
    const snapOn = this.editor.snapping() && !e.alt;
    const design = this.editor.design();
    const committed = this.editor.committedScene();
    const ray = this.view.ray(e.x, e.y);

    if (d.kind === 'marquee') {
      this.editor.setMarquee({
        x0: Math.min(d.x0, e.x),
        y0: Math.min(d.y0, e.y),
        x1: Math.max(d.x0, e.x),
        y1: Math.max(d.y0, e.y),
      });
      return;
    }

    if (d.kind === 'move') {
      const p = intersectPlane(ray, d.start, { x: 0, y: 1, z: 0 });
      if (!p) return;
      let delta: Vec3 = { x: p.x - d.start.x, y: 0, z: p.z - d.start.z };
      let lines: GuideSpec[] = [];
      if (snapOn) {
        const ctx = snapContext(design, committed, d.ids, this.editor.grid(), pxToMm(this.view, d.box.center));
        const r = snapMove(ctx, d.box, delta);
        delta = r.delta;
        lines = guideLines(r.guides, {
          ...d.box,
          center: { x: d.box.center.x + delta.x, y: d.box.center.y, z: d.box.center.z + delta.z },
        });
      }
      this.view.setGuides(lines);
      this.editor.preview([{ type: 'entity.move', ids: d.ids, delta }], 'Move');
      return;
    }

    if (d.kind === 'resize') {
      const p = intersectPlane(ray, d.start, d.normal);
      if (!p) return;
      let grow = dot(sub(p, d.start), d.dir);
      // Snap the moving face in room coordinates when it is axis-aligned.
      const w = { x: Math.round(d.dir.x), y: Math.round(d.dir.y), z: Math.round(d.dir.z) };
      const worldAxisName = w.x !== 0 ? 'x' : w.y !== 0 ? 'y' : w.z !== 0 ? 'z' : null;
      let lines: GuideSpec[] = [];
      if (snapOn && worldAxisName && Math.abs(Math.abs(d.dir[worldAxisName]) - 1) < 1e-6) {
        const s = (d.dir[worldAxisName] > 0 ? 1 : -1) as 1 | -1;
        const aabb = obbAabb(d.box);
        const face = s > 0 ? aabb.max[worldAxisName] : aabb.min[worldAxisName];
        const ctx = snapContext(design, committed, [d.id], this.editor.grid(), pxToMm(this.view, d.start));
        const r = snapFace(ctx, d.box, worldAxisName, s, face + s * grow);
        grow = s * (r.value - face);
        if (r.guide) lines = guideLines([r.guide], d.box);
      } else if (snapOn) {
        grow = Math.round((d.size0 + grow) / this.editor.grid()) * this.editor.grid() - d.size0;
      }
      this.view.setGuides(lines);
      const size = Math.max(1, Math.round(d.size0 + grow));
      const key = d.axis === 'x' ? 'w' : d.axis === 'y' ? 'h' : 'd';
      const anchor = d.axis === 'y' ? undefined : { [d.axis]: d.sign > 0 ? 'min' : 'max' };
      this.editor.preview(
        [{ type: 'unit.resize', id: d.id, size: { [key]: size }, ...(anchor ? { anchor } : {}) } as Op],
        'Resize',
      );
      return;
    }

    if (d.kind === 'rotate') {
      const p = intersectPlane(ray, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
      if (!p) return;
      const a = Math.atan2(-(p.z - d.pivot.z), p.x - d.pivot.x);
      const step = e.shift ? 90 : 15;
      const deg = snapOn ? Math.round(((a - d.a0) * DEG) / step) * step : (a - d.a0) * DEG;
      this.editor.preview(
        [{ type: 'entity.rotate', ids: d.ids, degrees: deg, pivot: { x: d.pivot.x, z: d.pivot.z } }],
        'Rotate',
      );
      return;
    }

    if (d.kind === 'item') {
      const unit = design.entities[d.unit] as Unit;
      const layout = this.layoutOf(unit);
      if (!layout) return;
      const front = toWorld({ x: 0, y: 0, z: layout.innerZ[1] }, unit);
      const p = intersectPlane(ray, front, worldAxis('z', unit.rotation));
      if (!p) return;
      const local = toLocal(p, unit);
      let ci = layout.columns.findIndex((c) => local.x >= c.x0 && local.x <= c.x0 + c.width);
      if (ci < 0) ci = local.x < 0 ? 0 : layout.columns.length - 1;
      const col = unit.columns[ci]!;
      const neighbours = col.items
        .filter((i) => i.id !== d.item)
        .map((i) => {
          const t = this.editor.catalog.get(i.template.id);
          const h = t?.kind === 'item' ? t.height(i.params, { layout, column: ci }) : 0;
          return { from: i.y, to: i.y + h };
        });
      let y = local.y - layout.floorY - d.grab;
      y = Math.max(0, Math.min(layout.inner.h - d.height, y));
      if (snapOn) y = snapItemY(y, { neighbours, height: d.height, threshold: pxToMm(this.view, p) }).y;
      const c = layout.columns[ci]!;
      this.view.setTarget({
        center: toWorld(
          {
            x: c.x0 + c.width / 2,
            y: layout.floorY + layout.inner.h / 2,
            z: (layout.innerZ[0] + layout.innerZ[1]) / 2,
          },
          unit,
        ),
        half: { x: c.width / 2, y: layout.inner.h / 2, z: (layout.innerZ[1] - layout.innerZ[0]) / 2 },
        rotation: unit.rotation,
      });
      this.editor.preview(
        [{ type: 'unit.item.move', unit: d.unit, item: d.item, column: col.id, y: Math.round(y) }],
        'Move item',
      );
    }
  }

  dragEnd(e: ToolPointer | null, cancelled: boolean) {
    const d = this.active;
    this.active = null;
    this.view.setGuides([]);
    this.view.setTarget(null);
    if (!d) return;
    if (d.kind === 'marquee') {
      this.editor.setMarquee(null);
      if (cancelled || !e) return;
      const x0 = Math.min(d.x0, e.x),
        x1 = Math.max(d.x0, e.x),
        y0 = Math.min(d.y0, e.y),
        y1 = Math.max(d.y0, e.y);
      const ids = [...this.editor.committedScene().entities.values()]
        .filter((s) => {
          const p = this.view.toScreen(s.bounds.center);
          return p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;
        })
        .map((s) => s.id);
      this.editor.select(ids, 'add');
      return;
    }
    if (cancelled) this.editor.cancelPreview();
    else this.editor.commitPreview();
  }

  click(e: ToolPointer) {
    const hit = e.hit;
    const sel = this.editor.selection();
    if (hit?.kind === 'part' && hit.entityId) {
      if (e.shift) return this.editor.select([hit.entityId], 'toggle');
      const already = sel.entities.length >= 1 && sel.entities.includes(hit.entityId);
      const inner = innerOf(hit.partId!, this.editor.design());
      if (already && inner && (sel.entities.length === 1 || sel.inner) && (!sel.inner || sel.inner.id !== inner.id)) {
        this.editor.selectInner(inner); // second click drills into the item or front
        return;
      }
      this.editor.select([hit.entityId]);
      return;
    }
    if (hit?.kind !== 'handle') this.editor.select([]);
  }

  doubleClick(e: ToolPointer) {
    if (e.hit?.kind === 'part' && e.hit.entityId) this.editor.toggleOpen(e.hit.entityId);
  }

  hover(e: ToolPointer) {
    this.editor.setHover(e.hit?.kind === 'part' ? (e.hit.entityId ?? null) : null);
  }

  cursor(e: ToolPointer): string {
    if (e.hit?.kind === 'handle') return e.hit.handle === 'rotate' ? 'grab' : 'move';
    return e.hit?.kind === 'part' ? 'pointer' : 'default';
  }

  private layoutOf(u: Unit): UnitLayout | null {
    const t = this.editor.catalog.get(u.template.id);
    if (!t || t.kind !== 'unit') return null;
    const l = unitLayout(u, t as UnitTemplate, this.editor.catalog);
    return 'error' in l ? null : l;
  }
}

export { newId };
