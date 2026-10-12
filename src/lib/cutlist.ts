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
      if (p.role === 'handle' || p.role === 'hardware') continue; // bought, not cut
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

/** Hinges a door needs, by its height (common guidance for overlay doors). */
export function hingesFor(doorHeight: number): number {
  return doorHeight <= 1000 ? 2 : doorHeight <= 1500 ? 3 : doorHeight <= 2200 ? 4 : 5;
}

/** Drawer runners come in 50 mm steps; take the longest that fits the drawer box. */
const runnerLength = (boxDepth: number) => Math.max(250, Math.floor(boxDepth / 50) * 50);

/** Handles, hinges, drawer runners and other hardware, counted by name. */
export function hardwareList(objs: SceneObject[]): HardwareRow[] {
  const counts = new Map<string, number>();
  const add = (name: string, n = 1) => counts.set(name, (counts.get(name) ?? 0) + n);
  for (const o of objs) {
    const panels = panelsOf(o);
    for (const p of panels) if (p.hardware) add(p.hardware);
    // One entry per moving part: hinged doors get hinges, drawers get a pair of runners.
    const seen = new Set<string>();
    for (const p of panels) {
      const m = p.motion;
      if (!m || seen.has(m.id)) continue;
      seen.add(m.id);
      const part = panels.filter((q) => q.motion?.id === m.id);
      if (m.kind === 'hinge') {
        const door = part.find((q) => q.role === 'door');
        if (door) add('Hinge', hingesFor(door.size.y));
      } else {
        const side = part.find((q) => q.role === 'drawer');
        if (side) add(`Drawer runners ${runnerLength(side.size.z)} mm (pair)`);
      }
    }
  }
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
