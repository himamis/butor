import type { Panel, TemplateDef } from '../types';
import { box, W, H, D, p } from './helpers';
import { carcass } from './carcass';
import { carcassDoors, DOOR_T } from './carcassDoors';
import { variant } from './categories';
import { HANDLE, drawerPanels, handleParam, shiftPanels } from './hardware';

export const drawerUnit: TemplateDef = {
  id: 'drawer-unit',
  name: 'Drawer unit',
  category: 'Cabinets',
  description: 'Carcass with a stack of full-width drawers (chest of drawers).',
  tags: ['chest', 'drawers', 'dresser', 'commode'],
  params: [W(600, 300, 1200), H(800, 300, 1500), D(500, 350, 800), p('thickness', 'Thickness', 18, 12, 30), p('drawers', 'Drawers', 4, 1, 8), handleParam(HANDLE.bar)],
  build: ({ width: w, height: h, depth: d, thickness: t, drawers, handle }) => {
    const n = Math.round(drawers);
    const fh = (h - 4 - (n - 1) * 3) / n;
    const boxW = w - 2 * t - 26; // 13 mm runner space each side
    const boxD = d - DOOR_T - 8 - 20;
    const boxH = Math.max(20, fh - 50);
    const out: Panel[] = shiftPanels(carcass.build({ width: w, height: h, depth: d - DOOR_T, thickness: t, shelves: 0 }), 0, 0, -DOOR_T / 2);
    for (let i = 0; i < n; i++) {
      const y0 = 2 + i * (fh + 3);
      out.push(...drawerPanels({
        id: `drawer-${i}`, x0: -w / 2 + 2, y0, w: w - 4, h: fh, frontZ0: d / 2 - DOOR_T, frontT: DOOR_T, handle,
        box: { x0: -boxW / 2, y0: y0 + Math.min(25, (fh - boxH) / 2), w: boxW, h: boxH, d: boxD, t: 12 },
      }));
    }
    return out;
  },
};

export const cornerUnit: TemplateDef = {
  id: 'corner-unit',
  name: 'Corner shelving',
  category: 'Cabinets',
  description: 'L-shaped open shelving for an inside corner (back-left), sized by its two arms.',
  tags: ['corner', 'l-shape', 'angle', 'shelves', 'open'],
  params: [W(1200, 600, 2400), H(2200, 300, 3000), D(1200, 600, 2400), p('armDepth', 'Arm depth', 580, 250, 800), p('thickness', 'Thickness', 18, 12, 30), p('shelves', 'Shelves', 4, 0, 10)],
  build: ({ width: w, height: h, depth: d, armDepth, thickness: t, shelves }) => {
    const B = 8;
    const a = Math.min(armDepth, w - 100, d - 100);
    const x0 = -w / 2;
    const z0 = -d / 2;
    const out: Panel[] = [
      box('Back panel', 'back', x0, 0, z0, w, h, B),
      box('Back panel', 'back', x0, 0, z0 + B, B, h, d - B),
      box('Side panel', 'carcass', w / 2 - t, 0, z0 + B, t, h, a - B),
      box('Side panel', 'carcass', x0 + B, 0, d / 2 - t, a - B, h, t),
    ];
    const n = Math.round(shelves);
    const gap = (h - 2 * t - n * t) / (n + 1);
    const levels: [string, number][] = [['Bottom', 0], ...Array.from({ length: n }, (_, i): [string, number] => ['Shelf', t + (i + 1) * gap + i * t]), ['Top', h - t]];
    for (const [name, y] of levels) {
      out.push(box(name, 'carcass', x0 + B, y, z0 + B, w / 2 - t - (x0 + B), t, a - B));
      out.push(box(name, 'carcass', x0 + B, y, z0 + a, a - B, t, d / 2 - t - (z0 + a)));
    }
    return out;
  },
};

export const topCabinet = variant(carcassDoors, {
  id: 'top-cabinet',
  name: 'Top cabinet',
  description: 'Short cabinet with doors that sits on top of a wardrobe.',
  tags: ['overhead', 'top box', 'attic', 'storage', 'cupboard'],
  defaults: { height: 450, shelves: 0, handlePos: 2 },
});

export const shoeCabinet = variant(carcassDoors, {
  id: 'shoe-cabinet',
  name: 'Shoe cabinet',
  description: 'Shallow cabinet with doors and closely spaced shelves for shoes.',
  tags: ['shoe', 'hallway', 'entrance', 'boots'],
  defaults: { width: 800, height: 1000, depth: 350, shelves: 4 },
});

export const openShelving = variant(carcass, {
  id: 'open-shelving',
  name: 'Open shelving',
  description: 'Shallow open carcass with many shelves, like a bookcase.',
  tags: ['bookcase', 'bookshelf', 'shelves', 'display'],
  defaults: { height: 2000, depth: 350, shelves: 5 },
});
