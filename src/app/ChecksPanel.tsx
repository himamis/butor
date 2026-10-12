import type { Check } from '../core';
import { frameEntities } from './frame';
import { useApp } from './store';

const KIND_LABEL: Record<Check['kind'], string> = {
  invalid: 'Cannot be built',
  overlap: 'Overlaps',
  obstacle: 'Obstacles',
  'outside-room': 'Outside the room',
  ceiling: 'Taller than the ceiling',
  'door-swing': 'Door swing clearance',
  'pull-out': 'Drawer pull-out clearance',
  opening: 'Blocking a door or window',
  material: 'Materials',
  'not-against-wall': 'Not against a wall',
};

/** Problems in the design; clicking one selects and frames the entities involved (docs/v2/01-features.md#f8). */
export function ChecksPanel() {
  const checks = useApp((s) => s.checks);
  if (!checks.length) return <p className="muted panel-body">No problems found.</p>;
  const kinds = [...new Set(checks.map((c) => c.kind))].sort(
    (a, b) =>
      Number(checks.find((c) => c.kind === b)!.severity === 'error') -
      Number(checks.find((c) => c.kind === a)!.severity === 'error'),
  );
  return (
    <div className="panel-body">
      {kinds.map((k) => (
        <section key={k} aria-label={KIND_LABEL[k]}>
          <h3>{KIND_LABEL[k]}</h3>
          <ul className="checks">
            {checks
              .filter((c) => c.kind === k)
              .map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`check ${c.severity}`}
                    onClick={() => {
                      useApp.getState().select(c.entities.filter((id) => useApp.getState().design.entities[id]));
                      frameEntities(c.entities);
                    }}
                  >
                    <span aria-hidden="true">{c.severity === 'error' ? '⛔' : '⚠️'}</span> {c.message}
                  </button>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
