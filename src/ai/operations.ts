import type { Design, FloorKind, SceneObject, Vec3 } from '../types';
import { clampParam, defaultParams, getTemplate, hasTemplate } from '../templates';
import { DEFAULT_COLOR } from '../state/defaults';
import { uid } from '../lib/uid';

/**
 * Design edits an AI model can request through the `apply_operations` tool.
 * Input is untrusted model output: every operation is validated as a whole and
 * either applied completely or rejected with a message the model can act on.
 */
export interface OpResult {
  ok: boolean;
  message: string;
  id?: string; // id of an added object
}

const FLOORS: FloorKind[] = ['color', 'wood', 'tiles', 'concrete'];
const MAX_COORD = 100000; // mm, ±100 m
const MAX_POINTS = 200;
const MAX_NAME = 200;
const coord = (v: number) => Math.min(MAX_COORD, Math.max(-MAX_COORD, v));
const HEX = /^#[0-9a-f]{6}$/i;

type Rec = Record<string, unknown>;
const isObj = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const normDeg = (d: number) => ((Math.round(d * 100) / 100) % 360 + 360) % 360;

class OpError extends Error {}
const fail = (msg: string): never => {
  throw new OpError(msg);
};

function color(v: unknown, field: string): string | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== 'string' || !HEX.test(v)) fail(`${field} must be a hex color like "#c8a06a"`);
  return v as string;
}

function stringList(v: unknown, field: string): string[] {
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) fail(`${field} must be an array of object ids`);
  return v as string[];
}

/** Validates params against the template; returns the merged params and notes about clamping or unknown keys. */
function mergeParams(templateId: string, current: Record<string, number>, input: unknown, notes: string[]) {
  if (input === undefined) return current;
  if (!isObj(input)) fail('params must be an object of numbers');
  const t = getTemplate(templateId);
  const out = { ...current };
  for (const [key, raw] of Object.entries(input as Rec)) {
    const def = t.params.find((p) => p.key === key);
    if (!def) {
      notes.push(`ignored unknown param "${key}" (allowed: ${t.params.map((p) => p.key).join(', ')})`);
      continue;
    }
    if (!isNum(raw)) fail(`param "${key}" must be a number`);
    const v = clampParam(def, raw as number);
    if (v !== raw) notes.push(`${key} clamped to ${v} (range ${def.min}–${def.max})`);
    out[key] = v;
  }
  return out;
}

function position(input: unknown, base: Vec3): Vec3 {
  if (input === undefined) return base;
  if (!isObj(input)) fail('position must be an object {x, y, z} in mm');
  const p = input as Rec;
  for (const k of ['x', 'y', 'z']) if (p[k] !== undefined && !isNum(p[k])) fail(`position.${k} must be a number (mm)`);
  return {
    x: coord((p.x as number | undefined) ?? base.x),
    y: Math.max(0, coord((p.y as number | undefined) ?? base.y)),
    z: coord((p.z as number | undefined) ?? base.z),
  };
}

function findObject(d: Design, id: unknown): SceneObject {
  const o = typeof id === 'string' ? d.objects.find((x) => x.id === id) : undefined;
  if (!o) fail(`no object with id "${String(id)}"`);
  return o!;
}

function roomCenter(d: Design): Vec3 {
  const xs = d.room.points.map((p) => p.x);
  const zs = d.room.points.map((p) => p.z);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: 0, z: (Math.min(...zs) + Math.max(...zs)) / 2 };
}

const withNotes = (msg: string, notes: string[]) => (notes.length ? `${msg} (${notes.join('; ')})` : msg);

