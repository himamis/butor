import { z } from 'zod';
import { mm, type PartDraft, type PartTemplate } from '../../core';
import { boardPart } from '../builders/board';

/* Free parts stand in the room on their own: centred on x/z, bottom at y = 0. */

const n = (v: unknown) => Number(v);
const thickness = (def = 18) => mm({ label: 'Thickness', min: 4, max: 40, default: def });

export const panel: PartTemplate = {
  id: 'part.panel',
  version: 1,
  kind: 'part',
  name: 'Panel',
  category: 'Panels',
  description: 'Upright board facing the front — a back, a screen or a wall panel.',
  tags: ['board', 'panel', 'upright'],
  params: z.object({
    width: mm({ label: 'Width', min: 10, max: 3000, default: 600 }),
    height: mm({ label: 'Height', min: 10, max: 3000, default: 720 }),
    thickness: thickness(),
  }),
  size: (p) => ({ w: n(p.width), h: n(p.height), d: n(p.thickness) }),
  build: (p, m) => [
    boardPart({
      key: 'panel',
      label: 'Panel',
      role: 'carcass',
      material: m.carcass,
      thickness: n(p.thickness),
      x: [-n(p.width) / 2, n(p.width) / 2],
      y: [0, n(p.height)],
      z: [-n(p.thickness) / 2, n(p.thickness) / 2],
      grain: 'y',
      banding: { left: true, right: true, top: true },
    }),
  ],
};

export const looseShelf: PartTemplate = {
  id: 'part.shelf',
  version: 1,
  kind: 'part',
  name: 'Loose shelf',
  category: 'Panels',
  description: 'Horizontal board — a loose shelf, a top or a bottom.',
  tags: ['shelf', 'board', 'top', 'bottom', 'horizontal'],
  params: z.object({
    width: mm({ label: 'Width', min: 10, max: 3000, default: 800 }),
    depth: mm({ label: 'Depth', min: 10, max: 1500, default: 580 }),
    thickness: thickness(),
  }),
  size: (p) => ({ w: n(p.width), h: n(p.thickness), d: n(p.depth) }),
  build: (p, m) => [
    boardPart({
      key: 'shelf',
      label: 'Shelf',
      role: 'shelf',
      material: m.carcass,
      thickness: n(p.thickness),
      x: [-n(p.width) / 2, n(p.width) / 2],
      y: [0, n(p.thickness)],
      z: [-n(p.depth) / 2, n(p.depth) / 2],
      grain: 'x',
      banding: { front: true },
    }),
  ],
};

export const endPanel: PartTemplate = {
  id: 'part.end-panel',
  version: 1,
  kind: 'part',
  name: 'End panel',
  category: 'Panels',
  description: 'Vertical side board — an end panel or a free-standing divider.',
  tags: ['side', 'gable', 'divider', 'partition', 'end'],
  params: z.object({
    height: mm({ label: 'Height', min: 10, max: 3000, default: 2200 }),
    depth: mm({ label: 'Depth', min: 10, max: 1500, default: 600 }),
    thickness: thickness(),
  }),
  size: (p) => ({ w: n(p.thickness), h: n(p.height), d: n(p.depth) }),
  build: (p, m) => [
    boardPart({
      key: 'panel',
      label: 'End panel',
      role: 'carcass',
      material: m.carcass,
      thickness: n(p.thickness),
      x: [-n(p.thickness) / 2, n(p.thickness) / 2],
      y: [0, n(p.height)],
      z: [-n(p.depth) / 2, n(p.depth) / 2],
      grain: 'y',
      banding: { front: true, top: true },
    }),
  ],
};

export const filler: PartTemplate = {
  id: 'part.filler',
  version: 1,
  kind: 'part',
  name: 'Filler strip',
  category: 'Panels',
  description: 'Narrow front strip that closes the gap between a unit and a wall.',
  tags: ['filler', 'scribe', 'gap', 'strip', 'wall'],
  params: z.object({
    width: mm({ label: 'Width', min: 10, max: 300, default: 50 }),
    height: mm({ label: 'Height', min: 100, max: 3000, default: 2200 }),
    thickness: thickness(),
  }),
  size: (p) => ({ w: n(p.width), h: n(p.height), d: n(p.thickness) }),
  build: (p, m) => [
    boardPart({
      key: 'filler',
      label: 'Filler strip',
      role: 'trim',
      material: m.front,
      thickness: n(p.thickness),
      x: [-n(p.width) / 2, n(p.width) / 2],
      y: [0, n(p.height)],
      z: [-n(p.thickness) / 2, n(p.thickness) / 2],
      grain: 'y',
      banding: { left: true, right: true },
    }),
  ],
};

export const backPanel: PartTemplate = {
  id: 'part.back-panel',
  version: 1,
  kind: 'part',
  name: 'Back panel',
  category: 'Panels',
  description: 'Thin board that closes the back of a unit.',
  tags: ['back', 'hardboard', 'board'],
  params: z.object({
    width: mm({ label: 'Width', min: 10, max: 3000, default: 800 }),
    height: mm({ label: 'Height', min: 10, max: 3000, default: 2200 }),
    thickness: thickness(8),
  }),
  size: (p) => ({ w: n(p.width), h: n(p.height), d: n(p.thickness) }),
  build: (p, m) => [
    boardPart({
      key: 'back',
      label: 'Back panel',
      role: 'back',
      material: m.back,
      thickness: n(p.thickness),
      x: [-n(p.width) / 2, n(p.width) / 2],
      y: [0, n(p.height)],
      z: [-n(p.thickness) / 2, n(p.thickness) / 2],
      grain: 'y',
    }),
  ],
};

