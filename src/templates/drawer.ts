import type { TemplateDef } from '../types';
import { W, H, D, p } from './helpers';
import { HANDLE, drawerPanels, handleParam } from './hardware';

/** Drawer: front at +z, box behind it. Slides out 85 % of its box depth. */
export const drawer: TemplateDef = {
  id: 'drawer',
  name: 'Drawer',
  category: 'Fronts',
  description: 'Single drawer with front and box; place it inside a carcass.',
  tags: ['drawer', 'pull-out'],
  params: [W(764, 150, 1200), H(200, 80, 600), D(500, 200, 800), p('thickness', 'Thickness', 16, 8, 30), handleParam(HANDLE.bar)],
  build: ({ width: w, height: h, depth: d, thickness: t, handle }) =>
    drawerPanels({
      id: 'drawer', x0: -w / 2, y0: 0, w, h, frontZ0: d / 2 - t, frontT: t, handle,
      box: { x0: -w / 2 + 10, y0: 0, w: w - 20, h: Math.max(h - 40, t * 2), d: d - t, t },
    }),
};
