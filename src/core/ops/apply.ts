import type { CatalogRegistry, UnitTemplate } from '../catalog/types';
import { footprint, localAxes, rotateXZ } from '../geometry/footprint';
import { signedArea } from '../geometry/polygon';
import { unitLayout } from '../invariants';
import type { Design } from '../schema/design';
import type { Entity, Front, Group, Unit } from '../schema/entities';
import { MAX_COORD } from '../schema/primitives';
import { wallKey, type Room } from '../schema/room';
import {
  fail,
  normalizeEntity,
  normalizeFront,
  normalizeItem,
  resolveTemplate,
  stripUndefined,
  templateParams,
} from './normalize';
import type { Op, ParsedOp } from './schema';

export interface ApplyCtx {
  newId(): string;
  catalog: CatalogRegistry;
}

export interface OpOutcome {
  doc: Design;
  inverse: Op[];
  message: string;
  created?: string[];
  notes: string[];
}

const round = (v: number) => Math.round(v * 1000) / 1000;
const normDeg = (d: number) => ((round(d) % 360) + 360) % 360;

/* ───────────────────────── helpers ───────────────────────── */

function entity(d: Design, id: string): Entity {
  return d.entities[id] ?? fail(`no entity with id "${id}"`);
}

function editable(d: Design, id: string): Entity {
  const e = entity(d, id);
  if (e.locked) fail(`"${e.name}" is locked`);
  return e;
}

function unitOf(d: Design, id: string): Unit {
  const e = editable(d, id);
  if (e.kind !== 'unit') fail(`"${e.name}" is not a unit`);
  return e as Unit;
}

const putEntity = (d: Design, e: Entity): Design => ({ ...d, entities: { ...d.entities, [e.id]: e } });

const restore = (e: Entity): Op => ({ type: 'entity.put', entity: e });

function columnIndex(u: Unit, columnId: string): number {
  const i = u.columns.findIndex((c) => c.id === columnId);
  return i >= 0 ? i : fail(`unit "${u.name}" has no column "${columnId}"`);
}

function findItem(u: Unit, itemId: string) {
  for (let ci = 0; ci < u.columns.length; ci++) {
    const ii = u.columns[ci]!.items.findIndex((i) => i.id === itemId);
    if (ii >= 0) return { ci, ii, item: u.columns[ci]!.items[ii]! };
  }
  return fail(`unit "${u.name}" has no item "${itemId}"`);
}

function clampCoord(v: number, notes: string[], what: string) {
  if (v > MAX_COORD || v < -MAX_COORD) {
    notes.push(`${what} clamped to ±${MAX_COORD} mm`);
    return Math.max(-MAX_COORD, Math.min(MAX_COORD, v));
  }
  return v;
}

function unitTemplate(u: Unit, catalog: CatalogRegistry): UnitTemplate {
  return resolveTemplate(catalog, u.template, 'unit').template;
}

/** Remaps front column ranges after columns change; returns null to refuse. */
function remapFronts(fronts: Front[], map: (c: number) => number | null): Front[] | string {
  const out: Front[] = [];
  for (const f of fronts) {
    const a = map(f.columns[0]);
    const b = map(f.columns[1]);
    if (a === null || b === null) return `front "${f.id}" covers the affected column — change or remove it first`;
    out.push({ ...f, columns: [a, b] });
  }
  return out;
}

/* ───────────────────────── entity ops ───────────────────────── */

