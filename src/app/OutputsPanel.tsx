import { useMemo } from 'react';
import { costEstimate, cutList, cutListCsv, hardwareCsv, hardwareList } from '../core';
import { HARDWARE_PRICES } from '../catalog';
import { downloadText } from './download';
import { useApp } from './store';

const money = (v: number, currency: string) => {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(v);
  } catch {
    return `${v.toFixed(2)} ${currency}`;
  }
};

/** Cut list, hardware and cost estimate, with CSV downloads (docs/v2/01-features.md#f10-outputs). */
export function OutputsPanel() {
  const design = useApp((s) => s.design);
  const scene = useApp((s) => s.scene);
  const { rows, hardware, cost } = useMemo(() => {
    const committed = useApp.getState().previewDoc ? null : scene;
    const sc = committed ?? scene;
    const rows = cutList(design, sc);
    const hardware = hardwareList(sc);
    return { rows, hardware, cost: costEstimate(design, rows, hardware, HARDWARE_PRICES) };
  }, [design, scene]);
  const base =
    design.name
      .replace(/[^\p{L}\p{N} _-]+/gu, '')
      .trim()
      .replace(/\s+/g, '-') || 'design';

  return (
    <div className="panel-body outputs">
      <div className="row">
        <button type="button" onClick={() => downloadText(`${base}-cut-list.csv`, cutListCsv(rows), 'text/csv')}>
          Cut list CSV
        </button>
        <button type="button" onClick={() => downloadText(`${base}-hardware.csv`, hardwareCsv(hardware), 'text/csv')}>
          Hardware CSV
        </button>
      </div>
      <h3>Cut list</h3>
      {!rows.length && <p className="muted">No boards yet.</p>}
      {rows.length > 0 && (
        <table className="table" aria-label="Cut list">
          <thead>
            <tr>
              <th>Part</th>
              <th>L × W × T</th>
              <th>Qty</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>
                  {r.part}
                  <span className="muted small"> · {r.materialName}</span>
                </td>
                <td>
                  {r.length} × {r.width} × {r.thickness}
                </td>
                <td>{r.qty}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h3>Hardware</h3>
      {!hardware.length && <p className="muted">No hardware.</p>}
      {hardware.length > 0 && (
        <table className="table" aria-label="Hardware">
          <tbody>
            {hardware.map((h) => (
              <tr key={h.name}>
                <td>{h.name}</td>
                <td>{h.qty}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h3>Estimate</h3>
      <table className="table" aria-label="Cost estimate">
        <tbody>
          {cost.lines.map((l) => (
            <tr key={l.label}>
              <td>{l.label}</td>
              <td className="num">{money(l.amount, cost.currency)}</td>
            </tr>
          ))}
          <tr className="total">
            <td>Total</td>
            <td className="num">{money(cost.total, cost.currency)}</td>
          </tr>
        </tbody>
      </table>
      {cost.unpriced.length > 0 && <p className="muted small">Not priced: {cost.unpriced.join(', ')}.</p>}
    </div>
  );
}
