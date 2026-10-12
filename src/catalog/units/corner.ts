import { z } from 'zod';
import { count, mm, type PartDraft, type UnitTemplate } from '../../core';
import { boardPart } from '../builders/board';

const BACK = 8;
const params = z.object({
  thickness: mm({ label: 'Board', min: 12, max: 30, default: 18 }),
  armDepth: mm({ label: 'Arm depth', min: 250, max: 800, default: 580 }),
  shelves: count({ label: 'Shelves', min: 0, max: 10, default: 4 }),
});
type P = z.infer<typeof params>;

/** L-shaped open shelving for an inside corner (back-left), sized by its two arms (width along x, depth along z). */
export const cornerUnit: UnitTemplate = {
  id: 'unit.corner',
  version: 1,
  kind: 'unit',
  name: 'Corner shelving',
  category: 'Cabinets',
  description: 'L-shaped open shelving for an inside corner, sized by its two arms.',
  tags: ['corner', 'l-shape', 'angle', 'shelves', 'open'],
  params,
  minColumnWidth: 150,
  sizeLimits: { w: [600, 2400], h: [300, 3000], d: [600, 2400] },
  defaultSize: { w: 1200, h: 2200, d: 1200 },
  layout(unit) {
    const p = unit.params as unknown as P;
    const { w, h, d } = unit.size;
    const a = Math.min(p.armDepth, w - 100, d - 100);
    const t = p.thickness;
    if (unit.columns.length !== 1) return { error: 'corner shelving has exactly one column' };
    const n = Math.round(p.shelves);
    if ((h - 2 * t - n * t) / (n + 1) < 50)
      return { error: `${n} shelves do not fit in ${h} mm — use fewer shelves or a taller unit` };
    // Items placed in the corner unit go in the back arm (along x).
    return {
      inner: { w: w - BACK - t, h: h - 2 * t, d: a - BACK },
      floorY: t,
      innerZ: [-d / 2 + BACK, -d / 2 + a],
      columns: [{ x0: -w / 2 + BACK, width: w - BACK - t }],
      dividerThickness: t,
    };
  },
  build(unit, _layout, m): PartDraft[] {
    const p = unit.params as unknown as P;
    const { w, h, d } = unit.size;
    const t = p.thickness;
    const a = Math.min(p.armDepth, w - 100, d - 100);
    const x0 = -w / 2;
    const z0 = -d / 2;
    const parts: PartDraft[] = [
      boardPart({
        key: 'back-a',
        label: 'Back panel',
        role: 'back',
        material: m.back,
        thickness: BACK,
        x: [x0, w / 2],
        y: [0, h],
        z: [z0, z0 + BACK],
        grain: 'y',
      }),
      boardPart({
        key: 'back-b',
        label: 'Back panel',
        role: 'back',
        material: m.back,
        thickness: BACK,
        x: [x0, x0 + BACK],
        y: [0, h],
        z: [z0 + BACK, d / 2],
        grain: 'y',
      }),
      boardPart({
        key: 'end-a',
        label: 'Side panel',
        role: 'carcass',
        material: m.carcass,
        thickness: t,
        x: [w / 2 - t, w / 2],
        y: [0, h],
        z: [z0 + BACK, z0 + a],
        grain: 'y',
        banding: { front: true },
      }),
      boardPart({
        key: 'end-b',
        label: 'Side panel',
        role: 'carcass',
        material: m.carcass,
        thickness: t,
        x: [x0 + BACK, x0 + a],
        y: [0, h],
        z: [d / 2 - t, d / 2],
        grain: 'y',
        banding: { front: true },
      }),
    ];
    const n = Math.round(p.shelves);
    const gap = (h - 2 * t - n * t) / (n + 1);
    const levels: [string, string, number][] = [
      ['bottom', 'Bottom', 0],
      ...Array.from({ length: n }, (_, i): [string, string, number] => [
        `shelf-${i + 1}`,
        'Shelf',
        t + (i + 1) * gap + i * t,
      ]),
      ['top', 'Top', h - t],
    ];
    for (const [key, label, y] of levels) {
      parts.push(
        boardPart({
          key: `${key}-a`,
          label,
          role: label === 'Shelf' ? 'shelf' : 'carcass',
          material: m.carcass,
          thickness: t,
          x: [x0 + BACK, w / 2 - t],
          y: [y, y + t],
          z: [z0 + BACK, z0 + a],
          grain: 'x',
          banding: { front: true },
        }),
      );
      parts.push(
        boardPart({
          key: `${key}-b`,
          label,
          role: label === 'Shelf' ? 'shelf' : 'carcass',
          material: m.carcass,
          thickness: t,
          x: [x0 + BACK, x0 + a],
          y: [y, y + t],
          z: [z0 + a, d / 2 - t],
          grain: 'z',
          banding: { front: true },
        }),
      );
    }
    return parts;
  },
};