function applyOne(d: Design, raw: unknown, newId: () => string): { design: Design; result: OpResult } {
  if (!isObj(raw)) fail('each operation must be an object with an "op" field');
  const op = raw as Rec;
  const notes: string[] = [];

  switch (op.op) {
    case 'add': {
      if (typeof op.templateId !== 'string' || !hasTemplate(op.templateId)) fail(`unknown templateId "${String(op.templateId)}"`);
      const t = getTemplate(op.templateId as string);
      if (op.rotationY !== undefined && !isNum(op.rotationY)) fail('rotationY must be a number (degrees)');
      const obj: SceneObject = {
        id: newId(),
        templateId: t.id,
        name: typeof op.name === 'string' && op.name ? op.name.slice(0, MAX_NAME) : t.name,
        params: mergeParams(t.id, defaultParams(t), op.params, notes),
        position: position(op.position, roomCenter(d)),
        rotationY: normDeg((op.rotationY as number | undefined) ?? 0),
        color: color(op.color, 'color') ?? DEFAULT_COLOR,
        doorColor: color(op.doorColor, 'doorColor'),
      };
      return { design: { ...d, objects: [...d.objects, obj] }, result: { ok: true, id: obj.id, message: withNotes(`added ${t.name} "${obj.name}" with id ${obj.id}`, notes) } };
    }

    case 'update': {
      const o = findObject(d, op.id);
      if (o.locked) fail(`object "${o.name}" is locked by the user`);
      if (op.rotationY !== undefined && !isNum(op.rotationY)) fail('rotationY must be a number (degrees)');
      if (op.name !== undefined && (typeof op.name !== 'string' || op.name.length > MAX_NAME)) fail(`name must be a string of at most ${MAX_NAME} characters`);
      const next: SceneObject = {
        ...o,
        name: (op.name as string | undefined) ?? o.name,
        params: mergeParams(o.templateId, o.params, op.params, notes),
        position: position(op.position, o.position),
        rotationY: op.rotationY === undefined ? o.rotationY : normDeg(op.rotationY as number),
        color: color(op.color, 'color') ?? o.color,
        doorColor: op.doorColor === null ? undefined : color(op.doorColor, 'doorColor') ?? o.doorColor,
      };
      return { design: { ...d, objects: d.objects.map((x) => (x.id === o.id ? next : x)) }, result: { ok: true, message: withNotes(`updated "${next.name}"`, notes) } };
    }

    case 'delete': {
      const list = stringList(op.ids, 'ids').map((id) => findObject(d, id));
      const locked = list.filter((o) => o.locked);
      if (locked.length) fail(`locked objects cannot be deleted: ${locked.map((o) => o.name).join(', ')}`);
      const gone = new Set(list.map((o) => o.id));
      return { design: { ...d, objects: d.objects.filter((o) => !gone.has(o.id)) }, result: { ok: true, message: `deleted ${list.map((o) => `"${o.name}"`).join(', ')}` } };
    }

    case 'group':
    case 'ungroup': {
      const list = stringList(op.ids, 'ids').map((id) => findObject(d, id));
      if (op.op === 'group' && list.length < 2) fail('group needs at least two ids');
      const ids = new Set(list.map((o) => o.id));
      const groupId = op.op === 'group' ? newId() : undefined;
      return {
        design: { ...d, objects: d.objects.map((o) => (ids.has(o.id) ? { ...o, groupId } : o)) },
        result: { ok: true, message: `${op.op === 'group' ? 'grouped' : 'ungrouped'} ${list.length} objects` },
      };
    }

    case 'set_room': {
      const room = { ...d.room };
      if (op.points !== undefined) {
        const pts = op.points;
        if (!Array.isArray(pts) || pts.length < 3 || pts.length > MAX_POINTS || !pts.every((p) => isObj(p) && isNum(p.x) && isNum(p.z))) {
          fail(`points must be 3–${MAX_POINTS} corners [{x, z}, …] in mm`);
        }
        room.points = (pts as { x: number; z: number }[]).map((p) => ({ x: coord(p.x), z: coord(p.z) }));
      }
      if (op.height !== undefined) {
        if (!isNum(op.height)) fail('height must be a number (mm)');
        room.height = Math.min(6000, Math.max(1500, op.height as number));
      }
      if (op.floorKind !== undefined) {
        if (!FLOORS.includes(op.floorKind as FloorKind)) fail(`floorKind must be one of ${FLOORS.join(', ')}`);
        room.floorKind = op.floorKind as FloorKind;
      }
      room.floorColor = color(op.floorColor, 'floorColor') ?? room.floorColor;
      room.wallColor = color(op.wallColor, 'wallColor') ?? room.wallColor;
      return { design: { ...d, room }, result: { ok: true, message: 'updated the room' } };
    }

    default:
      return fail(`unknown op "${String(op.op)}" (use add, update, delete, group, ungroup, set_room)`);
  }
}

/** Applies operations in order. Invalid ones are skipped and reported; valid ones still apply. */
export function applyOperations(design: Design, ops: unknown, newId: () => string = uid): { design: Design; results: OpResult[] } {
  if (!Array.isArray(ops)) return { design, results: [{ ok: false, message: 'operations must be an array' }] };
  let d = design;
  const results: OpResult[] = [];
  ops.forEach((raw, i) => {
    try {
      const r = applyOne(d, raw, newId);
      d = r.design;
      results.push(r.result);
    } catch (e) {
      if (!(e instanceof OpError)) throw e;
      results.push({ ok: false, message: `operation ${i + 1} rejected: ${e.message}` });
    }
  });
  return { design: d, results };
}

const num = { type: 'number' };
const ids = { type: 'array', items: { type: 'string' }, description: 'Object ids (for delete, group, ungroup).' };

/** JSON Schema for the tool input. Flat on purpose: simple schemas work with more models. */
export const OPERATIONS_SCHEMA = {
  type: 'object',
  properties: {
    operations: {
      type: 'array',
      description: 'Edits applied in order. Ids of added objects are returned and can be used by later calls.',
      items: {
        type: 'object',
        properties: {
          op: { type: 'string', enum: ['add', 'update', 'delete', 'group', 'ungroup', 'set_room'] },
          templateId: { type: 'string', description: 'add: which template to place.' },
          id: { type: 'string', description: 'update: the object to change.' },
          ids,
          name: { type: 'string' },
          params: { type: 'object', additionalProperties: num, description: 'Template params in mm (and option values), e.g. {"width": 1000}.' },
          position: { type: 'object', properties: { x: num, y: num, z: num }, description: 'Bottom-center of the object in room coordinates (mm). Omitted axes stay unchanged.' },
          rotationY: { type: 'number', description: 'Degrees about the vertical axis. 0 = front faces +z.' },
          color: { type: 'string', description: 'Hex color, e.g. "#c8a06a".' },
          doorColor: { type: ['string', 'null'], description: 'Hex color for fronts, or null to match the body.' },
          points: { type: 'array', items: { type: 'object', properties: { x: num, z: num } }, description: 'set_room: floor polygon corners in mm.' },
          height: { type: 'number', description: 'set_room: ceiling height in mm.' },
          floorKind: { type: 'string', enum: FLOORS },
          floorColor: { type: 'string' },
          wallColor: { type: 'string' },
        },
        required: ['op'],
      },
    },
  },
  required: ['operations'],
} as const;