function entityOps(d: Design, op: ParsedOp, ctx: ApplyCtx, notes: string[]): OpOutcome | null {
  switch (op.type) {
    case 'entity.add': {
      const e = normalizeEntity(op.entity, ctx.catalog, ctx.newId, notes);
      if (d.entities[e.id]) fail(`an entity with id "${e.id}" already exists`);
      const doc: Design = { ...putEntity(d, e), order: [...d.order, e.id] };
      return {
        doc,
        inverse: [{ type: 'entity.delete', ids: [e.id] }],
        message: `added ${e.kind} "${e.name}" (${e.id})`,
        created: [e.id],
        notes,
      };
    }

    case 'entity.remove': {
      const ids = [...new Set(op.ids)];
      const removed = ids.map((id) => editable(d, id));
      const gone = new Set(ids);
      const entities = { ...d.entities };
      for (const id of ids) delete entities[id];
      const groups: Record<string, Group> = {};
      for (const g of Object.values(d.groups)) {
        const members = g.members.filter((m) => !gone.has(m));
        if (new Set(members).size >= 2) groups[g.id] = { ...g, members };
      }
      const indexed = removed.map((e) => ({ e, index: d.order.indexOf(e.id) })).sort((a, b) => a.index - b.index);
      return {
        doc: { ...d, entities, order: d.order.filter((id) => !gone.has(id)), groups },
        inverse: [
          ...indexed.map(({ e, index }): Op => ({ type: 'entity.put', entity: e, index })),
          { type: 'groups.put', groups: d.groups },
        ],
        message: `removed ${removed.map((e) => `"${e.name}"`).join(', ')}`,
        notes,
      };
    }

    case 'entity.move': {
      let doc = d;
      const inverse: Op[] = [];
      for (const id of new Set(op.ids)) {
        const e = editable(doc, id);
        inverse.push(restore(e));
        const p = e.position;
        doc = putEntity(doc, {
          ...e,
          position: {
            x: clampCoord(round(p.x + op.delta.x), notes, 'x'),
            y: Math.max(0, clampCoord(round(p.y + op.delta.y), notes, 'y')),
            z: clampCoord(round(p.z + op.delta.z), notes, 'z'),
          },
        });
      }
      return { doc, inverse, message: `moved ${op.ids.length} ${op.ids.length === 1 ? 'entity' : 'entities'}`, notes };
    }

    case 'entity.rotate': {
      const es = [...new Set(op.ids)].map((id) => editable(d, id));
      let pivot = op.pivot;
      if (!pivot) {
        const fps = es.map((e) => footprint(e, ctx.catalog));
        pivot = {
          x: (Math.min(...fps.map((f) => f.minX)) + Math.max(...fps.map((f) => f.maxX))) / 2,
          z: (Math.min(...fps.map((f) => f.minZ)) + Math.max(...fps.map((f) => f.maxZ))) / 2,
        };
      }
      let doc = d;
      for (const e of es) {
        const p = rotateXZ(e.position, pivot, op.degrees);
        doc = putEntity(doc, {
          ...e,
          position: { x: round(p.x), y: e.position.y, z: round(p.z) },
          rotation: normDeg(e.rotation + op.degrees),
        });
      }
      return { doc, inverse: es.map(restore), message: `rotated ${es.length} by ${op.degrees}°`, notes };
    }

    case 'entity.update': {
      const e = entity(d, op.id);
      const { type: _t, id: _i, ...changes } = op;
      const keys = Object.entries(changes)
        .filter(([, v]) => v !== undefined)
        .map(([k]) => k);
      if (e.locked && !(keys.length === 1 && keys[0] === 'locked' && op.locked === false))
        fail(`"${e.name}" is locked — unlock it first`);
      let next: Entity = { ...e };
      if (op.name !== undefined) next.name = op.name;
      if (op.locked !== undefined) next.locked = op.locked;
      if (op.params !== undefined) {
        if (next.kind === 'opaque') fail(`"${e.name}" cannot be edited (unknown template)`);
        else {
          const t = resolveTemplate(ctx.catalog, next.template, next.kind === 'unit' ? 'unit' : 'part');
          next = { ...next, params: templateParams(t.template, t.template.version, op.params, next.params, notes) };
        }
      }
      if (op.materials !== undefined) {
        if (next.kind !== 'unit') fail('materials apply to units; use material for parts');
        else next = { ...next, materials: { ...next.materials, ...stripUndefined(op.materials) } };
      }
      if (op.material !== undefined) {
        if (next.kind !== 'part') fail('material applies to free parts; use materials for units');
        else next = { ...next, material: op.material };
      }
      return { doc: putEntity(d, next), inverse: [restore(e)], message: `updated "${next.name}"`, notes };
    }

    case 'entity.put': {
      const exists = !!d.entities[op.entity.id];
      const order = exists ? d.order : [...d.order];
      if (!exists) order.splice(op.index ?? order.length, 0, op.entity.id);
      const inverse: Op[] = exists
        ? [restore(d.entities[op.entity.id]!)]
        : [{ type: 'entity.delete', ids: [op.entity.id] }];
      return { doc: { ...putEntity(d, op.entity), order }, inverse, message: `restored "${op.entity.name}"`, notes };
    }

    case 'entity.delete': {
      const ids = [...new Set(op.ids)];
      const removed = ids.map((id) => entity(d, id));
      const entities = { ...d.entities };
      for (const id of ids) delete entities[id];
      const indexed = removed.map((e) => ({ e, index: d.order.indexOf(e.id) })).sort((a, b) => a.index - b.index);
      return {
        doc: { ...d, entities, order: d.order.filter((id) => !ids.includes(id)) },
        inverse: indexed.map(({ e, index }) => ({ type: 'entity.put', entity: e, index })),
        message: `deleted ${ids.length}`,
        notes,
      };
    }
    default:
      return null;
  }
}

