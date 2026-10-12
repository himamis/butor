import { ErrorBoundary } from './ErrorBoundary';
import { HelpSheet } from './HelpSheet';
import { Library } from './Library';
import { RoomPanel } from './RoomPanel';
import { SidePanel } from './SidePanel';
import { useShortcuts } from './useShortcuts';
import { Viewport } from './Viewport';
import { ViewToolbar } from './ViewToolbar';
import { useApp } from './store';
import { EditToolbar } from './EditToolbar';
import { useUi } from './ui';
import { FileMenu } from './FileMenu';

/** The editor: toolbar, library (or room panel), 3D view and the side panel. */
export function App() {
  useShortcuts('editor');
  const tool = useUi((s) => s.tool);
  const notice = useUi((s) => s.notice);
  const saveError = useUi((s) => s.saveError);
  const name = useApp((s) => s.design.name);
  return (
    <div className="shell" data-testid="app-shell">
      <header className="toolbar" role="toolbar" aria-label="Main toolbar">
        <span className="title">Butor</span>
        <FileMenu />
        <span className="design-title" title={name}>
          {name}
        </span>
        <EditToolbar />
        <span className="sep" />
        <ViewToolbar />
      </header>
      <div className="library-slot">
        {tool === 'room' ? (
          <ErrorBoundary area="room panel">
            <RoomPanel />
          </ErrorBoundary>
        ) : (
          <ErrorBoundary area="library">
            <Library />
          </ErrorBoundary>
        )}
      </div>
      <main className="viewport" data-testid="viewport">
        {(notice || saveError) && (
          <div className="banner" role="status">
            {saveError ? `Saving failed (${saveError}); retrying… Export a file if this persists.` : notice}
            {!saveError && (
              <button type="button" aria-label="Dismiss" onClick={() => useUi.getState().set({ notice: null })}>
                ✕
              </button>
            )}
          </div>
        )}
        <ErrorBoundary area="3D view">
          <Viewport />
        </ErrorBoundary>
      </main>
      <div className="side-slot">
        <SidePanel />
      </div>
      <HelpSheet />
    </div>
  );
}
