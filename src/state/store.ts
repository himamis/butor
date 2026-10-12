import { create } from 'zustand';
import type { Design, Room, SceneObject, Vec3 } from '../types';
import { clampParam, defaultParams, getTemplate } from '../templates';
import { boundsOf } from '../lib/geometry';
import { DEFAULT_COLOR, defaultDesign } from './defaults';
import { loadAutosave } from '../lib/persistence';

export type Mode = 'translate' | 'rotate';
export type View = '3d' | 'front' | 'top' | 'side';
export type Grid = 1 | 10 | 50;

interface Ui {
  mode: Mode;
  view: View;
  grid: Grid;
  showOverall: boolean;
  doorsHidden: boolean;
}

interface State extends Ui {
  design: Design;
  selection: string[];
  past: Design[];
  future: Design[];
  dragSnapshot: Design | null;

  commit(fn: (d: Design) => Design): void;
  undo(): void;
  redo(): void;
  beginDrag(): void;
  endDrag(): void;
  updateObjectsLive(ids: string[], fn: (o: SceneObject) => SceneObject): void;

  addObject(templateId: string, position: Vec3): void;
  updateObjects(ids: string[], fn: (o: SceneObject) => SceneObject): void;
  setParam(id: string, key: string, value: number): void;
  select(id: string | null, additive: boolean): void;
  deleteSelected(): void;
  duplicateSelected(): void;
  groupSelected(): void;
  ungroupSelected(): void;
  rotateSelected(deg: number): void;
  applyColorToAll(hex: string): void;
  setRoom(fn: (r: Room) => Room): void;
  loadDesign(d: Design): void;
  setUi(partial: Partial<Ui>): void;
}

const HISTORY = 100;
const uid = () => crypto.randomUUID();

const mapObjects = (d: Design, ids: string[], fn: (o: SceneObject) => SceneObject): Design => {
  const set = new Set(ids);
  return { ...d, objects: d.objects.map((o) => (set.has(o.id) ? fn(o) : o)) };
};

/** Rotate a point around (cx, cz) by deg degrees about the vertical axis (matches three.js Y rotation). */
export function rotateAround(p: Vec3, cx: number, cz: number, deg: number): Vec3 {
  const a = (deg * Math.PI) / 180;
  const dx = p.x - cx;
  const dz = p.z - cz;
  return {
    x: cx + dx * Math.cos(a) + dz * Math.sin(a),
    y: p.y,
    z: cz - dx * Math.sin(a) + dz * Math.cos(a),
  };
}

export const normDeg = (deg: number) => ((Math.round(deg * 100) / 100) % 360 + 360) % 360;

