import type { Axis, PartRole } from '../geometry/part';
import type { SceneModel, ScenePart } from '../geometry/scene';
import type { Design } from '../schema/design';

/* Workshop outputs (docs/v2/01-features.md#f10): cut list, hardware list, cost estimate. */

const BOARD_ROLES = new Set<PartRole>(['carcass', 'back', 'divider', 'shelf', 'front', 'drawer-box', 'trim']);
const r1 = (v: number) => Math.round(v * 10) / 10;

export interface CutRow {
  material: string;
  materialName: string;
  part: string;
  length: number; // along the grain (or the longer side when the board has no grain)
  width: number;
  thickness: number;
  qty: number;
  banding: { length: number; width: number }; // number of banded long / short edges
}

const FACE_AXIS: Record<string, Axis> = { left: 'x', right: 'x', top: 'y', bottom: 'y', front: 'z', back: 'z' };

function boardRow(p: ScenePart, design: Design): Omit<CutRow, 'qty'> | null {
  const th = p.material.thickness;
  if (!BOARD_ROLES.has(p.role) || th === undefined) return null;
  const axes: Axis[] = ['x', 'y', 'z'];
  const thicknessAxis = axes.reduce(
    (best, a) => (Math.abs(p.size[a] - th) < Math.abs(p.size[best] - th) ? a : best),
    'x' as Axis,
  );
  const others = axes.filter((a) => a !== thicknessAxis) as [Axis, Axis];
  const lengthAxis =
    p.grainAlong && p.grainAlong !== thicknessAxis
      ? p.grainAlong
      : p.size[others[0]] >= p.size[others[1]]
        ? others[0]
        : others[1];
  const widthAxis = others.find((a) => a !== lengthAxis)!;
  const banding = { length: 0, width: 0 };
  for (const [face, on] of Object.entries(p.banding ?? {})) {
    if (!on) continue;
    const n = FACE_AXIS[face];
    if (n === lengthAxis) banding.width++;
    else if (n === widthAxis) banding.length++;
  }
  const mat = design.materials[p.material.id];
  return {
    material: p.material.id,
    materialName: mat?.name ?? p.material.id,
    part: p.label,
    length: r1(p.size[lengthAxis]),
    width: r1(p.size[widthAxis]),
    thickness: th,
    banding,
  };
}

/** Every board part, merged into rows of identical pieces, grouped by material and thickness. */
export function cutList(design: Design, scene: SceneModel): CutRow[] {
  const rows = new Map<string, CutRow>();
  for (const p of scene.parts.values()) {
    const r = boardRow(p, design);
    if (!r) continue;
    const key = [r.material, r.thickness, r.part, r.length, r.width, r.banding.length, r.banding.width].join('|');
    const prev = rows.get(key);
    if (prev) prev.qty++;
    else rows.set(key, { ...r, qty: 1 });
  }
  return [...rows.values()].sort(
    (a, b) =>
      a.materialName.localeCompare(b.materialName) ||
      b.thickness - a.thickness ||
      b.length * b.width - a.length * a.width ||
      a.part.localeCompare(b.part),
  );
}

const csvCell = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

export function cutListCsv(rows: CutRow[]): string {
  const head = [
    'Material',
    'Part',
    'Length (mm)',
    'Width (mm)',
    'Thickness (mm)',
    'Qty',
    'Banded long edges',
    'Banded short edges',
  ];
  return [
    head,
    ...rows.map((r) => [
      r.materialName,
      r.part,
      r.length,
      r.width,
      r.thickness,
      r.qty,
      r.banding.length,
      r.banding.width,
    ]),
  ]
    .map((l) => l.map(csvCell).join(','))
    .join('\n');
}

export interface HardwareRow {
  name: string;
  qty: number;
}

/** Hardware counted from parts (hinges carry their count on the door, runners on the drawer, …). */
export function hardwareList(scene: SceneModel): HardwareRow[] {
  const counts = new Map<string, number>();
  for (const p of scene.parts.values()) {
    if (!p.hardware) continue;
    counts.set(p.hardware.name, (counts.get(p.hardware.name) ?? 0) + (p.hardware.count ?? 1));
  }
  return [...counts].map(([name, qty]) => ({ name, qty })).sort((a, b) => a.name.localeCompare(b.name));
}

export function hardwareCsv(rows: HardwareRow[]): string {
  return [['Item', 'Qty'], ...rows.map((r) => [r.name, r.qty])].map((l) => l.map(csvCell).join(',')).join('\n');
}

export interface CostLine {
  label: string;
  amount: number;
}

export interface CostEstimate {
  currency: string;
  lines: CostLine[];
  total: number;
  unpriced: string[]; // hardware without a known price
}

export const WASTE = 0.15; // board offcuts

export function costEstimate(
  design: Design,
  rows: CutRow[],
  hardware: HardwareRow[],
  price: (hardwareName: string) => number | undefined,
): CostEstimate {
  const lines: CostLine[] = [];
  let currency = 'EUR';
  const byBoard = new Map<string, { area: number; band: number; material: string; thickness: number }>();
  for (const r of rows) {
    const key = `${r.material}|${r.thickness}`;
    const acc = byBoard.get(key) ?? { area: 0, band: 0, material: r.material, thickness: r.thickness };
    acc.area += (r.length * r.width * r.qty) / 1e6;
    acc.band += ((r.length * r.banding.length + r.width * r.banding.width) * r.qty) / 1000;
    byBoard.set(key, acc);
  }
  for (const acc of byBoard.values()) {
    const m = design.materials[acc.material];
    if (m?.kind !== 'board') continue;
    currency = m.price.currency;
    lines.push({
      label: `${m.name} ${acc.thickness} mm — ${acc.area.toFixed(2)} m² (+${WASTE * 100}% waste)`,
      amount: acc.area * (1 + WASTE) * m.price.perM2,
    });
    if (m.edgeBanding && acc.band > 0)
      lines.push({ label: `${m.edgeBanding.name} — ${acc.band.toFixed(1)} m`, amount: acc.band * m.edgeBanding.perM });
  }
  const unpriced: string[] = [];
  for (const h of hardware) {
    const unit = price(h.name);
    if (unit === undefined) unpriced.push(h.name);
    else lines.push({ label: `${h.name} × ${h.qty}`, amount: unit * h.qty });
  }
  const total = lines.reduce((s, l) => s + l.amount, 0);
  return { currency, lines, total, unpriced };
}
export * from './elevation';
