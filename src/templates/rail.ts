import type { TemplateDef } from '../types';
import { box, W, H, D } from './helpers';

export const rail: TemplateDef = {
  id: 'rail',
  name: 'Hanging rail',
  category: 'Interior',
  params: [W(760, 100, 3000), H(30, 10, 60), D(30, 10, 60)],
  build: ({ width: w, height: h, depth: d }) => [
    { ...box('Hanging rail', 'rail', -w / 2, 0, -d / 2, w, h, d), shape: 'cylinder' },
  ],
};