export const useStore = create<State>()((set, get) => ({
  design: loadAutosave() ?? defaultDesign(),
  selection: [],
  past: [],
  future: [],
  dragSnapshot: null,
  mode: 'translate',
  view: '3d',
  grid: 10,
  showOverall: true,
  doorsHidden: false,

  commit(fn) {
    const { design, past } = get();
    const next = fn(design);
    if (next === design) return;
    set({ design: next, past: [...past, design].slice(-HISTORY), future: [] });
  },

  undo() {
    const { past, design, future, selection } = get();
    const prev = past[past.length - 1];
    if (!prev) return;
    const ids = new Set(prev.objects.map((o) => o.id));
    set({ design: prev, past: past.slice(0, -1), future: [design, ...future], selection: selection.filter((id) => ids.has(id)) });
  },

  redo() {
    const { past, design, future, selection } = get();
    const next = future[0];
    if (!next) return;
    const ids = new Set(next.objects.map((o) => o.id));
    set({ design: next, past: [...past, design], future: future.slice(1), selection: selection.filter((id) => ids.has(id)) });
  },

  beginDrag() {
    set({ dragSnapshot: get().design });
  },

  endDrag() {
    const { dragSnapshot, design, past } = get();
    if (dragSnapshot && dragSnapshot !== design) {
      set({ past: [...past, dragSnapshot].slice(-HISTORY), future: [] });
    }
    set({ dragSnapshot: null });
  },

  updateObjectsLive(ids, fn) {
    set({ design: mapObjects(get().design, ids, fn) });
  },

  addObject(templateId, position) {
    const t = getTemplate(templateId);
    const obj: SceneObject = {
      id: uid(),
      templateId,
      name: t.name,
      params: defaultParams(t),
      position,
      rotationY: 0,
      color: DEFAULT_COLOR,
    };
    get().commit((d) => ({ ...d, objects: [...d.objects, obj] }));
    set({ selection: [obj.id] });
  },

  updateObjects(ids, fn) {
    get().commit((d) => mapObjects(d, ids, fn));
  },

  setParam(id, key, value) {
    get().commit((d) =>
      mapObjects(d, [id], (o) => {
        const def = getTemplate(o.templateId).params.find((p) => p.key === key);
        if (!def) return o;
        return { ...o, params: { ...o.params, [key]: clampParam(def, value) } };
      }),
    );
  },

  select(id, additive) {
    if (id === null) return set({ selection: [] });
    const objs = get().design.objects;
    const obj = objs.find((o) => o.id === id);
    if (!obj) return;
    const ids = obj.groupId ? objs.filter((o) => o.groupId === obj.groupId).map((o) => o.id) : [id];
    if (!additive) return set({ selection: ids });
    const cur = get().selection;
    if (cur.includes(id)) set({ selection: cur.filter((s) => !ids.includes(s)) });
    else set({ selection: [...cur, ...ids.filter((i) => !cur.includes(i))] });
  },

  deleteSelected() {
    const sel = new Set(get().selection);
    if (!sel.size) return;
    get().commit((d) => ({ ...d, objects: d.objects.filter((o) => !sel.has(o.id) || o.locked) }));
    set({ selection: [] });
  },

  duplicateSelected() {
    const sel = new Set(get().selection);
    if (!sel.size) return;
    const groupMap = new Map<string, string>();
    const copies = get()
      .design.objects.filter((o) => sel.has(o.id))
      .map((o) => {
        let groupId = o.groupId;
        if (groupId) {
          if (!groupMap.has(groupId)) groupMap.set(groupId, uid());
          groupId = groupMap.get(groupId);
        }
        return { ...o, id: uid(), groupId, locked: false, position: { ...o.position, x: o.position.x + 50 } };
      });
    get().commit((d) => ({ ...d, objects: [...d.objects, ...copies] }));
    set({ selection: copies.map((c) => c.id) });
  },

  groupSelected() {
    const sel = get().selection;
    if (sel.length < 2) return;
    const g = uid();
    get().updateObjects(sel, (o) => ({ ...o, groupId: g }));
  },

  ungroupSelected() {
    const sel = get().selection;
    if (!sel.length) return;
    get().updateObjects(sel, (o) => ({ ...o, groupId: undefined }));
  },

  rotateSelected(deg) {
    const { selection, design } = get();
    const objs = design.objects.filter((o) => selection.includes(o.id) && !o.locked);
    const b = boundsOf(objs);
    if (!b) return;
    const cx = (b.min.x + b.max.x) / 2;
    const cz = (b.min.z + b.max.z) / 2;
    get().updateObjects(
      objs.map((o) => o.id),
      (o) => ({ ...o, position: rotateAround(o.position, cx, cz, deg), rotationY: normDeg(o.rotationY + deg) }),
    );
  },

  applyColorToAll(hex) {
    get().commit((d) => ({ ...d, objects: d.objects.map((o) => ({ ...o, color: hex })) }));
  },

  setRoom(fn) {
    get().commit((d) => ({ ...d, room: fn(d.room) }));
  },

  loadDesign(d) {
    set({ design: d, past: [], future: [], selection: [], dragSnapshot: null });
  },

  setUi(partial) {
    set(partial);
  },
}));
