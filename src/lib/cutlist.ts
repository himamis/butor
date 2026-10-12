import type { SceneObject } from '../types';
import { panelsOf } from './geometry';

export type CutRow = { part: string; length: number; width: number; thickness: number; color: string; qty: number };

const r1 = (v: number) => Math.round(v * 10) / 10;

/** One row per distinct panel (part + dimensions + color), with quantities merged. */
export function cutList(objs: SceneObject[]): CutRow[] {
  const rows = new Map<string, CutRow>();
  for (const o of objs) {
    for (const p of panelsOf(o)) {
      const color = p.role === 'door' && o.doorColor ? o.doorColor : o.color;
      let row: Omit<CutRow, 'qty'>;
      if (p.role === 'rail') {
        const dia = r1(Math.min(p.size.y, p.size.z));
        row = { part: p.name, length: r1(p.size.x), width: dia, thickness: dia, color: 'metal' };
      } else {
        const [length, width, thickness] = [p.size.x, p.size.y, p.size.z].map(r1).sort((a, b) => b - a);
        row = { part: p.name, length, width, thickness, color };
      }
      const key = `${row.part}|${row.length}|${row.width}|${row.thickness}|${row.color}`;
      const prev = rows.get(key);
      if (prev) prev.qty++;
      else rows.set(key, { ...row, qty: 1 });
    }
  }
  return [...rows.values()].sort((a, b) => b.thickness - a.thickness || b.length * b.width - a.length * a.width);
}

const esc = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(rows: CutRow[]): string {
  const head = ['Part', 'Length (mm)', 'Width (mm)', 'Thickness (mm)', 'Color', 'Qty'];
  return [head, ...rows.map((r) => [r.part, r.length, r.width, r.thickness, r.color, r.qty])]
    .map((line) => line.map(esc).join(','))
    .join('\n');
}
