import { create } from 'zustand';
import type { Design, Room, SceneObject, Vec3 } from '../types';
import { clampParam, defaultParams, getTemplate } from '../templates';
import { boundsOf, hasMovingParts } from '../lib/geometry';
import { DEFAULT_COLOR, defaultDesign } from './defaults';
import { loadAutosave } from '../lib/persistence';
import { uid } from '../lib/uid';
import { measureBetween, snapNormal } from '../lib/measure';

export type Mode = 'translate' | 'rotate';
export type View = '3d' | 'front' | 'top' | 'side';
export type Grid = 1 | 10 | 50;

interface Ui {
  mode: Mode;
  view: View;
  grid: Grid;
  showOverall: boolean;
  doorsHidden: boolean;
  exploded: boolean;
  explodeAmount: number; // 0..1
  tool: 'select' | 'measure';
}

export interface Measure {
  a: Vec3; // first click (mm)
  end: Vec3; // where the measuring line ends, square to the first surface
  b: Vec3; // second click
  distance: number; // mm
}

interface State extends Ui {
  design: Design;
  selection: string[];
  openIds: string[]; // objects shown open (view state, never saved)
  past: Design[];
  future: Design[];
  dragSnapshot: Design | null;
  readOnly: boolean; // shared-link viewer: the design can be looked at, never changed
  clipboard: SceneObject[]; // copied objects (kept when another design is opened)
  pasteCount: number; // pastes since the last copy, so repeated pastes fan out

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
  copySelected(): void;
  paste(): void;
  groupSelected(): void;
  ungroupSelected(): void;
  rotateSelected(deg: number): void;
  applyColorToAll(hex: string): void;
  setRoom(fn: (r: Room) => Room): void;
  loadDesign(d: Design): void;
  enterViewer(d: Design): void;
  setUi(partial: Partial<Ui>): void;
  toggleOpen(id: string): void;
  measures: Measure[]; // view state, never saved
  measureStart: { p: Vec3; n: Vec3 } | null;
  measureClick(p: Vec3, n: Vec3): void;
  cancelMeasure(): void;
  clearMeasures(): void;
  setOpenAll(open: boolean): void;
}

const HISTORY = 100;

