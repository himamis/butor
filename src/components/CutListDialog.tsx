import { useMemo } from 'react';
import { useStore } from '../state/store';
import { cutList, hardwareList, toCsv } from '../lib/cutlist';

export function CutListDialog({ onClose }: { onClose: () => void }) {
  const objects = useStore((s) => s.design.objects);
  const rows = useMemo(() => cutList(objects), [objects]);
  const hardware = useMemo(() => hardwareList(objects), [objects]);
  const area = rows.reduce((sum, r) => sum + (r.color === 'metal' ? 0 : (r.length * r.width * r.qty) / 1e6), 0);

  const download = () => {
    const blob = new Blob([toCsv(rows, hardware)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'cut-list.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: 0 }}>Cut list</h2>
        {rows.length ? (
          <table>
            <thead>
              <tr>
                <th>Part</th><th className="num">Length</th><th className="num">Width</th><th className="num">Thickness</th><th>Color</th><th className="num">Qty</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.part}</td>
                  <td className="num">{r.length}</td>
                  <td className="num">{r.width}</td>
                  <td className="num">{r.thickness}</td>
                  <td>{r.color !== 'metal' && <span className="color-dot" style={{ background: r.color }} />}{r.color}</td>
                  <td className="num">{r.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No panels in the design yet.</p>
        )}
        {hardware.length > 0 && (
          <>
            <h3>Hardware</h3>
            <table>
              <thead><tr><th>Item</th><th className="num">Qty</th></tr></thead>
              <tbody>
                {hardware.map((h) => <tr key={h.part}><td>{h.part}</td><td className="num">{h.qty}</td></tr>)}
              </tbody>
            </table>
          </>
        )}
        <p style={{ color: 'var(--muted)' }}>All sizes in mm. Total board area: {area.toFixed(2)} m².</p>
        <div className="buttons">
          <button onClick={download} disabled={!rows.length}>Download CSV</button>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
