import { create } from 'zustand';
import {
  applyTransaction,
  rebase,
  buildScene,
  createDesign,
  emptyHistory,
  newId,
  record,
  redo as redoHistory,
  runChecks,
  undo as undoHistory,
  type ApplyResult,
  type Check,
  type Design,
  type Entity,
  type EntityInput,
  type History,
  type Op,
  type Vec3,
  type OpContext,
  type SceneModel,
} from '../core';
import { catalog, DEFAULT_MATERIALS, DEFAULT_ROLES } from '../catalog';
import type { ViewMode } from '../render/Renderer';

/**
 * Application state. The design only changes through core operations: `apply` commits (one undo step),
 * `preview` shows a transaction without committing (drags), `commitPreview`/`cancelPreview` end it.
 */
export interface ViewSettings {
  mode: ViewMode;
  elevationWall: string | null;
  exploded: boolean;
  explodeAmount: number;
  open: Set<string>;
  hideFronts: boolean;
  measurements: { a: Vec3; b: Vec3; distance: number }[]; // kept until cleared (view state, not the design)
}

export interface InnerSelection {
  entity: string;
  kind: 'column' | 'item' | 'front';
  id: string;
}

export interface Selection {
  entities: string[];
  inner: InnerSelection | null;
}

export type Grid = 1 | 10 | 50;

interface AppState {
  design: Design; // committed
  scene: SceneModel; // of the visible design (preview if any)
  checks: Check[];
  previewDoc: Design | null;
  pending: { result: ApplyResult; label: string } | null; // the previewed transaction
  history: History;
  view: ViewSettings;
  selection: Selection;
  hover: string | null;
  grid: Grid;
  snapping: boolean;
  readOnly: boolean; // the share-link viewer: every edit is refused
  clipboard: { entities: EntityInput[]; groups: string[][]; width: number } | null;
  pasteCount: number;
  apply(ops: Op[], label: string): ApplyResult;
  preview(ops: Op[], label: string): ApplyResult;
  commitPreview(): void;
  cancelPreview(): void;
  undo(): void;
  redo(): void;
  load(design: Design): void;
  setReadOnly(readOnly: boolean): void;
  /** Commits a transaction prepared elsewhere (the assistant) against `baseRevision`, replaying its recorded ids. */
  applyRemote(
    tx: { label: string; ops: Op[]; ids: string[] },
    baseRevision: number,
  ): { ok: boolean; conflict: boolean; revision: number; message?: string };
  setView(patch: Partial<ViewSettings>): void;
  toggleOpen(entityId: string): void;
  setOpenAll(open: boolean): void;
  select(ids: string[], mode?: 'replace' | 'add' | 'toggle'): void;
  selectInner(inner: InnerSelection | null): void;
  setHover(id: string | null): void;
  set(patch: Partial<Pick<AppState, 'grid' | 'snapping'>>): void;
  copy(): void;
  paste(): void;
  duplicate(): void;
  removeSelection(): void;
  groupSelection(): void;
  ungroupSelection(): void;
}

const refused = (doc: Design): ApplyResult => ({
  doc,
  inverse: [],
  results: [{ ok: false, message: 'This design is read-only' }],
  ok: false,
});

export function newDesign(): Design {
  return createDesign({
    id: newId(),
    name: 'Untitled design',
    now: new Date().toISOString(),
    newId,
    materials: DEFAULT_MATERIALS,
    defaults: DEFAULT_ROLES,
  });
}

export const opContext = (mode: OpContext['mode'] = 'strict'): OpContext => ({
  newId,
  now: () => new Date().toISOString(),
  catalog,
  mode,
});

function derive(design: Design, withChecks = true) {
  const scene = buildScene(design, catalog);
  return withChecks ? { scene, checks: runChecks(design, scene, catalog) } : { scene };
}

/** Entities in the same group as any of `ids` (groups are selected as a whole). */
function withGroups(d: Design, ids: string[]): string[] {
  const out = new Set(ids);
  for (const g of Object.values(d.groups)) if (g.members.some((m) => out.has(m))) g.members.forEach((m) => out.add(m));
  return [...out].filter((id) => d.entities[id]);
}

function cleanSelection(d: Design, s: Selection): Selection {
  const entities = s.entities.filter((id) => d.entities[id]);
  const inner = s.inner && d.entities[s.inner.entity] ? s.inner : null;
  return { entities, inner };
}

