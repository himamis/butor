import { useApp, type Grid } from './store';
import { setTool, useUi } from './ui';
import { MeasureButtons } from './MeasureButtons';

export function EditToolbar() {
  const canUndo = useApp((s) => s.history.past.length > 0);
  const canRedo = useApp((s) => s.history.future.length > 0);
  const grid = useApp((s) => s.grid);
  const snapping = useApp((s) => s.snapping);
  const tool = useUi((s) => s.tool);
  const s = useApp.getState;
  return (
    <div className="group" role="group" aria-label="Edit">
      <button type="button" onClick={() => s().undo()} disabled={!canUndo} title="Undo (Ctrl/⌘ Z)" aria-label="Undo">
        ↶
      </button>
      <button type="button" onClick={() => s().redo()} disabled={!canRedo} title="Redo (Ctrl/⌘ ⇧ Z)" aria-label="Redo">
        ↷
      </button>
      <button
        type="button"
        aria-pressed={tool === 'room'}
        onClick={() => setTool(tool === 'room' ? 'select' : 'room')}
        title="Edit the room: corners, walls, openings, obstacles (G)"
      >
        Room
      </button>
      <MeasureButtons />
      <select
        aria-label="Snap grid"
        value={grid}
        onChange={(e) => s().set({ grid: Number(e.target.value) as Grid })}
        title="Snap grid"
      >
        <option value={1}>Grid 1 mm</option>
        <option value={10}>Grid 10 mm</option>
        <option value={50}>Grid 50 mm</option>
      </select>
      <button
        type="button"
        aria-pressed={snapping}
        onClick={() => s().set({ snapping: !snapping })}
        title="Snapping (hold Alt to switch off while dragging)"
      >
        Snap
      </button>
    </div>
  );
}
