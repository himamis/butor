import type { TemplateDef } from '../types';
import { box, W, H, D } from './helpers';

export const backPanel: TemplateDef = {
  id: 'back-panel',
  name: 'Back panel',
  category: 'Panels',
  description: 'Thin board that closes the back of a unit.',
  tags: ['back', 'hardboard', 'board'],
  params: [W(800), H(2200), D(8)],
  build: ({ width: w, height: h, depth: d }) => [box('Back panel', 'back', -w / 2, 0, -d / 2, w, h, d)],
};
