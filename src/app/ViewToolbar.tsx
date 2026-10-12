import type { ViewMode } from '../render/Renderer';
import { useApp } from './store';

const MODES: { id: ViewMode; label: string; key: string }[] = [
  { id: '3d', label: '3D', key: '1' },
  { id: 'front', label: 'Front', key: '2' },
  { id: 'top', label: 'Top', key: '3' },
  { id: 'side', label: 'Side', key: '4' },
  { id: 'elevation', label: 'Wall', key: '5' },
];

/** View controls shared by the editor and the read-only viewer. */
export function ViewToolbar() {
  const view = useApp((s) => s.view);
  const room = useApp((s) => s.design.room);
  const setView = useApp((s) => s.setView);
  const setOpenAll = useApp((s) => s.setOpenAll);
  const walls = Object.keys(room.walls);

  return (
    <div className="group" role="group" aria-label="View">
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          aria-pressed={view.mode === m.id}
          title={`${m.label} view (${m.key})`}
          onClick={() =>
            setView({
              mode: m.id,
              elevationWall: m.id === 'elevation' ? (view.elevationWall ?? walls[0] ?? null) : view.elevationWall,
            })
          }
        >
          {m.label}
        </button>
      ))}
      {view.mode === 'elevation' && (
        <select
          aria-label="Wall"
          value={view.elevationWall ?? ''}
          onChange={(e) => setView({ elevationWall: e.target.value })}
        >
          {walls.map((k, i) => (
            <option key={k} value={k}>
              Wall {i + 1}
            </option>
          ))}
        </select>
      )}
      <span className="sep" />
      <button
        type="button"
        onClick={() => setOpenAll(view.open.size === 0)}
        title="Open or close all doors and drawers (O)"
      >
        {view.open.size ? 'Close all' : 'Open all'}
      </button>
      <button
        type="button"
        aria-pressed={view.exploded}
        onClick={() => setView({ exploded: !view.exploded })}
        title="Exploded view (E)"
      >
        Explode
      </button>
      {view.exploded && (
        <input
          type="range"
          aria-label="Explode amount"
          min={0.1}
          max={1}
          step={0.05}
          value={view.explodeAmount}
          onChange={(e) => setView({ explodeAmount: Number(e.target.value) })}
        />
      )}
      <button
        type="button"
        aria-pressed={view.hideFronts}
        onClick={() => setView({ hideFronts: !view.hideFronts })}
        title="Hide doors and drawer fronts"
      >
        Hide fronts
      </button>
    </div>
  );
}
