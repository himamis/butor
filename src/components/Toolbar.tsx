import { useStore, type Grid } from '../state/store';
import { ViewControls } from './ViewControls';
import { openFile, saveToFile } from '../lib/persistence';

export function Toolbar({ onCutList, onShare, onChat, chatOpen }: { onCutList: () => void; onShare: () => void; onChat: () => void; chatOpen: boolean }) {
  const s = useStore();
  const canGroup = s.selection.length > 1;
  const canUngroup = s.design.objects.some((o) => s.selection.includes(o.id) && o.groupId);

  const open = async () => {
    try {
      const d = await openFile();
      if (d) s.loadDesign(d);
    } catch {
      alert('Could not read this design file.');
    }
  };

  const reset = () => {
    if (confirm('Start a new design? Unsaved changes will be lost (you can still undo).')) {
      s.commit((d) => ({ ...d, objects: [] }));
    }
  };

  return (
    <header className="toolbar">
      <span className="title">Wardrobe Designer</span>
      <button onClick={reset} title="Remove all objects">New</button>
      <button onClick={open}>Open…</button>
      <button onClick={() => saveToFile(s.design)}>Save</button>
      <div className="sep" />
      <button onClick={s.undo} disabled={!s.past.length} title="Undo (Ctrl+Z)" aria-label="Undo">↶</button>
      <button onClick={s.redo} disabled={!s.future.length} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">↷</button>
      <div className="sep" />
      <button className={s.mode === 'translate' ? 'active' : ''} onClick={() => s.setUi({ mode: 'translate' })} title="Move (G)">Move</button>
      <button className={s.mode === 'rotate' ? 'active' : ''} onClick={() => s.setUi({ mode: 'rotate' })} title="Rotate (T)">Rotate</button>
      <select title="Snap grid" value={s.grid} onChange={(e) => s.setUi({ grid: Number(e.target.value) as Grid })} style={{ width: 'auto' }}>
        <option value={1}>Grid 1 mm</option>
        <option value={10}>Grid 10 mm</option>
        <option value={50}>Grid 50 mm</option>
      </select>
      <div className="sep" />
      <button onClick={s.groupSelected} disabled={!canGroup} title="Group (Ctrl+G)">Group</button>
      <button onClick={s.ungroupSelected} disabled={!canUngroup} title="Ungroup (Ctrl+Shift+G)">Ungroup</button>
      <div className="sep" />
      <ViewControls />
      <div className="sep" />
      <button onClick={onCutList}>Cut list</button>
      <button onClick={onShare} title="Copy a read-only link to this design">Share</button>
      <button className={chatOpen ? 'active' : ''} onClick={onChat} title="Edit the design by chatting with an AI model">AI</button>
    </header>
  );
}
