import { applyTransaction, buildScene, importDesign, newId, snapContext, snapMove, type Design } from '../core';
import { catalog } from '../catalog';
import type { Renderer } from '../render/Renderer';
import { useApp, type ViewSettings } from './store';

/** Test hooks for Playwright (docs/v2/10-quality.md). Only present in `--mode test` builds. */
export interface ButorTestHooks {
  ready: boolean;
  secureContext: boolean;
  load(json: unknown): { ok: boolean; error?: string; warnings?: string[] };
  fixture(name: 'hundred-units' | 'reference' | 'broken'): Promise<void>;
  design(): Design;
  view(patch: Partial<ViewSettings>): void;
  settle(): void;
  stats(): { frames: number; calls: number; triangles: number; guides: number };
  toScreen(p: { x: number; y: number; z: number }): { x: number; y: number };
  pick(x: number, y: number): unknown;
  /** Parts of an entity that move when it opens, with their motion (scene model). */
  motions(entityId: string): { part: string; motion: unknown }[];
  /** An entity's bounding box (scene model, closed state). */
  bounds(entityId: string): {
    center: { x: number; y: number; z: number };
    half: { x: number; y: number; z: number };
    rotation: number;
  } | null;
  /** A part's box (scene model, closed state). */
  part(partId: string): {
    center: { x: number; y: number; z: number };
    half: { x: number; y: number; z: number };
    rotation: number;
  } | null;
  /** Median timings on the current design (docs/v2/10-quality.md#budgets): rebuild after one entity moved, one snapping query. */
  perf(): { rebuildMs: number; snapMs: number };
  /** Undo depth and the current selection. */
  state(): { undo: number; selection: string[]; open: string[]; checks: { kind: string; entities: string[] }[] };
}

declare global {
  interface Window {
    __butor?: ButorTestHooks;
  }
}

let renderer: Renderer | null = null;
export function registerRenderer(r: Renderer | null) {
  renderer = r;
}

export function installTestHooks(): void {
  if (!import.meta.env.VITE_TEST_HOOKS) return;
  const need = () => {
    if (!renderer) throw new Error('renderer not mounted');
    return renderer;
  };
  window.__butor = {
    get ready() {
      return renderer !== null; // the editor (or viewer) is on screen
    },
    secureContext: window.isSecureContext,
    load(json) {
      const r = importDesign(json, catalog);
      if (r.ok) useApp.getState().load(r.design);
      return r.ok ? { ok: true, warnings: r.warnings } : { ok: false, error: r.error };
    },
    async fixture(name) {
      const { fixtureDesign } = await import('./fixtures');
      useApp.getState().load(fixtureDesign(name));
    },
    design: () => useApp.getState().design,
    view: (patch) => useApp.getState().setView(patch),
    settle: () => need().settle(),
    stats: () => ({ ...need().stats }),
    toScreen: (p) => need().toScreen(p),
    pick: (x, y) => need().pick(x, y),
    motions: (id) =>
      (useApp.getState().scene.entities.get(id)?.parts ?? [])
        .filter((p) => p.motion)
        .map((p) => ({ part: p.id, motion: p.motion })),
    bounds: (id) => useApp.getState().scene.entities.get(id)?.bounds ?? null,
    part: (id) => useApp.getState().scene.parts.get(id)?.obb ?? null,
    perf: () => {
      const median = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
      const s = useApp.getState();
      const ids = s.design.order;
      const rebuild: number[] = [];
      let doc = s.design;
      buildScene(doc, catalog);
      for (let i = 0; i < 30; i++) {
        const id = ids[i % ids.length]!;
        const r = applyTransaction(
          doc,
          { label: 'perf', ops: [{ type: 'entity.move', ids: [id], delta: { x: 1, y: 0, z: 0 } }] },
          { newId, now: () => '', catalog, mode: 'partial' },
        );
        doc = r.doc;
        const t0 = performance.now();
        buildScene(doc, catalog);
        rebuild.push(performance.now() - t0);
      }
      const scene = buildScene(doc, catalog);
      const moving = ids[0]!;
      const box = scene.entities.get(moving)!.bounds;
      const ctx = snapContext(doc, scene, [moving], 10, 30);
      const snap: number[] = [];
      for (let i = 0; i < 200; i++) {
        const t0 = performance.now();
        snapMove(ctx, box, { x: (i % 40) * 7, y: 0, z: (i % 13) * 5 });
        snap.push(performance.now() - t0);
      }
      return { rebuildMs: median(rebuild), snapMs: median(snap) };
    },
    state: () => {
      const s = useApp.getState();
      return {
        undo: s.history.past.length,
        selection: s.selection.entities,
        open: [...s.view.open],
        checks: s.checks.map((c) => ({ kind: c.kind, entities: c.entities })),
      };
    },
  };
}
