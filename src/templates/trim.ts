import type { TemplateDef } from '../types';
import { box, W, H, D, p } from './helpers';

export const plinth: TemplateDef = {
  id: 'plinth',
  name: 'Plinth base',
  category: 'Base & trim',
  description: 'Kickboard frame that lifts a unit off the floor.',
  tags: ['kickboard', 'base', 'socle', 'toe kick', 'skirting'],
  params: [W(800, 200, 3000), H(100, 50, 250), D(560, 200, 900)],
  build: ({ width: w, height: h, depth: d }) => [
    box('Plinth front', 'carcass', -w / 2, 0, d / 2 - 18, w, h, 18),
    box('Plinth back', 'carcass', -w / 2, 0, -d / 2, w, h, 18),
    box('Plinth side', 'carcass', -w / 2, 0, -d / 2 + 18, 18, h, d - 36),
    box('Plinth side', 'carcass', w / 2 - 18, 0, -d / 2 + 18, 18, h, d - 36),
  ],
};

export const cornice: TemplateDef = {
  id: 'cornice',
  name: 'Cornice',
  category: 'Base & trim',
  description: 'Top cover with a front fascia to finish the top of a wardrobe.',
  tags: ['crown', 'top cover', 'trim', 'fascia', 'moulding'],
  params: [W(820, 200, 3000), H(60, 25, 200), D(600, 100, 900)],
  build: ({ width: w, height: h, depth: d }) => [
    box('Cornice top', 'carcass', -w / 2, h - 18, -d / 2, w, 18, d),
    box('Cornice fascia', 'carcass', -w / 2, 0, d / 2 - 18, w, h - 18, 18),
  ],
};

export const filler: TemplateDef = {
  id: 'filler',
  name: 'Filler strip',
  category: 'Panels',
  description: 'Narrow front strip that closes the gap between a unit and a wall.',
  tags: ['filler', 'scribe', 'gap', 'strip', 'wall'],
  params: [W(50, 10, 300), H(2200, 100, 3000), p('depth', 'Thickness', 18, 8, 40)],
  build: ({ width: w, height: h, depth: d }) => [box('Filler strip', 'carcass', -w / 2, 0, -d / 2, w, h, d)],
};
