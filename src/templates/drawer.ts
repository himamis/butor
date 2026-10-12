import type { Motion, TemplateDef } from '../types';
import { box, W, H, D, p } from './helpers';
import { HANDLE, frontWithHandle, handleParam } from './hardware';

/** Drawer: front at +z, box behind it. Slides out 85 % of its box depth. */
export const drawer: TemplateDef = {
  id: 'drawer',
  name: 'Drawer',
  category: 'Fronts',
  params: [W(764, 150, 1200), H(200, 80, 600), D(500, 200, 800), p('thickness', 'Thickness', 16, 8, 30), handleParam(HANDLE.bar)],
  build: ({ width: w, height: h, depth: d, thickness: t, handle }) => {
    const z0 = -d / 2;
    const boxD = d - t; // depth behind the front
    const boxH = Math.max(h - 40, t * 2);
    const inset = 10; // box is narrower than the front
    const bx = -w / 2 + inset;
    const bw = w - inset * 2;
    const motion: Motion = { id: 'drawer', kind: 'slide', offset: { x: 0, y: 0, z: boxD * 0.85 } };
    const m = <T extends object>(panel: T) => ({ ...panel, motion });
    const hy = handle === HANDLE.cutout ? h : h / 2; // notch sits in the top edge
    return [
      ...frontWithHandle({ name: 'Drawer front', x0: -w / 2, y0: 0, z0: d / 2 - t, w, h, t, handle, hx: 0, hy, horizontal: true, motion }),
      m(box('Drawer side', 'drawer', bx, 0, z0, t, boxH, boxD)),
      m(box('Drawer side', 'drawer', bx + bw - t, 0, z0, t, boxH, boxD)),
      m(box('Drawer back', 'drawer', bx + t, 0, z0, bw - 2 * t, boxH, t)),
      m(box('Drawer bottom', 'drawer', bx + t, 0, z0 + t, bw - 2 * t, t, boxD - t)),
    ];
  },
};
