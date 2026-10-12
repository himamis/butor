import { useStore, type Grid, type View } from '../state/store';
import { openFile, saveToFile } from '../lib/persistence';

const VIEWS: { id: View; label: string }[] = [
  { id: '3d', label: '3D' },
  { id: 'front', label: 'Front' },
  { id: 'top', label: 'Top' },
  { id: 'side', label: 'Side' },
];

export function Toolbar({ onCutList }: { onCutList: () => void }) {
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
      <button onClick={s.undo} disabled={!s.past.length} title="Undo (Ctrl+Z)">↶ Undo</button>
      <button onClick={s.redo} disabled={!s.future.length} title="Redo (Ctrl+Shift+Z)">↷ Redo</button>
      <div className="sep" />
      <button className={s.mode === 'translate' ? 'active' : ''} onClick={() => s.setUi({ mode: 'translate' })} title="Move (G)">Move</button>
      <button className={s.mode === 'rotate' ? 'active' : ''} onClick={() => s.setUi({ mode: 'rotate' })} title="Rotate (T)">Rotate</button>
      <label style={{ marginLeft: 6, color: 'var(--muted)' }}>Grid</label>
      <select value={s.grid} onChange={(e) => s.setUi({ grid: Number(e.target.value) as Grid })} style={{ width: 70 }}>
        <option value={1}>1 mm</option>
        <option value={10}>10 mm</option>
        <option value={50}>50 mm</option>
      </select>
      <div className="sep" />
      <button onClick={s.groupSelected} disabled={!canGroup} title="Group (Ctrl+G)">Group</button>
      <button onClick={s.ungroupSelected} disabled={!canUngroup} title="Ungroup (Ctrl+Shift+G)">Ungroup</button>
      <div className="sep" />
      {VIEWS.map((v) => (
        <button key={v.id} className={s.view === v.id ? 'active' : ''} onClick={() => s.setUi({ view: v.id })}>{v.label}</button>
      ))}
      <div className="sep" />
      <button onClick={onCutList}>Cut list</button>
    </header>
  );
}
