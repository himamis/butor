import type { Motion, Panel, TemplateDef } from '../types';
import { box, W, H, D, p } from './helpers';
import { HANDLE, drawerPanels, handleParam } from './hardware';

export const shelfRail: TemplateDef = {
  id: 'shelf-rail',
  name: 'Shelf with rail',
  category: 'Interior',
  description: 'Shelf with a hanging rail underneath, to fit between two sides.',
  tags: ['hanging', 'clothes', 'rod', 'closet', 'shelf'],
  params: [W(764, 200, 2400), H(100, 70, 300), D(560, 200, 800)],
  build: ({ width: w, height: h, depth: d }) => [
    box('Shelf', 'carcass', -w / 2, h - 18, -d / 2, w, 18, d),
    { ...box('Hanging rail', 'rail', -w / 2 + 10, Math.max(0, h - 18 - 55), -12.5, w - 20, 25, 25), shape: 'cylinder' },
  ],
};

export const innerDrawers: TemplateDef = {
  id: 'inner-drawers',
  name: 'Interior drawer stack',
  category: 'Interior',
  description: 'Stack of drawers with grip notches, for inside a wardrobe.',
  tags: ['drawers', 'internal', 'hidden', 'pull-out'],
  params: [W(764, 300, 1200), H(600, 150, 1200), D(520, 300, 800), p('drawers', 'Drawers', 3, 1, 6), handleParam(HANDLE.cutout)],
  build: ({ width: w, height: h, depth: d, drawers, handle }) => {
    const n = Math.round(drawers);
    const T = 16;
    const fh = (h - (n - 1) * 4) / n;
    const boxH = Math.max(20, fh - 30);
    return Array.from({ length: n }, (_, i) => {
      const y0 = i * (fh + 4);
      return drawerPanels({
        id: `drawer-${i}`, x0: -w / 2, y0, w, h: fh, frontZ0: d / 2 - T, frontT: T, handle,
        box: { x0: -w / 2 + 10, y0: y0 + Math.min(10, (fh - boxH) / 2), w: w - 20, h: boxH, d: d - T, t: 12 },
      });
    }).flat();
  },
};

const slideOut = (id: string, d: number): Motion => ({ id, kind: 'slide', offset: { x: 0, y: 0, z: d * 0.8 } });

export const pullOutBasket: TemplateDef = {
  id: 'pull-out-basket',
  name: 'Pull-out wire basket',
  category: 'Interior',
  description: 'Metal wire basket on runners for clothes, scarves or accessories.',
  tags: ['basket', 'wire', 'pull-out', 'accessories'],
  params: [W(764, 300, 1200), H(180, 80, 400), D(500, 300, 700)],
  build: ({ width: w, height: h, depth: d }) => {
    const motion = slideOut('basket', d);
    const R = 8;
    const parts: Panel[] = [
      { ...box('Basket base', 'hardware', -w / 2, 0, -d / 2, w, 4, d), hardware: `Wire basket ${w}×${d} mm` },
      box('Basket rim', 'hardware', -w / 2, h - R, d / 2 - R, w, R, R),
      box('Basket rim', 'hardware', -w / 2, h - R, -d / 2, w, R, R),
      box('Basket rim', 'hardware', -w / 2, h - R, -d / 2 + R, R, R, d - 2 * R),
      box('Basket rim', 'hardware', w / 2 - R, h - R, -d / 2 + R, R, R, d - 2 * R),
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => box('Basket post', 'hardware', sx < 0 ? -w / 2 : w / 2 - R, 4, sz < 0 ? -d / 2 : d / 2 - R, R, h - 4 - R, R))),
    ];
    return parts.map((pn) => ({ ...pn, motion }));
  },
};

export const trouserRack: TemplateDef = {
  id: 'trouser-rack',
  name: 'Pull-out trouser rack',
  category: 'Interior',
  description: 'Pull-out frame with bars for hanging trousers flat.',
  tags: ['trousers', 'pants', 'hanger', 'pull-out', 'bars'],
  params: [W(764, 300, 1200), H(100, 60, 200), D(500, 300, 700), p('bars', 'Bars', 8, 3, 15)],
  build: ({ width: w, height: h, depth: d, bars }) => {
    const motion = slideOut('rack', d);
    const n = Math.round(bars);
    const step = (d - 40) / (n - 1);
    const parts: Panel[] = [
      { ...box('Trouser rack runner', 'hardware', -w / 2, 0, -d / 2, 20, h, d), hardware: 'Trouser rack runner' },
      { ...box('Trouser rack runner', 'hardware', w / 2 - 20, 0, -d / 2, 20, h, d), hardware: 'Trouser rack runner' },
      ...Array.from({ length: n }, (_, i): Panel => ({ ...box('Trouser bar', 'hardware', -w / 2 + 20, h - 12, -d / 2 + 20 + i * step - 6, w - 40, 12, 12), shape: 'cylinder' })),
    ];
    return parts.map((pn) => ({ ...pn, motion }));
  },
};

export const shoeShelf: TemplateDef = {
  id: 'shoe-shelf',
  name: 'Shoe shelf',
  category: 'Interior',
  description: 'Shelf with a front lip so shoes do not slide off.',
  tags: ['shoe', 'boots', 'lip', 'shelf'],
  params: [W(764, 200, 2400), H(60, 30, 150), D(350, 200, 600)],
  build: ({ width: w, height: h, depth: d }) => [
    box('Shoe shelf', 'carcass', -w / 2, 0, -d / 2, w, 18, d),
    box('Shoe shelf lip', 'carcass', -w / 2, 18, d / 2 - 18, w, h - 18, 18),
  ],
};
