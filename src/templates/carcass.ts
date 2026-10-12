import type { Panel, TemplateDef } from '../types';
import { box, W, H, D, p } from './helpers';

const BACK = 8;

/** Open box: two sides, top, bottom, back, N evenly spaced shelves. */
export const carcass: TemplateDef = {
  id: 'carcass',
  name: 'Carcass',
  category: 'Cabinets',
  description: 'Open box with sides, top, bottom, back and adjustable shelves.',
  tags: ['box', 'cabinet', 'shelves', 'open'],
  params: [W(800, 100, 2400), H(2200, 200, 3000), D(580, 100, 1000), p('thickness', 'Thickness', 18, 8, 40), p('shelves', 'Shelves', 3, 0, 10)],
  build: ({ width: w, height: h, depth: d, thickness: t, shelves }) => {
    const x0 = -w / 2;
    const z0 = -d / 2;
    const innerW = w - 2 * t;
    const innerD = d - BACK;
    const out: Panel[] = [
      box('Side panel', 'carcass', x0, 0, z0, t, h, d),
      box('Side panel', 'carcass', x0 + w - t, 0, z0, t, h, d),
      box('Top', 'carcass', x0 + t, h - t, z0 + BACK, innerW, t, innerD),
      box('Bottom', 'carcass', x0 + t, 0, z0 + BACK, innerW, t, innerD),
      box('Back panel', 'back', x0 + t, t, z0, innerW, h - 2 * t, BACK),
    ];
    const n = Math.round(shelves);
    const gap = (h - 2 * t - n * t) / (n + 1);
    for (let i = 1; i <= n; i++) {
      out.push(box('Shelf', 'carcass', x0 + t, t + i * gap + (i - 1) * t, z0 + BACK, innerW, t, innerD));
    }
    return out;
  },
};