/* ───────────────────────── unit ops ───────────────────────── */

function resize(
  u: Unit,
  size: { w?: number | undefined; h?: number | undefined; d?: number | undefined },
  anchor: { x?: string | undefined; z?: string | undefined } | undefined,
  ctx: ApplyCtx,
  notes: string[],
): Unit {
  const t = unitTemplate(u, ctx.catalog);
  const lim = t.sizeLimits;
  const clamp = (v: number, [lo, hi]: [number, number], key: string) => {
    const c = Math.min(hi, Math.max(lo, v));
    if (c !== v) notes.push(`${key} clamped to ${c} (${lo}–${hi})`);
    return c;
  };
  const next = {
    w: size.w === undefined ? u.size.w : clamp(size.w, lim.w, 'width'),
    h: size.h === undefined ? u.size.h : clamp(size.h, lim.h, 'height'),
    d: size.d === undefined ? u.size.d : clamp(size.d, lim.d, 'depth'),
  };
  // Keep the anchored faces in place: the bottom-centre moves by half the change towards the free face.
  const ax = localAxes(u.rotation);
  const shift = (a: string | undefined, change: number) => (a === 'min' ? change / 2 : a === 'max' ? -change / 2 : 0);
  const sx = shift(anchor?.x, next.w - u.size.w);
  const sz = shift(anchor?.z, next.d - u.size.d);
  const position = {
    x: round(u.position.x + ax.x.x * sx + ax.z.x * sz),
    y: u.position.y,
    z: round(u.position.z + ax.x.z * sx + ax.z.z * sz),
  };

  let out: Unit = { ...u, size: next, position };
  const layout = unitLayout(out, t, ctx.catalog);
  if ('error' in layout) return fail(`cannot resize "${u.name}": ${layout.error}`);

  // Height reflow: items keep their y; ones that no longer fit are pushed down below the next item / the top.
  const columns = out.columns.map((col, ci) => {
    const items = [...col.items].sort((a, b) => b.y - a.y);
    let limit = layout.inner.h;
    const placed = items.map((item) => {
      const it = resolveTemplate(ctx.catalog, item.template, 'item').template;
      const h = it.height(item.params, { layout, column: ci });
      let y = item.y;
      if (y + h > limit) {
        y = round(limit - h);
        notes.push(`"${it.name}" moved down to ${y} mm to fit`);
      }
      if (y < 0) fail(`cannot make "${u.name}" that low: column ${ci + 1} no longer fits its items`);
      limit = y;
      return { ...item, y };
    });
    return { ...col, items: placed.sort((a, b) => a.y - b.y) };
  });
  const fronts = out.fronts.map((f) => {
    const top = Math.abs(f.y[1] - u.size.h) < 1e-6 ? next.h : Math.min(f.y[1], next.h);
    if (f.y[0] >= top) fail(`cannot make "${u.name}" that low: a front would disappear — remove it first`);
    return { ...f, y: [f.y[0], top] as [number, number] };
  });
  out = { ...out, columns, fronts };
  return out;
}

