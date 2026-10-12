import { importDesign, type Design } from '../core';
import { catalog } from '../catalog';
import type { Renderer } from '../render/Renderer';
import { useApp, type ViewSettings } from './store';

/** Test hooks for Playwright (docs/v2/10-quality.md). Only present in `--mode test` builds. */
export interface ButorTestHooks {
  ready: boolean;
  secureContext: boolean;
  load(json: unknown): { ok: boolean; error?: string; warnings?: string[] };
  fixture(name: 'hundred-units' | 'reference'): Promise<void>;
  design(): Design;
  view(patch: Partial<ViewSettings>): void;
  settle(): void;
  stats(): { frames: number; calls: number; triangles: number };
  toScreen(p: { x: number; y: number; z: number }): { x: number; y: number };
  pick(x: number, y: number): unknown;
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
    ready: true,
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
