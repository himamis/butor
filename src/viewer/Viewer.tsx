import { useEffect, useState } from 'react';
import { catalog } from '../catalog';
import { decodeShare } from '../persistence/share';
import { ErrorBoundary } from '../app/ErrorBoundary';
import { MeasureButtons } from '../app/MeasureButtons';
import { OutputsPanel } from '../app/OutputsPanel';
import { useApp } from '../app/store';
import { useShortcuts } from '../app/useShortcuts';
import { Viewport } from '../app/Viewport';
import { ViewToolbar } from '../app/ViewToolbar';
import { setTool, useUi } from '../app/ui';

/**
 * The read-only viewer for share links (docs/v2/09-persistence.md#share-links). It decodes the design from
 * the URL fragment and never opens the visitor's design storage. Every edit is refused by the store.
 */
export function Viewer() {
  const [state, setState] = useState<'loading' | 'ready' | { error: string }>('loading');
  const name = useApp((s) => s.design.name);
  const status = useUi((s) => s.status);
  const [lists, setLists] = useState(false);
  useShortcuts('viewer');

  useEffect(() => {
    const open = () => {
      const r = decodeShare(window.location.hash, catalog);
      if (!r.ok) {
        setState({ error: r.error });
        return;
      }
      const app = useApp.getState();
      app.setReadOnly(true);
      app.load(r.design);
      setTool('select');
      setState('ready');
    };
    open();
    window.addEventListener('hashchange', open);
    return () => {
      window.removeEventListener('hashchange', open);
    };
  }, []);

  if (state === 'loading') return <p className="loading">Opening…</p>;
  if (typeof state === 'object')
    return (
      <main className="start">
        <h1>Butor</h1>
        <p className="notice" role="alert">
          {state.error}
        </p>
        <a href="/">Open Butor</a>
      </main>
    );
  return (
    <div className="shell viewer" data-testid="viewer-shell">
      <header className="toolbar" role="toolbar" aria-label="Viewer toolbar">
        <span className="title">Butor</span>
        <span className="design-title" title={name}>
          {name} <span className="muted">· read-only</span>
        </span>
        <span className="sep" />
        <ViewToolbar />
        <span className="sep" />
        <MeasureButtons />
        <button type="button" aria-pressed={lists} onClick={() => setLists(!lists)}>
          Cut list
        </button>
        {status && <span className="muted small">{status}</span>}
      </header>
      <main className="viewport" data-testid="viewport">
        <ErrorBoundary area="3D view">
          <Viewport readOnly />
        </ErrorBoundary>
      </main>
      {lists && (
        <aside className="side-panel viewer-lists" aria-label="Lists">
          <ErrorBoundary area="lists">
            <OutputsPanel />
          </ErrorBoundary>
        </aside>
      )}
    </div>
  );
}
