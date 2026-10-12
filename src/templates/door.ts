import type { TemplateDef } from '../types';
import { box, W, H, D } from './helpers';

export const door: TemplateDef = {
  id: 'door',
  name: 'Door',
  category: 'Fronts',
  params: [W(400, 100, 1200), H(2190, 100, 3000), D(18, 8, 40)],
  build: ({ width: w, height: h, depth: d }) => [box('Door', 'door', -w / 2, 0, -d / 2, w, h, d)],
};
