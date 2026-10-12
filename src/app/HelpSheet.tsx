import { SHORTCUTS } from '../interaction/shortcuts';
import { useUi } from './ui';

/** The shortcut sheet (?), generated from the shortcut table. */
export function HelpSheet() {
  const open = useUi((s) => s.help);
  const set = useUi((s) => s.set);
  if (!open) return null;
  const rows = SHORTCUTS.filter((s) => s.scope !== 'viewer');
  return (
    <div className="modal-backdrop" onClick={() => set({ help: false })}>
      <div className="modal" role="dialog" aria-label="Keyboard shortcuts" onClick={(e) => e.stopPropagation()}>
        <h2>Keyboard shortcuts</h2>
        <table>
          <tbody>
            {rows.map((s) => (
              <tr key={`${s.action}-${s.display}`}>
                <td>
                  <kbd>{s.display}</kbd>
                </td>
                <td>{s.label}</td>
              </tr>
            ))}
            <tr>
              <td>
                <kbd>Alt</kbd> (hold)
              </td>
              <td>Snapping off while dragging</td>
            </tr>
          </tbody>
        </table>
        <button type="button" onClick={() => set({ help: false })}>
          Close
        </button>
      </div>
    </div>
  );
}