/** An entity as an EntityInput without ids, so pasting creates fresh ones. */
function asInput(e: Entity): EntityInput | null {
  if (e.kind === 'opaque') return null;
  const base = {
    position: { ...e.position },
    rotation: e.rotation,
    name: e.name,
    template: { id: e.template.id, version: e.template.version },
    params: structuredClone(e.params),
  };
  if (e.kind === 'part') return { kind: 'part', ...base, ...(e.material ? { material: e.material } : {}) };
  const itemIds = new Map<string, string>();
  const columns = e.columns.map((c) => ({
    width: c.width,
    items: c.items.map((i) => {
      const id = newId();
      itemIds.set(i.id, id);
      return {
        id,
        template: i.template,
        y: i.y,
        params: structuredClone(i.params),
        ...(i.material ? { material: i.material } : {}),
      };
    }),
  }));
  const fronts = e.fronts.map((f) => ({
    template: f.template,
    columns: [...f.columns] as [number, number],
    y: [...f.y] as [number, number],
    params: structuredClone(f.params),
    ...(f.drawer ? { drawer: itemIds.get(f.drawer) ?? f.drawer } : {}),
    ...(f.material ? { material: f.material } : {}),
  }));
  return { kind: 'unit', ...base, size: { ...e.size }, materials: { ...e.materials }, columns, fronts };
}

/** A copy of an EntityInput with fresh item ids (drawer fronts follow), so every paste is unique. */
function freshIds(e: EntityInput): EntityInput {
  const copy = structuredClone(e);
  if (copy.kind !== 'unit') return copy;
  const map = new Map<string, string>();
  for (const c of copy.columns ?? []) {
    for (const i of c.items ?? []) {
      const id = newId();
      if (i.id) map.set(i.id, id);
      i.id = id;
    }
  }
  for (const f of copy.fronts ?? []) if (f.drawer) f.drawer = map.get(f.drawer) ?? f.drawer;
  return copy;
}

