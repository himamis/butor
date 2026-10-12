import type { Panel, TemplateDef } from '../types';
import { box, W, H, D, p } from './helpers';
import { carcass } from './carcass';
import { DOOR_T } from './carcassDoors';
import { HANDLE, doorSet, doorsParam, handleInsetParam, handleParam, handlePosParam, openAngleParam, shiftPanels, slidingDoor } from './hardware';

const BACK = 8;
const SHELF_DROP = 350; // top shelf sits this far below the top
const RAIL_D = 30;

/** Top shelf with a hanging rail under it, across [x0, x0 + w] inside a body whose interior spans z0..z1. */
function hangingSpace(x0: number, w: number, h: number, t: number, z0: number, z1: number): Panel[] {
  const y = h - SHELF_DROP;
  const zc = (z0 + z1) / 2;
  return [
    box('Top shelf', 'carcass', x0, y, z0, w, t, z1 - z0),
    { ...box('Hanging rail', 'rail', x0, y - 60 - RAIL_D / 2, zc - RAIL_D / 2, w, RAIL_D, RAIL_D), shape: 'cylinder' },
  ];
}

export const wardrobe: TemplateDef = {
  id: 'wardrobe',
  name: 'Hinged wardrobe',
  category: 'Wardrobes',
  description: 'Wardrobe with top shelf, hanging rail and one or two hinged doors.',
  tags: ['closet', 'armoire', 'hanging', 'clothes', 'doors'],
  params: [
    W(1000, 400, 2400), H(2200, 1200, 3000), D(600, 400, 800), p('thickness', 'Thickness', 18, 12, 30),
    doorsParam(), openAngleParam(), handleParam(HANDLE.bar), handlePosParam(), handleInsetParam(),
  ],
  build: ({ width: w, height: h, depth: d, thickness: t, doors, openAngle, handle, handlePos, handleInset }) => {
    const bodyD = d - DOOR_T;
    return [
      ...shiftPanels(carcass.build({ width: w, height: h, depth: bodyD, thickness: t, shelves: 0 }), 0, 0, -DOOR_T / 2),
      ...hangingSpace(-w / 2 + t, w - 2 * t, h, t, -d / 2 + BACK, d / 2 - DOOR_T),
      ...doorSet({ w, h, z0: d / 2 - DOOR_T, t: DOOR_T, doors, openAngle, handle, handlePos, handleInset }),
    ];
  },
};

const TRACK = 70; // depth reserved in front of the body for two door tracks
const OVERLAP = 50; // sliding doors overlap in the middle

export const slidingWardrobe: TemplateDef = {
  id: 'sliding-wardrobe',
  name: 'Sliding-door wardrobe',
  category: 'Wardrobes',
  description: 'Two sliding doors on tracks; hanging space on the left, shelves on the right.',
  tags: ['closet', 'sliding', 'door', 'hanging', 'clothes', 'built-in'],
  params: [W(1800, 1000, 3600), H(2300, 1500, 3000), D(650, 500, 900), p('thickness', 'Thickness', 18, 12, 30), handleParam(HANDLE.cutout)],
  build: ({ width: w, height: h, depth: d, thickness: t, handle }) => {
    const bodyD = d - TRACK;
    const iz0 = -d / 2 + BACK;
    const iz1 = d / 2 - TRACK;
    const half = w / 2 - t - t / 2; // interior width of each half
    const n = 4;
    const gap = (h - 2 * t - n * t) / (n + 1);
    const dw = (w + OVERLAP) / 2;
    return [
      ...shiftPanels(carcass.build({ width: w, height: h, depth: bodyD, thickness: t, shelves: 0 }), 0, 0, -TRACK / 2),
      box('Divider', 'carcass', -t / 2, t, iz0, t, h - 2 * t, iz1 - iz0),
      ...hangingSpace(-w / 2 + t, half, h, t, iz0, iz1),
      ...Array.from({ length: n }, (_, i) => box('Shelf', 'carcass', t / 2, t + (i + 1) * gap + i * t, iz0, half, t, iz1 - iz0)),
      // Back track: the left door slides right behind the front one. Front track: the right door is fixed.
      ...slidingDoor({ id: 'slide-left', x0: -w / 2, y0: 2, z0: d / 2 - TRACK + 12, w: dw, h: h - 4, t: DOOR_T, dir: 1, travel: dw - OVERLAP, handle }),
      ...slidingDoor({ id: 'slide-right', x0: w / 2 - dw, y0: 2, z0: d / 2 - DOOR_T - 2, w: dw, h: h - 4, t: DOOR_T, dir: -1, travel: 0, handle, moves: false }),
    ];
  },
};
