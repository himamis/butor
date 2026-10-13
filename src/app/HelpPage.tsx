import { describeParams, type ParamDescription } from '../core';
import { catalog, CATEGORIES, PRESETS } from '../catalog';
import { SHORTCUTS } from '../interaction/shortcuts';
import { navigate } from './router';

const MOUSE: [string, string][] = [
  ['Click', 'Select a unit; click it again to select the door, drawer or shelf under the cursor'],
  ['Shift + click / Shift + drag', 'Add to the selection / select with a box'],
  [
    'Drag a selected unit',
    'Move it on the floor; it snaps flush to walls and other units (hold Alt for free movement)',
  ],
  ['Drag a blue handle', 'Resize that side; the opposite side stays where it is'],
  ['Drag the ring', 'Rotate in 15° steps (Shift: 90°)'],
  ['Double-click', 'Open or close a unit'],
  ['Drag empty space / wheel', 'Orbit and zoom the camera'],
  ['Drag from the library', 'Place a unit in the room, or an item or front into a unit'],
];

function param(d: ParamDescription): string {
  switch (d.kind) {
    case 'mm':
      return `${d.label}: ${d.min}–${d.max} mm (default ${d.default})`;
    case 'count':
      return `${d.label}: ${d.min}–${d.max} (default ${d.default})`;
    case 'choice':
      return `${d.label}: ${Object.values(d.options).join(' / ')}`;
    case 'toggle':
      return `${d.label}: on / off`;
    case 'color':
      return `${d.label}: colour`;
  }
}

/** The user help, generated from the shortcut table and the catalog (docs/v2/11-roadmap.md#m9). */
export function HelpPage() {
  const scopes = [
    ['Editor', SHORTCUTS.filter((s) => s.scope !== 'viewer')],
    ['Shared-link viewer', SHORTCUTS.filter((s) => s.scope !== 'editor')],
  ] as const;
  return (
    <main className="start help" aria-label="Help">
      <header className="start-head">
        <h1>Butor help</h1>
        <button type="button" onClick={() => (history.length > 1 ? history.back() : navigate('/'))}>
          Back
        </button>
      </header>

      <h2>Getting started</h2>
      <ol>
        <li>
          Start a new design. The room is 4000 × 3500 mm; press G (or Room) to change its shape, walls, doors and
          windows.
        </li>
        <li>
          Drag a wardrobe or cabinet from the library into the room. Near a wall it turns to face the room and stands
          against it.
        </li>
        <li>
          Select it to edit everything in the panel on the right: size, construction, materials, columns, shelves,
          drawers and doors.
        </li>
        <li>
          Check the Checks tab for problems (overlaps, doors that hit something), and the Lists tab for the cut list,
          hardware and an estimate.
        </li>
        <li>
          Everything is saved automatically in this browser. Use File → Export to keep a copy, Share for a read-only
          link, Print sheet for drawings.
        </li>
      </ol>

      <h2>Mouse</h2>
      <table className="table">
        <tbody>
          {MOUSE.map(([k, v]) => (
            <tr key={k}>
              <td>{k}</td>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {scopes.map(([title, rows]) => (
        <section key={title}>
          <h2>Keyboard — {title.toLowerCase()}</h2>
          <table className="table">
            <tbody>
              {rows.map((s) => (
                <tr key={`${s.action}-${s.display}`}>
                  <td>
                    <kbd>{s.display}</kbd>
                  </td>
                  <td>{s.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      <h2>Library</h2>
      {CATEGORIES.map((c) => {
        const presets = PRESETS.filter((p) => p.category === c.id);
        const templates = catalog.all().filter((t) => t.category === c.id);
        return (
          <section key={c.id} aria-label={c.id}>
            <h3>{c.id}</h3>
            <p className="muted">{c.hint}</p>
            <ul>
              {presets.map((p) => (
                <li key={p.id}>
                  <strong>{p.name}</strong> — {p.description}
                </li>
              ))}
              {templates.map((t) => (
                <li key={t.id}>
                  <strong>{t.name}</strong> — {t.description}
                  {describeParams(t.params).length > 0 && (
                    <div className="muted small">{describeParams(t.params).map(param).join(' · ')}</div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <h2>The assistant</h2>
      <p>
        The AI tab changes the design from plain requests (“make all fronts walnut”). Each request is one undo step. It
        works with Claude (an Anthropic key in settings or on the server) or any OpenAI-compatible server, including
        local models. Keys stay in this browser and on this app’s server.
      </p>
    </main>
  );
}
