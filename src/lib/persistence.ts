import type { Design, FloorKind, SceneObject } from '../types';
import { clampParam, defaultParams, getTemplate, hasTemplate } from '../templates';
import { DEFAULT_COLOR, DEFAULT_ROOM } from '../state/defaults';

const KEY = 'wardrobe-designer:autosave';
const FLOORS: FloorKind[] = ['color', 'wood', 'tiles', 'concrete'];

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback);

/** Validates untrusted JSON and returns a complete Design, or null if unusable. */
export function parseDesign(json: unknown): Design | null {
  if (!isObj(json) || json.version !== 1 || !isObj(json.room) || !Array.isArray(json.objects)) return null;
  const r = json.room;
  if (!Array.isArray(r.points) || r.points.length < 3) return null;
  if (!r.points.every((p) => isObj(p) && isNum(p.x) && isNum(p.z))) return null;

  const objects: SceneObject[] = [];
  for (const o of json.objects) {
    if (!isObj(o) || typeof o.templateId !== 'string' || !hasTemplate(o.templateId)) return null;
    if (!isObj(o.position) || !isNum(o.position.x) || !isNum(o.position.y) || !isNum(o.position.z)) return null;
    const t = getTemplate(o.templateId);
    const params = defaultParams(t);
    if (isObj(o.params)) for (const def of t.params) if (isNum(o.params[def.key])) params[def.key] = clampParam(def, o.params[def.key] as number);
    objects.push({
      id: str(o.id, crypto.randomUUID()),
      templateId: o.templateId,
      name: str(o.name, t.name),
      params,
      position: { x: o.position.x, y: o.position.y, z: o.position.z },
      rotationY: isNum(o.rotationY) ? o.rotationY : 0,
      color: str(o.color, DEFAULT_COLOR),
      doorColor: typeof o.doorColor === 'string' ? o.doorColor : undefined,
      groupId: typeof o.groupId === 'string' ? o.groupId : undefined,
      locked: o.locked === true,
    });
  }

  return {
    version: 1,
    room: {
      points: (r.points as { x: number; z: number }[]).map((p) => ({ x: p.x, z: p.z })),
      height: isNum(r.height) ? r.height : DEFAULT_ROOM.height,
      wallThickness: isNum(r.wallThickness) ? r.wallThickness : DEFAULT_ROOM.wallThickness,
      floorKind: FLOORS.includes(r.floorKind as FloorKind) ? (r.floorKind as FloorKind) : DEFAULT_ROOM.floorKind,
      floorColor: str(r.floorColor, DEFAULT_ROOM.floorColor),
      wallColor: str(r.wallColor, DEFAULT_ROOM.wallColor),
    },
    objects,
  };
}

export function saveToFile(d: Design): void {
  const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `wardrobe-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Opens a file picker. Resolves null if cancelled; rejects if the file is not a valid design. */
export function openFile(): Promise<Design | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        const d = parseDesign(JSON.parse(await file.text()));
        if (d) resolve(d);
        else reject(new Error('invalid design'));
      } catch (e) {
        reject(e);
      }
    };
    input.click();
  });
}

export function loadAutosave(): Design | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? parseDesign(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function writeAutosave(d: Design): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    // storage unavailable (private mode, quota) — autosave is best-effort
  }
}
