import {
  applyTransaction,
  createDesign,
  signedArea,
  wallKey,
  type Design,
  type EntityInput,
  type ImportResult,
  type MaterialLibrary,
  type Op,
  type OpaqueEntity,
  type Room,
} from '../core';
import { catalog } from './index';
import { DEFAULT_MATERIALS, DEFAULT_ROLES } from './materials';
import { PRESETS } from './presets';

/**
 * One-way import of v1 designs (`{ version: 1, room, objects }`, docs/v2/11-roadmap.md#v1-import).
 * v1 objects are flat templates with numeric parameters; units are rebuilt as v2 units with columns, items
 * and fronts from those parameters. Anything without a v2 equivalent is kept as an opaque entity and listed.
 */
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown, d: string) => (typeof v === 'string' && v ? v : d);
const hex = (v: unknown) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null);

export function isV1Design(raw: unknown): boolean {
  return isObj(raw) && raw.version === 1 && Array.isArray(raw.objects) && isObj(raw.room);
}

const HANDLES = ['none', 'knob', 'bar', 'grip'] as const; // v1: 0 none, 1 knob, 2 bar, 3 cutout
const HANDLE_POS = ['top', 'middle', 'bottom'] as const;
const FLOORS: Record<string, Room['floor']['finish']> = {
  color: 'color',
  wood: 'planks',
  chevron: 'chevron',
  tiles: 'tiles',
  concrete: 'concrete',
};
const RAIL_BELOW_TOP = 390; // hanging rail and top shelf, as in the v2 presets
const SHELF_BELOW_TOP = 330;

const pick = <T>(list: readonly T[], i: number, d: T) => list[Math.round(i)] ?? d;

/** Evenly spaced shelves in a column `innerH` tall (bottom of each shelf above the column floor). */
function shelves(n: number, innerH: number, t: number) {
  const gap = (innerH - n * t) / (n + 1);
  return Array.from({ length: Math.max(0, Math.round(n)) }, (_, k) => ({
    template: { id: 'item.shelf' },
    y: Math.round((k + 1) * gap + k * t),
  }));
}

function doorFronts(p: Obj, h: number): unknown[] {
  const handle = pick(HANDLES, num(p.handle, 1), 'knob');
  const common = {
    handle,
    handlePos: pick(HANDLE_POS, num(p.handlePos, 1), 'middle'),
    handleInset: num(p.handleInset, 50),
  };
  return Math.round(num(p.doors, 2)) === 1
    ? [
        {
          template: { id: 'front.door' },
          columns: [0, 0] as [number, number],
          y: [0, h] as [number, number],
          params: { ...common, hinge: num(p.hinge, 0) === 1 ? 'right' : 'left' },
        },
      ]
    : [
        {
          template: { id: 'front.double-door' },
          columns: [0, 0] as [number, number],
          y: [0, h] as [number, number],
          params: common,
        },
      ];
}