const mapObjects = (d: Design, ids: string[], fn: (o: SceneObject) => SceneObject): Design => {
  const set = new Set(ids);
  let changed = false;
  const objects = d.objects.map((o) => {
    if (!set.has(o.id)) return o;
    const n = fn(o);
    if (n !== o) changed = true;
    return n;
  });
  return changed ? { ...d, objects } : d;
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

/** Copies land flush beside the originals (shifted by the selection's width along x), so they never overlap. */
const copyStep = (objs: SceneObject[]) => {
  const b = boundsOf(objs);
  return b ? b.max.x - b.min.x : 0;
};

/** Adds copies (new ids, new group ids, unlocked) shifted by dx, selects them; one undo step. */
function insertCopies(objs: SceneObject[], dx: number) {
  if (!objs.length || useStore.getState().readOnly) return;
  const groupMap = new Map<string, string>();
  const copies = objs.map((o) => {
    let groupId = o.groupId;
    if (groupId) {
      if (!groupMap.has(groupId)) groupMap.set(groupId, uid());
      groupId = groupMap.get(groupId);
    }
    return { ...o, id: uid(), groupId, locked: false, params: { ...o.params }, position: { ...o.position, x: o.position.x + dx } };
  });
  useStore.getState().commit((d) => ({ ...d, objects: [...d.objects, ...copies] }));
  useStore.setState({ selection: copies.map((c) => c.id) });
}

export const useStore = create<State>()((set, get) => ({
  // A shared view link shows its own design; never read (or later write) the visitor's autosave there.
  design: (typeof location !== 'undefined' && location.hash.startsWith('#view=') ? null : loadAutosave()) ?? defaultDesign(),
  selection: [],
  openIds: [],
  past: [],
  future: [],
  dragSnapshot: null,
  readOnly: false,
  clipboard: [],
  pasteCount: 0,
  mode: 'translate',
  view: '3d',
  grid: 10,
  showOverall: true,
  doorsHidden: false,
  exploded: false,
  explodeAmount: 0.6,
  tool: 'select',
  measures: [],
  measureStart: null,

  commit(fn) {
    if (get().readOnly) return;
    const { design, past, dragSnapshot } = get();
    const next = fn(design);
    if (next === design) return;
    // During a drag (gizmo, color picker) changes are live; endDrag records one undo step.
    if (dragSnapshot) return set({ design: next });
    set({ design: next, past: [...past, design].slice(-HISTORY), future: [] });
  },

  undo() {
    const { past, design, future, selection } = get();
    const prev = past[past.length - 1];
    if (!prev) return;
    const ids = new Set(prev.objects.map((o) => o.id));
    set({
      design: prev, past: past.slice(0, -1), future: [design, ...future],
      selection: selection.filter((id) => ids.has(id)), openIds: get().openIds.filter((id) => ids.has(id)),
    });
  },

  redo() {
    const { past, design, future, selection } = get();
    const next = future[0];
    if (!next) return;
    const ids = new Set(next.objects.map((o) => o.id));
    set({
      design: next, past: [...past, design].slice(-HISTORY), future: future.slice(1),
      selection: selection.filter((id) => ids.has(id)), openIds: get().openIds.filter((id) => ids.has(id)),
    });
  },

  beginDrag() {
    if (get().dragSnapshot) return; // already inside a drag: keep the earliest snapshot
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
    if (get().readOnly) return;
    set({ design: mapObjects(get().design, ids, fn) });
  },

  addObject(templateId, position) {
    if (get().readOnly) return;
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
        if (!def || clampParam(def, value) === o.params[key]) return o;
        return { ...o, params: { ...o.params, [key]: clampParam(def, value) } };
      }),
    );
  },

  select(id, additive) {
    if (get().readOnly) return;
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
    const ids = new Set(get().design.objects.map((o) => o.id));
    set({ selection: [], openIds: get().openIds.filter((id) => ids.has(id)) });
  },

  duplicateSelected() {
    const sel = new Set(get().selection);
    const objs = get().design.objects.filter((o) => sel.has(o.id));
    insertCopies(objs, copyStep(objs));
  },

  copySelected() {
    const sel = new Set(get().selection);
    const objs = get().design.objects.filter((o) => sel.has(o.id));
    if (!objs.length) return;
    // Snapshot now, so later edits to the originals don't change what gets pasted.
    set({ clipboard: objs.map((o) => ({ ...o, params: { ...o.params }, position: { ...o.position } })), pasteCount: 0 });
  },

  paste() {
    const { clipboard, pasteCount, readOnly } = get();
    if (readOnly || !clipboard.length) return;
    set({ pasteCount: pasteCount + 1 });
    insertCopies(clipboard, copyStep(clipboard) * (pasteCount + 1));
  },

  groupSelected() {
    const sel = [...new Set(get().selection)];
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
    if (get().readOnly) return;
    set({ design: d, past: [], future: [], selection: [], openIds: [], dragSnapshot: null });
  },

  enterViewer(d) {
    set({ design: d, readOnly: true, past: [], future: [], selection: [], openIds: [], dragSnapshot: null });
  },

  setUi(partial) {
    set(partial);
  },

  measureClick(p, n) {
    const start = get().measureStart;
    if (!start) return set({ measureStart: { p, n: snapNormal(n) } });
    const { distance, end } = measureBetween(start.p, start.n, p);
    set({ measures: [...get().measures, { a: start.p, end, b: p, distance }], measureStart: null });
  },

  cancelMeasure() {
    set({ measureStart: null });
  },

  clearMeasures() {
    set({ measures: [], measureStart: null });
  },

  toggleOpen(id) {
    const { openIds } = get();
    set({ openIds: openIds.includes(id) ? openIds.filter((o) => o !== id) : [...openIds, id] });
  },

  setOpenAll(open) {
    set({ openIds: open ? get().design.objects.filter(hasMovingParts).map((o) => o.id) : [] });
  },
}));
