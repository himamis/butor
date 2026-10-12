import type { Panel, PanelRole, ParamDef } from '../types';

/** Box panel from min corner (x0, y0, z0) and size, in object-local mm. */
export function box(
  name: string,
  role: PanelRole,
  x0: number, y0: number, z0: number,
  w: number, h: number, d: number,
): Panel {
  return {
    name, role,
    pos: { x: x0 + w / 2, y: y0 + h / 2, z: z0 + d / 2 },
    size: { x: w, y: h, z: d },
  };
}

export const p = (key: string, label: string, def: number, min: number, max: number, step = 1): ParamDef =>
  ({ key, label, default: def, min, max, step });

export const W = (def: number, min = 1, max = 5000) => p('width', 'Width', def, min, max);
export const H = (def: number, min = 1, max = 3500) => p('height', 'Height', def, min, max);
export const D = (def: number, min = 1, max = 1500) => p('depth', 'Depth', def, min, max);