/** The v2 entity for a v1 object, or the reason it has none. */
function convert(o: Obj, id: string): EntityInput | string {
  const p = isObj(o.params) ? o.params : {};
  const tpl = str(o.templateId, '?');
  const w = num(p.width, 800);
  const h = num(p.height, 2200);
  const d = num(p.depth, 580);
  const t = num(p.thickness, 18);
  const base = {
    id,
    name: str(o.name, tpl),
    position: {
      x: num((o.position as Obj | undefined)?.x, 0),
      y: num((o.position as Obj | undefined)?.y, 0),
      z: num((o.position as Obj | undefined)?.z, 0),
    },
    rotation: num(o.rotationY, 0),
    locked: o.locked === true,
  };
  const unit = (columns: unknown[], fronts: unknown[] = [], size = { w, h, d }) =>
    ({
      ...base,
      kind: 'unit',
      template: { id: 'unit.standard' },
      size,
      params: { thickness: t },
      columns,
      fronts,
    }) as EntityInput;
  const innerH = h - 2 * t;
  switch (tpl) {
    case 'carcass':
    case 'open-shelving':
      return unit([{ width: 'auto', items: shelves(num(p.shelves, 3), innerH, t) }]);
    case 'carcass-doors':
    case 'shoe-cabinet':
    case 'top-cabinet':
      return unit(
        [{ width: 'auto', items: shelves(num(p.shelves, tpl === 'top-cabinet' ? 0 : 3), innerH, t) }],
        doorFronts(p, h),
      );
    case 'wardrobe':
      return unit(
        [
          {
            width: 'auto',
            items: [
              { template: { id: 'item.rail' }, y: innerH - RAIL_BELOW_TOP },
              { template: { id: 'item.shelf' }, y: innerH - SHELF_BELOW_TOP, params: { type: 'fixed' } },
            ],
          },
        ],
        doorFronts({ ...p, handle: num(p.handle, 2) }, h),
      );
    case 'sliding-wardrobe': {
      // The v2 preset has the same layout (hanging left, shelves right); its items are rebuilt for this height.
      const preset = PRESETS.find((x) => x.id === 'preset.wardrobe-sliding')!.entity as { fronts: { params?: Obj }[] };
      const half = shelves(4, innerH, t);
      return unit(
        [
          {
            width: 'auto',
            items: [
              { template: { id: 'item.rail' }, y: innerH - RAIL_BELOW_TOP },
              { template: { id: 'item.shelf' }, y: innerH - SHELF_BELOW_TOP, params: { type: 'fixed' } },
            ],
          },
          { width: 'auto', items: half },
        ],
        [
          {
            template: { id: 'front.sliding' },
            columns: [0, 0],
            y: [0, h],
            params: { ...preset.fronts[0]!.params, handle: pick(HANDLES, num(p.handle, 3), 'grip') },
          },
          {
            template: { id: 'front.sliding' },
            columns: [1, 1],
            y: [0, h],
            params: { ...preset.fronts[1]!.params, handle: pick(HANDLES, num(p.handle, 3), 'grip') },
          },
        ],
      );
    }
    case 'drawer-unit': {
      const n = Math.max(1, Math.round(num(p.drawers, 4)));
      const span = h / n;
      const drawers = Array.from({ length: n }, (_, k) => ({
        id: `${id}-d${k}`,
        template: { id: 'item.drawer' },
        y: Math.max(0, Math.round(k * span + 10 - t)),
        params: {
          height: Math.max(80, Math.min(600, Math.floor(span - 20 - t))),
          style: 'external',
          handle: pick(HANDLES, num(p.handle, 2), 'bar'),
        },
      }));
      return unit(
        [{ width: 'auto', items: drawers }],
        drawers.map((dr, k) => ({
          template: { id: 'front.drawer' },
          columns: [0, 0],
          y: [Math.round(k * span), Math.round((k + 1) * span)],
          drawer: dr.id,
          params: { handle: pick(HANDLES, num(p.handle, 2), 'bar') },
        })),
      );
    }
    case 'corner-unit':
      return {
        ...base,
        kind: 'unit',
        template: { id: 'unit.corner' },
        size: { w: num(p.width, 1200), h, d: num(p.depth, 1200) },
        params: { thickness: t, armDepth: num(p.armDepth, 580), shelves: num(p.shelves, 4) },
        columns: [{ width: 'auto', items: [] }],
        fronts: [],
      } as EntityInput;
    case 'plinth':
      return {
        ...base,
        kind: 'part',
        template: { id: 'part.plinth' },
        params: { width: w, height: num(p.height, 100), depth: num(p.depth, 560) },
      } as EntityInput;
    case 'cornice':
      return {
        ...base,
        kind: 'part',
        template: { id: 'part.cornice' },
        params: { width: w, height: num(p.height, 60), depth: num(p.depth, 600) },
      } as EntityInput;
    case 'filler':
      return {
        ...base,
        kind: 'part',
        template: { id: 'part.filler' },
        params: { width: num(p.width, 50), height: h },
      } as EntityInput;
    case 'side-panel':
      return {
        ...base,
        kind: 'part',
        template: { id: 'part.end-panel' },
        params: { height: h, depth: d },
      } as EntityInput;
    case 'horizontal-panel':
      return { ...base, kind: 'part', template: { id: 'part.shelf' }, params: { width: w, depth: d } } as EntityInput;
    case 'back-panel':
      return {
        ...base,
        kind: 'part',
        template: { id: 'part.back-panel' },
        params: { width: w, height: h },
      } as EntityInput;
    default:
      return `v1 "${tpl}" placed on its own has no v2 equivalent — add it to a unit column instead`;
  }
}

