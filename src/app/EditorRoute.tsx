import { useEffect, useState } from 'react';
import { importDesign } from '../core';
import { catalog } from '../catalog';
import type { ViewMode } from '../render/Renderer';
import { App } from './App';
import { startAutosave } from './autosave';
import { getRepository } from './repo';
import { navigate } from './router';
import { useApp, type Grid } from './store';
import { useUi } from './ui';

/** Opens a saved design in the editor and keeps it saved while it is open. */
export function EditorRoute({ id }: { id: string }) {
  const [state, setState] = useState<'loading' | 'ready' | { error: string }>('loading');

  useEffect(() => {
    let stops: (() => void)[] = [];
    let cancelled = false;
    void (async () => {
      const repo = await getRepository();
      const app = useApp.getState();
      app.setReadOnly(false);
      // Always from storage: whatever is in memory may be a shared design that must never be saved here.
      {
        const raw = await repo.get(id);
        if (cancelled) return;
        if (raw === undefined) {
          setState({ error: 'This design does not exist any more (it may have been deleted in another tab).' });
          return;
        }
        const r = importDesign(raw, catalog);
        if (!r.ok) {
          setState({ error: r.error });
          return;
        }
        app.load(r.design);
        if (r.warnings.length) useUi.getState().set({ notice: `Opened with warnings: ${r.warnings.join('; ')}` });
        const view = await repo.getView(id);
        if (view)
          app.setView({
            ...(view.mode ? { mode: view.mode as ViewMode } : {}),
            ...(view.explodeAmount !== undefined ? { explodeAmount: view.explodeAmount } : {}),
            ...(view.hideFronts !== undefined ? { hideFronts: view.hideFronts } : {}),
          });
      }
      const grid = await repo.getSetting<Grid>('grid');
      const snapping = await repo.getSetting<boolean>('snapping');
      if (cancelled) return;
      if (grid) app.set({ grid });
      if (snapping !== undefined) app.set({ snapping });
      stops.push(startAutosave(repo));
      stops.push(
        useApp.subscribe((s, p) => {
          if (
            s.view.mode !== p.view.mode ||
            s.view.explodeAmount !== p.view.explodeAmount ||
            s.view.hideFronts !== p.view.hideFronts
          )
            void repo
              .putView(s.design.id, {
                mode: s.view.mode,
                explodeAmount: s.view.explodeAmount,
                hideFronts: s.view.hideFronts,
              })
              .catch(() => undefined);
          if (s.grid !== p.grid) void repo.putSetting('grid', s.grid).catch(() => undefined);
          if (s.snapping !== p.snapping) void repo.putSetting('snapping', s.snapping).catch(() => undefined);
        }),
      );
      setState('ready');
    })();
    return () => {
      cancelled = true;
      for (const s of stops) s();
      stops = [];
    };
  }, [id]);

  if (state === 'loading') return <p className="loading">Opening…</p>;
  if (typeof state === 'object')
    return (
      <main className="start">
        <p className="notice" role="alert">
          {state.error}
        </p>
        <button type="button" onClick={() => navigate('/')}>
          All designs
        </button>
      </main>
    );
  return <App />;
}
