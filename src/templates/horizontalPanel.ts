import type { TemplateDef } from '../types';
import { box, W, H, D } from './helpers';

export const horizontalPanel: TemplateDef = {
  id: 'horizontal-panel',
  name: 'Shelf / top / bottom',
  category: 'Panels',
  description: 'Horizontal board for a shelf, top or bottom.',
  tags: ['shelf', 'board', 'top', 'bottom'],
  params: [W(800), H(18), D(580)],
  build: ({ width: w, height: h, depth: d }) => [box('Horizontal panel', 'carcass', -w / 2, 0, -d / 2, w, h, d)],
};
