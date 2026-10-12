import type { TemplateDef } from '../types';
import { box, W, H, D } from './helpers';

export const sidePanel: TemplateDef = {
  id: 'side-panel',
  name: 'Side panel',
  category: 'Panels',
  params: [W(18), H(2200), D(580)],
  build: ({ width: w, height: h, depth: d }) => [box('Side panel', 'carcass', -w / 2, 0, -d / 2, w, h, d)],
};
