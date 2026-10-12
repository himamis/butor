import { useEffect, useMemo, useState } from 'react';
import {
  buildScene,
  costEstimate,
  cutList,
  elevation,
  entityFrame,
  hardwareList,
  importDesign,
  wallElevations,
  type Design,
} from '../../core';
import { catalog, HARDWARE_PRICES } from '../../catalog';
import { getRepository } from '../repo';
import { Drawing } from './Drawing';
import { Plan } from './Plan';

type Paper = 'A4' | 'A3';

/** Renders an SVG figure to a PNG download. */
async function downloadPng(svg: SVGSVGElement, name: string) {
  const xml = new XMLSerializer().serializeToString(svg);
  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml' }));
  const img = new Image();
  await new Promise<void>((ok, fail) => {
    img.onload = () => ok();
    img.onerror = () => fail(new Error('could not render the drawing'));
    img.src = url;
  });
  const vb = svg.viewBox.baseVal;
  const c = document.createElement('canvas');
  c.width = 2400;
  c.height = Math.round((2400 * vb.height) / vb.width);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(url);
  c.toBlob((b) => {
    if (!b) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, 'image/png');
}

/** The print sheet (docs/v2/09-persistence.md#print-sheet-and-exports): SVG drawings + tables, printed to PDF. */
export function PrintSheet({ id }: { id: string }) {
  const [design, setDesign] = useState<Design | { error: string } | null>(null);
  const [paper, setPaper] = useState<Paper>('A4');

  useEffect(() => {
    void (async () => {
      const r = importDesign(await (await getRepository()).get(id), catalog);
      setDesign(r.ok ? r.design : { error: r.error });
    })();
  }, [id]);

  const data = useMemo(() => {
    if (!design || 'error' in design) return null;
    const scene = buildScene(design, catalog);
    const rows = cutList(design, scene);
    const hardware = hardwareList(scene);
    const units = design.order.map((eid) => design.entities[eid]!).filter((e) => e.kind === 'unit');
    return {
      scene,
      rows,
      hardware,
      cost: costEstimate(design, rows, hardware, HARDWARE_PRICES),
      walls: wallElevations(design, scene).filter((w) => w.elevation.rects.some((r) => r.role !== 'wall')),
      units: units.map((u) => ({ id: u.id, name: u.name, size: u.size, el: elevation(scene, [u.id], entityFrame(u)) })),
    };
  }, [design]);

  if (!design) return <p className="loading">Preparing the print sheet…</p>;
  if ('error' in design)
    return (
      <p className="notice" role="alert">
        {design.error}
      </p>
    );
  if (!data) return null;
  const pages: { id: string; title: string; units: typeof data.units }[] = [];
  for (let i = 0; i < data.units.length; i += 4)
    pages.push({ id: `u${i}`, title: 'Units', units: data.units.slice(i, i + 4) });

  return (
    <div className={`print paper-${paper}`}>
      <style>{`@page { size: ${paper} landscape; margin: 10mm; }`}</style>
      <div className="print-toolbar">
        <button type="button" className="primary" onClick={() => window.print()}>
          Print / save as PDF
        </button>
        <label>
          Paper{' '}
          <select value={paper} onChange={(e) => setPaper(e.target.value as Paper)} aria-label="Paper size">
            <option value="A4">A4 landscape</option>
            <option value="A3">A3 landscape</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => void downloadPng(document.querySelector('.sheet svg')!, `${design.name}-plan.png`)}
        >
          Plan as PNG
        </button>
      </div>

      <section className="sheet" aria-label="Plan">
        <header>
          <h1>{design.name}</h1>
          <span>
            {new Date(design.meta.updatedAt).toLocaleDateString()} · room {Math.round(design.room.height)} mm high · all
            dimensions in mm
          </span>
        </header>
        <Plan design={design} scene={data.scene} />
      </section>

      {data.walls.map((w) => (
        <section className="sheet" key={w.key} aria-label={`Wall ${w.index}`}>
          <header>
            <h2>Wall {w.index}</h2>
            <span>{Math.round(w.length)} mm, seen from inside the room</span>
          </header>
          <Drawing title={`Wall ${w.index}`} elevation={w.elevation} />
        </section>
      ))}

      {pages.map((p) => (
        <section className="sheet units" key={p.id} aria-label="Unit elevations">
          {p.units.map((u) => (
            <Drawing key={u.id} title={`${u.name} — ${u.size.w} × ${u.size.h} × ${u.size.d}`} elevation={u.el} />
          ))}
        </section>
      ))}

      <section className="sheet tables" aria-label="Lists">
        <h2>Cut list</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Material</th>
              <th>Part</th>
              <th>Length</th>
              <th>Width</th>
              <th>Thick.</th>
              <th>Qty</th>
              <th>Banding (long/short)</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r, i) => (
              <tr key={i}>
                <td>{r.materialName}</td>
                <td>{r.part}</td>
                <td className="num">{r.length}</td>
                <td className="num">{r.width}</td>
                <td className="num">{r.thickness}</td>
                <td className="num">{r.qty}</td>
                <td>
                  {r.banding.length}/{r.banding.width}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <h2>Hardware</h2>
        <table className="table">
          <tbody>
            {data.hardware.map((h) => (
              <tr key={h.name}>
                <td>{h.name}</td>
                <td className="num">{h.qty}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h2>Estimate</h2>
        <table className="table">
          <tbody>
            {data.cost.lines.map((l) => (
              <tr key={l.label}>
                <td>{l.label}</td>
                <td className="num">
                  {l.amount.toFixed(2)} {data.cost.currency}
                </td>
              </tr>
            ))}
            <tr className="total">
              <td>Total</td>
              <td className="num">
                {data.cost.total.toFixed(2)} {data.cost.currency}
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}
