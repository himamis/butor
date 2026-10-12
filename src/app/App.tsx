import { ErrorBoundary } from './ErrorBoundary';
import { HelpSheet } from './HelpSheet';
import { Library } from './Library';
import { installTestHooks } from './testHooks';
import { useShortcuts } from './useShortcuts';
import { Viewport } from './Viewport';
import { ViewToolbar } from './ViewToolbar';
import { EditToolbar } from './EditToolbar';

installTestHooks();

/** The editor (properties, materials and outputs panels arrive in M6–M7). */
export function App() {
  useShortcuts('editor');
  return (
    <div className="shell" data-testid="app-shell">
      <header className="toolbar" role="toolbar" aria-label="Main toolbar">
        <span className="title">Butor</span>
        <EditToolbar />
        <span className="sep" />
        <ViewToolbar />
      </header>
      <div className="library-slot">
        <ErrorBoundary area="library">
          <Library />
        </ErrorBoundary>
      </div>
      <main className="viewport" data-testid="viewport">
        <ErrorBoundary area="3D view">
          <Viewport />
        </ErrorBoundary>
      </main>
      <HelpSheet />
    </div>
  );
}
