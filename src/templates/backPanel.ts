import type { TemplateDef } from '../types';
import { box, W, H, D } from './helpers';

export const backPanel: TemplateDef = {
  id: 'back-panel',
  name: 'Back panel',
  category: 'Panels',
  params: [W(800), H(2200), D(8)],
  build: ({ width: w, height: h, depth: d }) => [box('Back panel', 'back', -w / 2, 0, -d / 2, w, h, d)],
};