function unitOps(d: Design, op: ParsedOp, ctx: ApplyCtx, notes: string[]): OpOutcome | null {
  switch (op.type) {
    case 'unit.resize': {
      const u = unitOf(d, op.id);
      const next = resize(u, op.size, op.anchor, ctx, notes);
      return {
        doc: putEntity(d, next),
        inverse: [restore(u)],
        message: `resized "${u.name}" to ${next.size.w} × ${next.size.h} × ${next.size.d}`,
        notes,
      };
    }

    case 'unit.column.add': {
      const u = unitOf(d, op.unit);
      const at = Math.min(op.at, u.columns.length);
      const columns = [...u.columns];
      const id = op.id ?? ctx.newId();
      columns.splice(at, 0, { id, width: op.width, items: [] });
      // Fronts right of the insertion shift; a front spanning across the insertion point now covers it too.
      const fronts = remapFronts(u.fronts, (c) => (c >= at ? c + 1 : c)) as Front[];
      return {
        doc: putEntity(d, { ...u, columns, fronts }),
        inverse: [restore(u)],
        message: `added a column to "${u.name}"`,
        created: [id],
        notes,
      };
    }

    case 'unit.column.remove': {
      const u = unitOf(d, op.unit);
      const ci = columnIndex(u, op.column);
      if (u.columns.length === 1) fail(`"${u.name}" needs at least one column`);
      const items = new Set(u.columns[ci]!.items.map((i) => i.id));
      // Drawer fronts go with their drawers; fronts spanning several columns shrink; a front over only this column refuses.
      const spanning = remapSpanning(
        u.fronts.filter((f) => !(f.drawer && items.has(f.drawer))),
        ci,
      );
      if (typeof spanning === 'string') fail(spanning);
      const columns = u.columns.filter((_, i) => i !== ci);
      return {
        doc: putEntity(d, { ...u, columns, fronts: spanning as Front[] }),
        inverse: [restore(u)],
        message: `removed column ${ci + 1} from "${u.name}"`,
        notes,
      };
    }

    case 'unit.column.update': {
      const u = unitOf(d, op.unit);
      const ci = columnIndex(u, op.column);
      const columns = u.columns.map((c, i) => (i === ci ? { ...c, width: op.width } : c));
      return {
        doc: putEntity(d, { ...u, columns }),
        inverse: [restore(u)],
        message: `column ${ci + 1} width set to ${op.width}`,
        notes,
      };
    }

    case 'unit.column.move': {
      const u = unitOf(d, op.unit);
      const from = columnIndex(u, op.column);
      const to = Math.min(op.to, u.columns.length - 1);
      const order = u.columns.map((_, i) => i);
      order.splice(to, 0, ...order.splice(from, 1));
      const newIndex = (old: number) => order.indexOf(old);
      const moved: Front[] = [];
      for (const f of u.fronts) {
        if (f.columns[0] !== f.columns[1] && f.columns[0] <= Math.max(from, to) && f.columns[1] >= Math.min(from, to)) {
          fail(`front "${f.id}" spans the columns being reordered — change it first`);
        }
        moved.push({ ...f, columns: [newIndex(f.columns[0]), newIndex(f.columns[1])] });
      }
      const columns = order.map((i) => u.columns[i]!);
      return {
        doc: putEntity(d, { ...u, columns, fronts: moved }),
        inverse: [restore(u)],
        message: `moved column ${from + 1} to ${to + 1}`,
        notes,
      };
    }

    case 'unit.item.add': {
      const u = unitOf(d, op.unit);
      const ci = columnIndex(u, op.column);
      const item = normalizeItem(
        { id: op.id, template: op.template, y: op.y, params: op.params, material: op.material },
        ctx.catalog,
        ctx.newId,
        notes,
      );
      const columns = u.columns.map((c, i) =>
        i === ci ? { ...c, items: [...c.items, item].sort((a, b) => a.y - b.y) } : c,
      );
      return {
        doc: putEntity(d, { ...u, columns }),
        inverse: [restore(u)],
        message: `added ${item.template.id.split('.').pop()} to column ${ci + 1} of "${u.name}"`,
        created: [item.id],
        notes,
      };
    }

    case 'unit.item.update': {
      const u = unitOf(d, op.unit);
      const { ci, item } = findItem(u, op.item);
      const t = resolveTemplate(ctx.catalog, item.template, 'item');
      const next = {
        ...item,
        ...(op.y !== undefined ? { y: op.y } : {}),
        ...(op.params !== undefined
          ? { params: templateParams(t.template, t.template.version, op.params, item.params, notes) }
          : {}),
        ...(op.material !== undefined ? { material: op.material } : {}),
      };
      const columns = u.columns.map((c, i) =>
        i === ci ? { ...c, items: c.items.map((x) => (x.id === item.id ? next : x)).sort((a, b) => a.y - b.y) } : c,
      );
      return {
        doc: putEntity(d, { ...u, columns }),
        inverse: [restore(u)],
        message: `updated ${t.template.name.toLowerCase()} in "${u.name}"`,
        notes,
      };
    }

    case 'unit.item.remove': {
      const u = unitOf(d, op.unit);
      const { ci } = findItem(u, op.item);
      const columns = u.columns.map((c, i) =>
        i === ci ? { ...c, items: c.items.filter((x) => x.id !== op.item) } : c,
      );
      const fronts = u.fronts.filter((f) => f.drawer !== op.item); // a drawer front goes with its drawer
      return {
        doc: putEntity(d, { ...u, columns, fronts }),
        inverse: [restore(u)],
        message: `removed an item from "${u.name}"`,
        notes,
      };
    }

    case 'unit.item.move': {
      const u = unitOf(d, op.unit);
      const { ci, item } = findItem(u, op.item);
      const to = columnIndex(u, op.column);
      const linked = u.fronts.find((f) => f.drawer === item.id);
      if (linked && (to < linked.columns[0] || to > linked.columns[1]))
        fail(`the drawer's front covers other columns — move or remove the front first`);
      const columns = u.columns.map((c, i) => {
        let items = i === ci ? c.items.filter((x) => x.id !== item.id) : c.items;
        if (i === to) items = [...items, { ...item, y: op.y }].sort((a, b) => a.y - b.y);
        return { ...c, items };
      });
      return {
        doc: putEntity(d, { ...u, columns }),
        inverse: [restore(u)],
        message: `moved an item in "${u.name}"`,
        notes,
      };
    }

    case 'unit.front.add': {
      const u = unitOf(d, op.unit);
      const f = normalizeFront(
        {
          id: op.id,
          template: op.template,
          columns: op.columns,
          y: op.y,
          params: op.params,
          drawer: op.drawer,
          material: op.material,
        },
        ctx.catalog,
        ctx.newId,
        notes,
      );
      return {
        doc: putEntity(d, { ...u, fronts: [...u.fronts, f] }),
        inverse: [restore(u)],
        message: `added a front to "${u.name}"`,
        created: [f.id],
        notes,
      };
    }

    case 'unit.front.update': {
      const u = unitOf(d, op.unit);
      const f = u.fronts.find((x) => x.id === op.front) ?? fail(`unit "${u.name}" has no front "${op.front}"`);
      const t = resolveTemplate(ctx.catalog, f.template, 'front');
      const next: Front = {
        ...f,
        ...(op.columns ? { columns: op.columns } : {}),
        ...(op.y ? { y: op.y } : {}),
        ...(op.params !== undefined
          ? { params: templateParams(t.template, t.template.version, op.params, f.params, notes) }
          : {}),
        ...(op.material !== undefined ? { material: op.material } : {}),
      };
      return {
        doc: putEntity(d, { ...u, fronts: u.fronts.map((x) => (x.id === f.id ? next : x)) }),
        inverse: [restore(u)],
        message: `updated a front of "${u.name}"`,
        notes,
      };
    }

    case 'unit.front.remove': {
      const u = unitOf(d, op.unit);
      if (!u.fronts.some((f) => f.id === op.front)) fail(`unit "${u.name}" has no front "${op.front}"`);
      return {
        doc: putEntity(d, { ...u, fronts: u.fronts.filter((f) => f.id !== op.front) }),
        inverse: [restore(u)],
        message: `removed a front from "${u.name}"`,
        notes,
      };
    }
    default:
      return null;
  }
}

