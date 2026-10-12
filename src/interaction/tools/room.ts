import { roomWalls, snapCorner, type Op, type Room } from '../../core';
import type { HandleSpec } from '../../render/overlays';
import { intersectPlane, pxToMm } from '../geom';
import type { EditorPort, Tool, ToolPointer, ViewPort } from '../types';

const INSET = 180; // mm: opening handles sit inside the room, clear of the wall handle when centred on the wall

/** Room-edit handles: one per corner, one at the middle of each wall, one per opening. */
export function roomHandles(room: Room): HandleSpec[] {
  const walls = roomWalls(room);
  const out: HandleSpec[] = room.corners.map((c) => ({ id: `corner:${c.id}`, position: { x: c.x, y: 0, z: c.z } }));
  for (const w of walls) {
    out.push({ id: `wall:${w.key}`, position: { x: (w.a.x + w.b.x) / 2, y: 0, z: (w.a.z + w.b.z) / 2 } });
  }
  for (const o of room.openings) {
    const w = walls.find((x) => x.key === o.wall);
    if (!w) continue;
    const t = (o.offset + o.width / 2) / (w.length || 1);
    out.push({
      id: `opening:${o.id}`,
      position: {
        x: w.a.x + (w.b.x - w.a.x) * t + w.inward.x * INSET,
        y: o.sill + o.height / 2,
        z: w.a.z + (w.b.z - w.a.z) * t + w.inward.z * INSET,
      },
    });
  }
  return out;
}

type Drag =
  | { kind: 'corner'; id: string; neighbours: { x: number; z: number }[] }
  | { kind: 'wall'; key: string; start: { x: number; z: number } }
  | { kind: 'opening'; id: string };

const mm = (v: number) => `${Math.round(v)} mm`;

/**
 * Room edit (docs/v2/06-interaction.md#tools): drag corners (grid + square to neighbours), walls (along their
 * normal) and openings (along their wall). Double-click a wall handle to add a corner, a corner to remove it.
 */
export class RoomTool implements Tool {
  readonly id = 'room';
  private active: Drag | null = null;
  private failed: string | null = null;

  constructor(
    private readonly editor: EditorPort,
    private readonly view: ViewPort,
  ) {}

  down(e: ToolPointer): boolean {
    this.editor.setStatus(null);
    const h = e.hit?.kind === 'handle' ? e.hit.handle : undefined;
    if (!h || h === 'rotate') return false;
    const [kind, ref] = [h.slice(0, h.indexOf(':')), h.slice(h.indexOf(':') + 1)];
    const room = this.editor.design().room;
    if (kind === 'corner') {
      const i = room.corners.findIndex((c) => c.id === ref);
      if (i < 0) return false;
      const n = room.corners.length;
      this.active = { kind, id: ref, neighbours: [room.corners[(i + n - 1) % n]!, room.corners[(i + 1) % n]!] };
    } else if (kind === 'wall') {
      const p = this.floor(e);
      if (!p) return false;
      this.active = { kind, key: ref, start: p };
    } else if (kind === 'opening') this.active = { kind, id: ref };
    else return false;
    return true;
  }

  drag(e: ToolPointer) {
    const d = this.active;
    if (!d) return;
    const room = this.editor.design().room;
    const p = this.floor(e);
    if (!p) return;
    const grid = e.alt || !this.editor.snapping() ? 1 : this.editor.grid();
    let ops: Op[] = [];
    let status = '';
    if (d.kind === 'corner') {
      const threshold = e.alt || !this.editor.snapping() ? 0 : pxToMm(this.view, { x: p.x, y: 0, z: p.z });
      const s = snapCorner(p, d.neighbours, grid, threshold);
      ops = [{ type: 'room.corner.move', id: d.id, to: { x: s.x, z: s.z } }];
      const [a, b] = d.neighbours as [{ x: number; z: number }, { x: number; z: number }];
      status = `Walls ${mm(Math.hypot(s.x - a.x, s.z - a.z))} · ${mm(Math.hypot(b.x - s.x, b.z - s.z))}${s.square.length ? ' · square' : ''}`;
    } else if (d.kind === 'wall') {
      const w = roomWalls(room).find((x) => x.key === d.key);
      if (!w) return;
      const off = Math.round(((p.x - d.start.x) * w.inward.x + (p.z - d.start.z) * w.inward.z) / grid) * grid;
      const [a, b] = d.key.split('>') as [string, string];
      const move = (id: string, c: { x: number; z: number }): Op => ({
        type: 'room.corner.move',
        id,
        to: { x: Math.round(c.x + w.inward.x * off), z: Math.round(c.z + w.inward.z * off) },
      });
      ops = [move(a, w.a), move(b, w.b)];
      status = `Wall ${mm(w.length)} · moved ${mm(-off)}`;
    } else {
      const o = room.openings.find((x) => x.id === d.id);
      const w = o && roomWalls(room).find((x) => x.key === o.wall);
      if (!o || !w) return;
      const t = (p.x - w.a.x) * ((w.b.x - w.a.x) / w.length) + (p.z - w.a.z) * ((w.b.z - w.a.z) / w.length);
      const offset = Math.max(0, Math.min(w.length - o.width, Math.round((t - o.width / 2) / grid) * grid));
      ops = [{ type: 'room.opening.update', id: o.id, patch: { offset: Math.floor(offset) } }];
      status = `${o.kind} ${mm(offset)} from the corner · ${mm(w.length - offset - o.width)} to the next`;
    }
    const r = this.editor.preview(ops, 'Edit room');
    this.failed = r.ok ? null : (r.results.find((x) => !x.ok)?.message ?? 'Not possible');
    this.editor.setStatus(this.failed ?? status);
  }

  dragEnd(_e: ToolPointer | null, cancelled: boolean) {
    this.active = null;
    if (cancelled || this.failed) {
      this.editor.cancelPreview();
      if (cancelled) this.editor.setStatus(null);
    } else {
      this.editor.commitPreview();
      this.editor.setStatus(null);
    }
    this.failed = null;
  }

  click() {
    this.active = null;
  }

  doubleClick(e: ToolPointer) {
    this.active = null;
    const h = e.hit?.kind === 'handle' ? e.hit.handle : undefined;
    if (!h) return;
    const ref = h.slice(h.indexOf(':') + 1);
    const room = this.editor.design().room;
    let r;
    if (h.startsWith('wall:')) {
      const w = roomWalls(room).find((x) => x.key === ref);
      if (!w) return;
      const at = { x: Math.round((w.a.x + w.b.x) / 2), z: Math.round((w.a.z + w.b.z) / 2) };
      r = this.editor.apply([{ type: 'room.corner.insert', after: ref.split('>')[0]!, at }], 'Add a corner');
    } else if (h.startsWith('corner:')) {
      r = this.editor.apply([{ type: 'room.corner.remove', id: ref }], 'Remove a corner');
    } else return;
    if (!r.ok) this.editor.setStatus(r.results.find((x) => !x.ok)?.message ?? 'Not possible');
  }

  cursor(e: ToolPointer) {
    return e.hit?.kind === 'handle' ? 'move' : 'default';
  }

  private floor(e: ToolPointer) {
    const p = intersectPlane(this.view.ray(e.x, e.y), { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    return p ? { x: p.x, z: p.z } : null;
  }
}
