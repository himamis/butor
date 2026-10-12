import { create } from 'zustand';
import {
  applyTransaction,
  buildScene,
  createDesign,
  newId,
  runChecks,
  type ApplyResult,
  type Check,
  type Design,
  type Op,
  type SceneModel,
} from '../core';
import { catalog, DEFAULT_MATERIALS, DEFAULT_ROLES } from '../catalog';
import type { ViewMode } from '../render/Renderer';

/**
 * Application state (grows in M4–M6): the design, its derived scene and checks, and how it is viewed.
 * The design only changes through core operations.
 */
export interface ViewSettings {
  mode: ViewMode;
  elevationWall: string | null;
  exploded: boolean;
  explodeAmount: number;
  open: Set<string>;
  hideFronts: boolean;
}

interface AppState {
  design: Design;
  scene: SceneModel;
  checks: Check[];
  view: ViewSettings;
  selection: Set<string>;
  hover: string | null;
  apply(ops: Op[], label?: string): ApplyResult;
  load(design: Design): void;
  setView(patch: Partial<ViewSettings>): void;
  toggleOpen(entityId: string): void;
  setOpenAll(open: boolean): void;
}

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

const derive = (design: Design) => {
  const scene = buildScene(design, catalog);
  return { design, scene, checks: runChecks(design, scene, catalog) };
};

export const useApp = create<AppState>()((set, get) => ({
  ...derive(newDesign()),
  view: { mode: '3d', elevationWall: null, exploded: false, explodeAmount: 0.6, open: new Set(), hideFronts: false },
  selection: new Set(),
  hover: null,

  apply(ops, label = 'edit') {
    const r = applyTransaction(
      get().design,
      { label, ops },
      { newId, now: () => new Date().toISOString(), catalog, mode: 'strict' },
    );
    if (r.ok && r.doc !== get().design) set(derive(r.doc));
    return r;
  },

  load(design) {
    set({ ...derive(design), selection: new Set(), view: { ...get().view, open: new Set() } });
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
}));