export const useApp = create<AppState>()((set, get) => {
  const commit = (r: ApplyResult, label: string) => {
    if (!r.ok || r.doc === get().design) return;
    set({
      design: r.doc,
      previewDoc: null,
      pending: null,
      ...derive(r.doc),
      history: record(get().history, label, r),
      selection: cleanSelection(r.doc, get().selection),
    });
  };

  return {
    ...(() => {
      const d = newDesign();
      return { design: d, ...derive(d) } as { design: Design; scene: SceneModel; checks: Check[] };
    })(),
    previewDoc: null,
    pending: null,
    history: emptyHistory(),
    view: {
      mode: '3d',
      elevationWall: null,
      exploded: false,
      explodeAmount: 0.6,
      open: new Set(),
      hideFronts: false,
      measurements: [],
    },
    selection: { entities: [], inner: null },
    hover: null,
    grid: 10,
    snapping: true,
    readOnly: false,
    clipboard: null,
    pasteCount: 0,

    apply(ops, label) {
      if (get().readOnly) return refused(get().design);
      const r = applyTransaction(get().design, { label, ops }, opContext());
      commit(r, label);
      return r;
    },

    preview(ops, label) {
      if (get().readOnly) return refused(get().design);
      const r = applyTransaction(get().design, { label, ops }, opContext());
      if (r.ok) set({ previewDoc: r.doc, pending: { result: r, label }, ...derive(r.doc, false) });
      return r;
    },

    commitPreview() {
      const p = get().pending;
      if (get().previewDoc && p) {
        set({ pending: null });
        commit(p.result, p.label);
        if (get().previewDoc) get().cancelPreview(); // a no-op move: drop the preview
      } else get().cancelPreview();
    },

    cancelPreview() {
      if (!get().previewDoc) return;
      set({ previewDoc: null, pending: null, ...derive(get().design) });
    },

    undo() {
      if (get().readOnly) return;
      if (get().previewDoc) return; // never in the middle of a drag
      const r = undoHistory(get().history, get().design, opContext());
      if (r)
        set({ design: r.doc, history: r.history, ...derive(r.doc), selection: cleanSelection(r.doc, get().selection) });
    },

    redo() {
      if (get().readOnly) return;
      if (get().previewDoc) return;
      const r = redoHistory(get().history, get().design, opContext());
      if (r)
        set({ design: r.doc, history: r.history, ...derive(r.doc), selection: cleanSelection(r.doc, get().selection) });
    },

    applyRemote(tx, baseRevision) {
      if (get().readOnly)
        return { ok: false, conflict: false, revision: get().design.revision, message: 'This design is read-only' };
      const queue = [...tx.ids];
      const r = rebase(get().design, { label: tx.label, ops: tx.ops }, baseRevision, {
        ...opContext(),
        newId: () => queue.shift() ?? newId(),
      });
      if (!r.ok) {
        const message = r.results.find((x) => !x.ok)?.message;
        return { ok: false, conflict: r.conflict, revision: get().design.revision, ...(message ? { message } : {}) };
      }
      commit(r, tx.label);
      return { ok: true, conflict: false, revision: get().design.revision };
    },

    setReadOnly(readOnly) {
      set({ readOnly });
    },

    load(design) {
      set({
        design,
        previewDoc: null,
        ...derive(design),
        history: emptyHistory(),
        selection: { entities: [], inner: null },
        view: { ...get().view, open: new Set(), measurements: [] },
      });
    },

    setView(patch) {
      set({ view: { ...get().view, ...patch } });
    },

    toggleOpen(id) {
      const open = new Set(get().view.open);
      if (open.has(id)) open.delete(id);
      else open.add(id);
      set({ view: { ...get().view, open } });
    },

    setOpenAll(on) {
      const ids = on
        ? [...get().scene.entities.values()].filter((e) => e.parts.some((p) => p.motion)).map((e) => e.id)
        : [];
      set({ view: { ...get().view, open: new Set(ids) } });
    },

    select(ids, mode = 'replace') {
      const d = get().design;
      const picked = withGroups(d, ids);
      const cur = new Set(get().selection.entities);
      let next: string[];
      if (mode === 'replace') next = picked;
      else if (mode === 'add') next = [...new Set([...cur, ...picked])];
      else
        next = picked.every((id) => cur.has(id))
          ? [...cur].filter((id) => !picked.includes(id))
          : [...new Set([...cur, ...picked])];
      set({ selection: { entities: next, inner: null } });
    },

    selectInner(inner) {
      set({ selection: { entities: inner ? [inner.entity] : get().selection.entities, inner } });
    },

    setHover(id) {
      if (get().hover !== id) set({ hover: id });
    },

    set(patch) {
      set(patch);
    },

    copy() {
      const d = get().design;
      const ids = get().selection.entities;
      const entities = ids.map((id) => d.entities[id]).filter((e): e is Entity => !!e);
      const inputs = entities.map(asInput).filter((e): e is EntityInput => !!e);
      if (!inputs.length) return;
      const bounds = ids.map((id) => get().scene.entities.get(id)?.bounds).filter((b) => !!b);
      const xs = bounds.flatMap((b) => [b.center.x - b.half.x, b.center.x + b.half.x]);
      const width = xs.length ? Math.max(...xs) - Math.min(...xs) : 0;
      const groups = Object.values(d.groups)
        .filter((g) => g.members.every((m) => ids.includes(m)))
        .map((g) => g.members.map((m) => String(ids.indexOf(m))));
      set({ clipboard: { entities: inputs, groups, width }, pasteCount: 0 });
    },

    paste() {
      const clip = get().clipboard;
      if (!clip) return;
      const n = get().pasteCount + 1;
      const ids = clip.entities.map(() => newId());
      const ops: Op[] = clip.entities.map((e, i) => ({
        type: 'entity.add',
        entity: { ...freshIds(e), id: ids[i], position: { ...e.position, x: e.position.x + clip.width * n } },
      }));
      for (const g of clip.groups) ops.push({ type: 'group.create', members: g.map((i) => ids[Number(i)]!) });
      const r = get().apply(ops, 'Paste');
      if (r.ok) set({ pasteCount: n, selection: { entities: ids, inner: null } });
    },

    duplicate() {
      get().copy();
      get().paste();
    },

    removeSelection() {
      const s = get().selection;
      if (s.inner) {
        const { entity, kind, id } = s.inner;
        const op: Op | null =
          kind === 'item'
            ? { type: 'unit.item.remove', unit: entity, item: id }
            : kind === 'front'
              ? { type: 'unit.front.remove', unit: entity, front: id }
              : { type: 'unit.column.remove', unit: entity, column: id };
        get().apply([op], 'Delete');
        set({ selection: { entities: [entity], inner: null } });
        return;
      }
      if (s.entities.length) get().apply([{ type: 'entity.remove', ids: s.entities }], 'Delete');
    },

    groupSelection() {
      const ids = get().selection.entities;
      if (ids.length >= 2) get().apply([{ type: 'group.create', members: ids }], 'Group');
    },

    ungroupSelection() {
      const ids = new Set(get().selection.entities);
      const ops: Op[] = Object.values(get().design.groups)
        .filter((g) => g.members.some((m) => ids.has(m)))
        .map((g) => ({ type: 'group.dissolve', id: g.id }));
      if (ops.length) get().apply(ops, 'Ungroup');
    },
  };
});

/** The design currently shown (the preview during a drag, otherwise the committed one). */
export const visibleDesign = (s: { design: Design; previewDoc: Design | null }) => s.previewDoc ?? s.design;
