import { useState } from 'react';
import { Viewport } from './Viewport';
import { StatusBar } from './StatusBar';
import { CutListDialog } from './CutListDialog';
import { ViewControls } from './ViewControls';

/** Read-only layout for shared links: look around, open/close, explode, cut list. */
export function ViewerApp() {
  const [cutList, setCutList] = useState(false);
  return (
    <div className="app viewer">
      <header className="toolbar">
        <span className="title">Wardrobe Designer · view only</span>
        <ViewControls />
        <div className="sep" />
        <button onClick={() => setCutList(true)}>Cut list</button>
      </header>
      <Viewport />
      <StatusBar />
      {cutList && <CutListDialog onClose={() => setCutList(false)} />}
    </div>
  );
}

export function BrokenShareLink() {
  return (
    <div className="broken-link">
      <h2>This share link is damaged</h2>
      <p>It may have been cut off when it was copied. Ask for the link again, or <a href={location.pathname}>open the editor</a>.</p>
    </div>
  );
}
