import type { TemplateDef } from '../types';
import { W, H, p } from './helpers';
import { HANDLE, handleParam, slidingDoor as build } from './hardware';

export const slidingDoor: TemplateDef = {
  id: 'sliding-door',
  name: 'Sliding door',
  category: 'Fronts',
  description: 'Single sliding door that moves sideways on a track.',
  tags: ['sliding', 'door', 'front', 'track', 'bypass'],
  params: [
    W(900, 300, 1500), H(2200, 300, 3000), p('depth', 'Thickness', 18, 8, 40),
    { ...p('direction', 'Slides to', 0, 0, 1), options: [{ value: 0, label: 'Left' }, { value: 1, label: 'Right' }] },
    handleParam(HANDLE.cutout),
  ],
  build: ({ width: w, height: h, depth: d, direction, handle }) =>
    build({ id: 'slide', x0: -w / 2, y0: 0, z0: -d / 2, w, h, t: d, dir: Math.round(direction) === 1 ? 1 : -1, travel: w * 0.9, handle }),
};
