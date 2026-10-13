import { z } from 'zod';
import { choice, layoutColumns, mm, type PartDraft, type UnitLayout, type UnitTemplate } from '../../core';
import { boardPart } from '../builders/board';

export const TRACK_DEPTH = 80; // depth reserved at the front for sliding-door tracks
const GROOVE_INSET = 10; // a grooved back sits this far in from the rear edge

const params = z.object({
  thickness: mm({ label: 'Board', min: 12, max: 30, default: 18 }),
  back: choice({
    label: 'Back',
    options: { grooved: 'Grooved', nailed: 'Nailed on', none: 'None' },
    default: 'grooved',
  }),
  backThickness: mm({ label: 'Back board', min: 3, max: 19, default: 8 }),
  base: choice({ label: 'Base', options: { none: 'None', plinth: 'Plinth' }, default: 'none' }),
  plinthHeight: mm({ label: 'Plinth height', min: 50, max: 200, default: 100 }),
  plinthRecess: mm({ label: 'Plinth recess', min: 0, max: 100, default: 40 }),
});
type P = z.infer<typeof params>;

const num = (p: Record<string, unknown>) => p as unknown as P;

function geometry(p: P, size: { w: number; h: number; d: number }, trackFronts: boolean) {
  const t = p.thickness;
  const base = p.base === 'plinth' ? p.plinthHeight : 0;
  const backDepth = p.back === 'none' ? 0 : p.back === 'grooved' ? GROOVE_INSET + p.backThickness : p.backThickness;
  const front = trackFronts ? size.d / 2 - TRACK_DEPTH : size.d / 2;
  return { t, base, backDepth, front };
}

/** A carcass: two sides, top and bottom between them, dividers between columns, a back and an optional plinth. */
export const standardUnit: UnitTemplate = {
  id: 'unit.standard',
  kind: 'unit',
  name: 'Unit',
  category: 'Cabinets',
  description: 'Carcass with columns, a back and an optional plinth — the frame of wardrobes and cabinets.',
  tags: ['carcass', 'cabinet', 'frame', 'box', 'wardrobe'],
  params,
  minColumnWidth: 150,
  sizeLimits: { w: [200, 3000], h: [300, 3000], d: [200, 1000] },
  defaultSize: { w: 1000, h: 2200, d: 600 },

  layout(unit, hints): UnitLayout | { error: string } {
    const p = num(unit.params);
    const { w, h, d } = unit.size;
    const g = geometry(p, unit.size, hints.trackFronts);
    const innerH = h - g.base - 2 * g.t;
    if (innerH < 100) return { error: `the unit is too low for its base and boards (${Math.round(innerH)} mm inside)` };
    if (g.front - (-d / 2 + g.backDepth) < 100)
      return { error: 'the unit is too shallow for its back and sliding-door tracks' };
    const cols = layoutColumns({
      innerW: w - 2 * g.t,
      x0: -w / 2 + g.t,
      divider: g.t,
      minWidth: 150,
      columns: unit.columns,
    });
    if ('error' in cols) return cols;
    return {
      inner: { w: w - 2 * g.t, h: innerH, d: g.front - (-d / 2 + g.backDepth) },
      floorY: g.base + g.t,
      innerZ: [-d / 2 + g.backDepth, g.front],
      columns: cols.columns,
      dividerThickness: g.t,
      ...(hints.trackFronts ? { trackZone: [d / 2 - TRACK_DEPTH, d / 2] as [number, number] } : {}),
    };
  },

  build(unit, layout, m): PartDraft[] {
    const p = num(unit.params);
    const { w, h, d } = unit.size;
    const t = layout.dividerThickness;
    const base = layout.floorY - t;
    const nailed = p.back === 'nailed';
    const zBack = nailed ? -d / 2 + p.backThickness : -d / 2; // carcass boards start in front of a nailed-on back
    const xi: [number, number] = [-w / 2 + t, w / 2 - t];
    const parts: PartDraft[] = [
      boardPart({
        key: 'side-left',
        label: 'Side panel',
        role: 'carcass',
        material: m.carcass,
        thickness: t,
        x: [-w / 2, -w / 2 + t],
        y: [base, h],
        z: [zBack, d / 2],
        grain: 'y',
        banding: { front: true },
      }),
      boardPart({
        key: 'side-right',
        label: 'Side panel',
        role: 'carcass',
        material: m.carcass,
        thickness: t,
        x: [w / 2 - t, w / 2],
        y: [base, h],
        z: [zBack, d / 2],
        grain: 'y',
        banding: { front: true },
      }),
      boardPart({
        key: 'bottom',
        label: 'Bottom',
        role: 'carcass',
        material: m.carcass,
        thickness: t,
        x: xi,
        y: [base, base + t],
        z: [zBack, d / 2],
        grain: 'x',
        banding: { front: true },
      }),
      boardPart({
        key: 'top',
        label: 'Top',
        role: 'carcass',
        material: m.carcass,
        thickness: t,
        x: xi,
        y: [h - t, h],
        z: [zBack, d / 2],
        grain: 'x',
        banding: { front: true },
      }),
    ];
    layout.columns.slice(1).forEach((c, i) => {
      // Dividers stop at the interior's front edge, leaving any sliding-door track zone free.
      parts.push(
        boardPart({
          key: `divider-${i + 1}`,
          label: 'Divider',
          role: 'divider',
          material: m.carcass,
          thickness: t,
          x: [c.x0 - t, c.x0],
          y: [base + t, h - t],
          z: [layout.innerZ[0], layout.innerZ[1]],
          grain: 'y',
          banding: { front: true },
        }),
      );
    });
    if (p.back !== 'none') {
      const z0 = nailed ? -d / 2 : -d / 2 + GROOVE_INSET;
      parts.push(
        boardPart({
          key: 'back',
          label: 'Back panel',
          role: 'back',
          material: m.back,
          thickness: p.backThickness,
          x: nailed ? [-w / 2, w / 2] : xi,
          y: nailed ? [base, h] : [base + t, h - t],
          z: [z0, z0 + p.backThickness],
          grain: 'y',
        }),
      );
    }
    if (base > 0) {
      // Back rail at the very back; the recessed front board always stays in front of it.
      const fz = Math.max(d / 2 - p.plinthRecess, zBack + 2 * t);
      parts.push(
        boardPart({
          key: 'plinth-front',
          label: 'Plinth',
          role: 'trim',
          material: m.carcass,
          thickness: t,
          x: [-w / 2, w / 2],
          y: [0, base],
          z: [fz - t, fz],
          grain: 'x',
          banding: { front: true },
        }),
      );
      parts.push(
        boardPart({
          key: 'plinth-back',
          label: 'Plinth rail',
          role: 'trim',
          material: m.carcass,
          thickness: t,
          x: [-w / 2, w / 2],
          y: [0, base],
          z: [zBack, zBack + t],
          grain: 'x',
        }),
      );
    }
    return parts;
  },
};