/** Shrinks fronts spanning a removed column; refuses fronts that covered only that column. */
function remapSpanning(fronts: Front[], removed: number): Front[] | string {
  const out: Front[] = [];
  for (const f of fronts) {
    const [a, b] = f.columns;
    if (a === removed && b === removed) return `front "${f.id}" covers only that column — remove the front first`;
    const map = (c: number) => (c > removed ? c - 1 : c);
    out.push({ ...f, columns: [map(a === removed ? a + 1 : a), map(b === removed ? b - 1 : b)] });
  }
  return out;
}

/* ───────────────────────── groups, room, materials ───────────────────────── */

function wallLength(room: Room, key: string): number {
  const [a, b] = key.split('>');
  const ca = room.corners.find((c) => c.id === a);
  const cb = room.corners.find((c) => c.id === b);
  return ca && cb ? Math.hypot(cb.x - ca.x, cb.z - ca.z) : 0;
}

function roomChange(d: Design, room: Room, message: string, notes: string[]): OpOutcome {
  if (signedArea(room.corners) <= 0) fail('that would turn the room inside out');
  return { doc: { ...d, room }, inverse: [{ type: 'room.put', room: d.room }], message, notes };
}

function otherOps(d: Design, op: ParsedOp, ctx: ApplyCtx, notes: string[]): OpOutcome | null {
  const room = d.room;
  switch (op.type) {
    case 'group.create': {
      const members = [...new Set(op.members)];
      if (members.length < 2) fail('a group needs at least two different entities');
      for (const m of members) entity(d, m);
      const inGroup = Object.values(d.groups).find((g) => g.members.some((m) => members.includes(m)));
      if (inGroup) fail(`some of these are already in group "${inGroup.name ?? inGroup.id}" — ungroup first`);
      const id = op.id ?? ctx.newId();
      const group: Group = { id, members, ...(op.name ? { name: op.name } : {}) };
      return {
        doc: { ...d, groups: { ...d.groups, [id]: group } },
        inverse: [{ type: 'groups.put', groups: d.groups }],
        message: `grouped ${members.length} entities`,
        created: [id],
        notes,
      };
    }
    case 'group.dissolve': {
      if (!d.groups[op.id]) fail(`no group "${op.id}"`);
      const groups = { ...d.groups };
      delete groups[op.id];
      return {
        doc: { ...d, groups },
        inverse: [{ type: 'groups.put', groups: d.groups }],
        message: 'ungrouped',
        notes,
      };
    }
    case 'groups.put':
      return {
        doc: { ...d, groups: op.groups },
        inverse: [{ type: 'groups.put', groups: d.groups }],
        message: 'restored groups',
        notes,
      };

    case 'room.update': {
      const next: Room = {
        ...room,
        ...(op.height !== undefined ? { height: op.height } : {}),
        ...(op.wallColor !== undefined ? { wallColor: op.wallColor } : {}),
        floor: { ...room.floor, ...stripUndefined(op.floor ?? {}) },
      };
      return roomChange(d, next, 'updated the room', notes);
    }
    case 'room.corner.move': {
      if (!room.corners.some((c) => c.id === op.id)) fail(`no corner "${op.id}"`);
      const corners = room.corners.map((c) => (c.id === op.id ? { ...c, x: op.to.x, z: op.to.z } : c));
      return roomChange(d, { ...room, corners }, 'moved a corner', notes);
    }
    case 'room.corner.insert': {
      const i = room.corners.findIndex((c) => c.id === op.after);
      if (i < 0) fail(`no corner "${op.after}"`);
      const a = room.corners[i]!;
      const b = room.corners[(i + 1) % room.corners.length]!;
      const n = { id: op.id ?? ctx.newId(), x: op.at.x, z: op.at.z };
      const old = wallKey(a.id, b.id);
      const wall = room.walls[old]!;
      const walls = { ...room.walls };
      delete walls[old];
      walls[wallKey(a.id, n.id)] = wall;
      walls[wallKey(n.id, b.id)] = wall;
      const len1 = Math.hypot(n.x - a.x, n.z - a.z);
      const openings = room.openings.map((o) => {
        if (o.wall !== old) return o;
        if (o.offset + o.width <= len1) return { ...o, wall: wallKey(a.id, n.id) };
        if (o.offset >= len1) return { ...o, wall: wallKey(n.id, b.id), offset: round(o.offset - len1) };
        return fail(`a corner there would split opening "${o.id}"`);
      });
      const corners = [...room.corners];
      corners.splice(i + 1, 0, n);
      const out = roomChange(d, { ...room, corners, walls, openings }, 'added a corner', notes);
      return { ...out, created: [n.id] };
    }
    case 'room.corner.remove': {
      const i = room.corners.findIndex((c) => c.id === op.id);
      if (i < 0) fail(`no corner "${op.id}"`);
      if (room.corners.length <= 3) fail('a room needs at least 3 corners');
      const n = room.corners.length;
      const prev = room.corners[(i - 1 + n) % n]!;
      const cur = room.corners[i]!;
      const next = room.corners[(i + 1) % n]!;
      const k1 = wallKey(prev.id, cur.id);
      const k2 = wallKey(cur.id, next.id);
      if (room.openings.some((o) => o.wall === k1 || o.wall === k2))
        fail('remove the openings on the walls of that corner first');
      const walls = { ...room.walls };
      const keep = walls[k1]!;
      delete walls[k1];
      delete walls[k2];
      walls[wallKey(prev.id, next.id)] = keep;
      return roomChange(
        d,
        { ...room, corners: room.corners.filter((c) => c.id !== op.id), walls },
        'removed a corner',
        notes,
      );
    }
    case 'room.wall.update': {
      const w = room.walls[op.key] ?? fail(`no wall "${op.key}"`);
      const next = { ...w, ...stripUndefined({ thickness: op.thickness, color: op.color }) };
      return roomChange(d, { ...room, walls: { ...room.walls, [op.key]: next } }, 'updated a wall', notes);
    }
    case 'room.opening.add': {
      const o = { ...op.opening, id: op.opening.id ?? ctx.newId(), sill: op.opening.sill ?? 0 };
      if (!room.walls[o.wall]) fail(`no wall "${o.wall}"`);
      if (o.offset + o.width > wallLength(room, o.wall) + 1e-6)
        fail(`the opening extends beyond the wall (${Math.round(wallLength(room, o.wall))} mm)`);
      const out = roomChange(
        d,
        { ...room, openings: [...room.openings, stripUndefined(o) as Room['openings'][number]] },
        `added a ${o.kind}`,
        notes,
      );
      return { ...out, created: [o.id] };
    }
    case 'room.opening.update': {
      const o = room.openings.find((x) => x.id === op.id) ?? fail(`no opening "${op.id}"`);
      const next = { ...o, ...stripUndefined(op.patch) };
      return roomChange(
        d,
        { ...room, openings: room.openings.map((x) => (x.id === o.id ? next : x)) },
        `updated a ${o.kind}`,
        notes,
      );
    }
    case 'room.opening.remove': {
      if (!room.openings.some((x) => x.id === op.id)) fail(`no opening "${op.id}"`);
      return roomChange(
        d,
        { ...room, openings: room.openings.filter((x) => x.id !== op.id) },
        'removed an opening',
        notes,
      );
    }
    case 'room.obstacle.add': {
      const o = { ...op.obstacle, id: op.obstacle.id ?? ctx.newId() };
      if (!(o.min.x < o.max.x && o.min.y < o.max.y && o.min.z < o.max.z))
        fail('an obstacle needs min < max on every axis');
      const out = roomChange(
        d,
        { ...room, obstacles: [...room.obstacles, stripUndefined(o) as Room['obstacles'][number]] },
        `added a ${o.kind}`,
        notes,
      );
      return { ...out, created: [o.id] };
    }
    case 'room.obstacle.update': {
      const o = room.obstacles.find((x) => x.id === op.id) ?? fail(`no obstacle "${op.id}"`);
      const next = { ...o, ...stripUndefined(op.patch) };
      if (!(next.min.x < next.max.x && next.min.y < next.max.y && next.min.z < next.max.z))
        fail('an obstacle needs min < max on every axis');
      return roomChange(
        d,
        { ...room, obstacles: room.obstacles.map((x) => (x.id === o.id ? next : x)) },
        `updated a ${o.kind}`,
        notes,
      );
    }
    case 'room.obstacle.remove': {
      if (!room.obstacles.some((x) => x.id === op.id)) fail(`no obstacle "${op.id}"`);
      return roomChange(
        d,
        { ...room, obstacles: room.obstacles.filter((x) => x.id !== op.id) },
        'removed an obstacle',
        notes,
      );
    }
    case 'room.put':
      return {
        doc: { ...d, room: op.room },
        inverse: [{ type: 'room.put', room }],
        message: 'restored the room',
        notes,
      };

    case 'material.add': {
      if (d.materials[op.id]) fail(`material "${op.id}" already exists`);
      return {
        doc: { ...d, materials: { ...d.materials, [op.id]: op.material } },
        inverse: [{ type: 'materials.put', materials: d.materials }],
        message: `added material "${op.material.name}"`,
        created: [op.id],
        notes,
      };
    }
    case 'material.update': {
      if (!d.materials[op.id]) fail(`no material "${op.id}"`);
      return {
        doc: { ...d, materials: { ...d.materials, [op.id]: op.material } },
        inverse: [{ type: 'materials.put', materials: d.materials }],
        message: `updated material "${op.material.name}"`,
        notes,
      };
    }
    case 'materials.put':
      return {
        doc: { ...d, materials: op.materials },
        inverse: [{ type: 'materials.put', materials: d.materials }],
        message: 'restored materials',
        notes,
      };

    case 'design.rename':
      return {
        doc: { ...d, name: op.name },
        inverse: [{ type: 'design.rename', name: d.name }],
        message: `renamed to "${op.name}"`,
        notes,
      };
    default:
      return null;
  }
}

/** Applies one validated op. Throws OpError (caught by the transaction) for refusals. */
export function applyOp(d: Design, op: ParsedOp, ctx: ApplyCtx): OpOutcome {
  const notes: string[] = [];
  const out = entityOps(d, op, ctx, notes) ?? unitOps(d, op, ctx, notes) ?? otherOps(d, op, ctx, notes);
  return out ?? fail(`unsupported operation "${(op as { type: string }).type}"`);
}