export const plinth: PartTemplate = {
  id: 'part.plinth',
  version: 1,
  kind: 'part',
  name: 'Plinth base',
  category: 'Base & trim',
  description: 'Kickboard frame that lifts units off the floor.',
  tags: ['kickboard', 'base', 'socle', 'toe kick', 'skirting'],
  params: z.object({
    width: mm({ label: 'Width', min: 200, max: 3000, default: 800 }),
    height: mm({ label: 'Height', min: 50, max: 250, default: 100 }),
    depth: mm({ label: 'Depth', min: 200, max: 900, default: 560 }),
  }),
  size: (p) => ({ w: n(p.width), h: n(p.height), d: n(p.depth) }),
  build(p, m) {
    const [w, h, d] = [n(p.width), n(p.height), n(p.depth)];
    const t = 18;
    const b = (key: string, label: string, x: [number, number], z: [number, number], grain: 'x' | 'z'): PartDraft =>
      boardPart({
        key,
        label,
        role: 'trim',
        material: m.carcass,
        thickness: t,
        x,
        y: [0, h],
        z,
        grain,
        banding: key === 'front' ? { front: true } : undefined,
      });
    return [
      b('front', 'Plinth front', [-w / 2, w / 2], [d / 2 - t, d / 2], 'x'),
      b('back', 'Plinth back', [-w / 2, w / 2], [-d / 2, -d / 2 + t], 'x'),
      b('left', 'Plinth side', [-w / 2, -w / 2 + t], [-d / 2 + t, d / 2 - t], 'z'),
      b('right', 'Plinth side', [w / 2 - t, w / 2], [-d / 2 + t, d / 2 - t], 'z'),
    ];
  },
};

export const cornice: PartTemplate = {
  id: 'part.cornice',
  version: 1,
  kind: 'part',
  name: 'Cornice',
  category: 'Base & trim',
  description: 'Top cover with a front fascia to finish the top of a wardrobe.',
  tags: ['crown', 'top cover', 'trim', 'fascia', 'moulding'],
  params: z.object({
    width: mm({ label: 'Width', min: 200, max: 3000, default: 1020 }),
    height: mm({ label: 'Height', min: 25, max: 200, default: 60 }),
    depth: mm({ label: 'Depth', min: 100, max: 900, default: 620 }),
  }),
  size: (p) => ({ w: n(p.width), h: n(p.height), d: n(p.depth) }),
  build(p, m) {
    const [w, h, d] = [n(p.width), n(p.height), n(p.depth)];
    return [
      boardPart({
        key: 'top',
        label: 'Cornice top',
        role: 'trim',
        material: m.front,
        thickness: 18,
        x: [-w / 2, w / 2],
        y: [h - 18, h],
        z: [-d / 2, d / 2],
        grain: 'x',
        banding: { front: true, left: true, right: true },
      }),
      boardPart({
        key: 'fascia',
        label: 'Cornice fascia',
        role: 'trim',
        material: m.front,
        thickness: 18,
        x: [-w / 2, w / 2],
        y: [0, h - 18],
        z: [d / 2 - 18, d / 2],
        grain: 'x',
        banding: { bottom: true, left: true, right: true },
      }),
    ];
  },
};

export const lightStrip: PartTemplate = {
  id: 'part.light-strip',
  version: 1,
  kind: 'part',
  name: 'LED strip',
  category: 'Base & trim',
  description: 'Light strip in an aluminium profile, e.g. under a top shelf.',
  tags: ['light', 'led', 'lamp', 'strip'],
  params: z.object({ length: mm({ label: 'Length', min: 100, max: 3000, default: 1000 }) }),
  size: (p) => ({ w: n(p.length), h: 8, d: 16 }),
  build: (p, m) => [
    boardPart({
      key: 'strip',
      label: 'LED strip',
      role: 'hardware',
      material: m.handle,
      x: [-n(p.length) / 2, n(p.length) / 2],
      y: [0, 8],
      z: [-8, 8],
      hardware: { name: `LED strip ${n(p.length)} mm` },
    }),
  ],
};

export const wallRail: PartTemplate = {
  id: 'part.wall-rail',
  version: 1,
  kind: 'part',
  name: 'Wall-mounting rail',
  category: 'Base & trim',
  description: 'Rail screwed to the wall that wall-hung units hook onto.',
  tags: ['wall', 'mount', 'rail', 'suspension', 'hanging'],
  params: z.object({ length: mm({ label: 'Length', min: 200, max: 3000, default: 1000 }) }),
  size: (p) => ({ w: n(p.length), h: 40, d: 12 }),
  build: (p, m) => [
    boardPart({
      key: 'rail',
      label: 'Wall rail',
      role: 'hardware',
      material: m.handle,
      x: [-n(p.length) / 2, n(p.length) / 2],
      y: [0, 40],
      z: [-6, 6],
      hardware: { name: `Wall-mounting rail ${n(p.length)} mm` },
    }),
  ],
};

export const PARTS: PartTemplate[] = [
  panel,
  looseShelf,
  endPanel,
  filler,
  backPanel,
  plinth,
  cornice,
  lightStrip,
  wallRail,
];