export function importV1(raw: unknown, newId: () => string, now: string): ImportResult {
  if (!isV1Design(raw)) return { ok: false, error: 'This is not a Butor design file.' };
  const r = (raw as Obj).room as Obj;
  let pts = (Array.isArray(r.points) ? r.points : []).filter(isObj).map((q) => ({ x: num(q.x, 0), z: num(q.z, 0) }));
  if (pts.length < 3) return { ok: false, error: 'The v1 design has no usable room.' };
  if (signedArea(pts) < 0) pts = pts.reverse();
  const height = num(r.height, 2600);
  const corners = pts.map((q) => ({ id: newId(), ...q }));
  const thickness = Math.max(10, Math.min(1000, num(r.wallThickness, 100)));
  const room: Room = {
    corners,
    height,
    walls: Object.fromEntries(
      corners.map((c, i) => [wallKey(c.id, corners[(i + 1) % corners.length]!.id), { thickness }]),
    ),
    openings: [],
    obstacles: (Array.isArray(r.columns) ? r.columns : []).filter(isObj).map((c) => {
      const x = num(c.x, 0),
        z = num(c.z, 0),
        w = num(c.w, 300),
        d = num(c.d, 300);
      return {
        id: str(c.id, newId()),
        kind: 'column' as const,
        min: { x: x - w / 2, y: 0, z: z - d / 2 },
        max: { x: x + w / 2, y: height, z: z + d / 2 },
      };
    }),
    floor: { finish: FLOORS[str(r.floorKind, 'wood')] ?? 'planks', color: hex(r.floorColor) ?? '#c8a77e', rotation: 0 },
    wallColor: hex(r.wallColor) ?? '#efece6',
  };

  // A board per distinct v1 colour (based on white melamine).
  const materials: MaterialLibrary = structuredClone(DEFAULT_MATERIALS);
  const colourId = (c: string) => {
    const id = `v1-${c.slice(1)}`;
    const white = DEFAULT_MATERIALS.white!;
    if (!materials[id] && white.kind === 'board')
      materials[id] = { ...structuredClone(white), name: `Colour ${c}`, appearance: { ...white.appearance, color: c } };
    return id;
  };

  let d: Design = createDesign({
    id: newId(),
    name: 'Imported v1 design',
    now,
    newId,
    materials,
    defaults: DEFAULT_ROLES,
    room,
  });
  const ctx = { newId, now: () => now, catalog, mode: 'strict' as const };
  const warnings: string[] = [];
  const groups = new Map<string, string[]>();
  for (const o of ((raw as Obj).objects as unknown[]).filter(isObj)) {
    const id = str(o.id, newId()).slice(0, 64);
    const input = convert(o, id);
    let reason = typeof input === 'string' ? input : '';
    if (typeof input !== 'string') {
      const colour = hex(o.color);
      const door = hex(o.doorColor);
      const entity =
        input.kind === 'unit'
          ? {
              ...input,
              materials: {
                ...(colour ? { carcass: colourId(colour), interior: colourId(colour) } : {}),
                ...((door ?? colour) ? { front: colourId((door ?? colour)!) } : {}),
              },
            }
          : colour
            ? { ...input, material: colourId(colour) }
            : input;
      const res = applyTransaction(d, { label: 'v1', ops: [{ type: 'entity.add', entity } as Op] }, ctx);
      if (res.ok) d = res.doc;
      else reason = res.results[0]?.message ?? 'could not be rebuilt';
    }
    if (reason) {
      const p = isObj(o.params) ? o.params : {};
      const pos = isObj(o.position) ? o.position : {};
      const opaque: OpaqueEntity = {
        kind: 'opaque',
        id,
        name: str(o.name, str(o.templateId, 'v1 object')),
        position: { x: num(pos.x, 0), y: num(pos.y, 0), z: num(pos.z, 0) },
        rotation: num(o.rotationY, 0),
        locked: o.locked === true,
        raw: o,
        reason: reason.slice(0, 500),
        bounds: {
          w: Math.max(1, num(p.width, 100)),
          h: Math.max(1, num(p.height, 100)),
          d: Math.max(1, num(p.depth, 100)),
        },
      };
      d = { ...d, entities: { ...d.entities, [id]: opaque }, order: [...d.order, id] };
      warnings.push(`"${opaque.name}": ${reason}`);
    }
    if (typeof o.groupId === 'string') groups.set(o.groupId, [...(groups.get(o.groupId) ?? []), id]);
  }
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const res = applyTransaction(d, { label: 'v1', ops: [{ type: 'group.create', members }] }, ctx);
    if (res.ok) d = res.doc;
  }
  return { ok: true, design: { ...d, revision: 0 }, warnings };
}
