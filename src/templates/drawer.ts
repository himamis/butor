import type { TemplateDef } from '../types';
import { box, W, H, D, p } from './helpers';

/** Drawer: front at +z, box behind it. */
export const drawer: TemplateDef = {
  id: 'drawer',
  name: 'Drawer',
  category: 'Fronts',
  params: [W(764, 150, 1200), H(200, 80, 600), D(500, 200, 800), p('thickness', 'Thickness', 16, 8, 30)],
  build: ({ width: w, height: h, depth: d, thickness: t }) => {
    const z0 = -d / 2;
    const boxD = d - t; // depth behind the front
    const boxH = Math.max(h - 40, t * 2);
    const inset = 10; // box is narrower than the front
    const bx = -w / 2 + inset;
    const bw = w - inset * 2;
    return [
      box('Drawer front', 'door', -w / 2, 0, d / 2 - t, w, h, t),
      box('Drawer side', 'drawer', bx, 0, z0, t, boxH, boxD),
      box('Drawer side', 'drawer', bx + bw - t, 0, z0, t, boxH, boxD),
      box('Drawer back', 'drawer', bx + t, 0, z0, bw - 2 * t, boxH, t),
      box('Drawer bottom', 'drawer', bx + t, 0, z0 + t, bw - 2 * t, t, boxD - t),
    ];
  },
};
