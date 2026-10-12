import { ErrorBoundary } from './ErrorBoundary';
import { installTestHooks } from './testHooks';
import { Viewport } from './Viewport';
import { ViewToolbar } from './ViewToolbar';

installTestHooks();

/** Application shell. Editing tools and panels arrive in M4–M6 (docs/v2/11-roadmap.md). */
export function App() {
  return (
    <div className="shell" data-testid="app-shell">
      <header className="toolbar" role="toolbar" aria-label="Main toolbar">
        <span className="title">Butor</span>
        <ViewToolbar />
      </header>
      <main className="viewport" data-testid="viewport">
        <ErrorBoundary area="3D view">
          <Viewport />
        </ErrorBoundary>
      </main>
    </div>
  );
}
