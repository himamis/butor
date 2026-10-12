import type { SceneObject } from '../types';
import { panelsOf } from './geometry';

export type CutRow = { part: string; length: number; width: number; thickness: number; color: string; qty: number };
export type HardwareRow = { part: string; qty: number };

const CUTOUT_LABEL = { hole: 'grip hole', notch: 'grip notch' } as const;

const r1 = (v: number) => Math.round(v * 10) / 10;

/** One row per distinct panel (part + dimensions + color), with quantities merged. */
export function cutList(objs: SceneObject[]): CutRow[] {
  const rows = new Map<string, CutRow>();
  for (const o of objs) {
    for (const p of panelsOf(o)) {
      if (p.role === 'handle') continue;
      const part = p.cutout ? `${p.name} (${CUTOUT_LABEL[p.cutout.kind]})` : p.name;
      const color = p.role === 'door' && o.doorColor ? o.doorColor : o.color;
      let row: Omit<CutRow, 'qty'>;
      if (p.role === 'rail') {
        const dia = r1(Math.min(p.size.y, p.size.z));
        row = { part, length: r1(p.size.x), width: dia, thickness: dia, color: 'metal' };
      } else {
        const [length, width, thickness] = [p.size.x, p.size.y, p.size.z].map(r1).sort((a, b) => b - a);
        row = { part, length, width, thickness, color };
      }
      const key = `${row.part}|${row.length}|${row.width}|${row.thickness}|${row.color}`;
      const prev = rows.get(key);
      if (prev) prev.qty++;
      else rows.set(key, { ...row, qty: 1 });
    }
  }
  return [...rows.values()].sort((a, b) => b.thickness - a.thickness || b.length * b.width - a.length * a.width);
}

/** Handles and other hardware, counted by name. */
export function hardwareList(objs: SceneObject[]): HardwareRow[] {
  const counts = new Map<string, number>();
  for (const o of objs) for (const p of panelsOf(o)) if (p.role === 'handle') counts.set(p.name, (counts.get(p.name) ?? 0) + 1);
  return [...counts].map(([part, qty]) => ({ part, qty })).sort((a, b) => a.part.localeCompare(b.part));
}

const esc = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(rows: CutRow[], hardware: HardwareRow[] = []): string {
  const head = ['Part', 'Length (mm)', 'Width (mm)', 'Thickness (mm)', 'Color', 'Qty'];
  return [
    head,
    ...rows.map((r) => [r.part, r.length, r.width, r.thickness, r.color, r.qty]),
    ...hardware.map((h) => [h.part, '', '', '', 'hardware', h.qty]),
  ]
    .map((line) => line.map(esc).join(','))
    .join('\n');
}
