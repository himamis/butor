import type { TemplateDef } from '../types';
import { W, H, p } from './helpers';
import { handleInsetParam, handleParam, handlePosParam, hingeParam, hingedDoor, openAngleParam } from './hardware';

export const door: TemplateDef = {
  id: 'door',
  name: 'Door',
  category: 'Fronts',
  params: [
    W(400, 100, 1200), H(2190, 100, 3000), p('depth', 'Thickness', 18, 8, 40),
    hingeParam(), openAngleParam(), handleParam(), handlePosParam(), handleInsetParam(),
  ],
  build: ({ width: w, height: h, depth: d, hinge, openAngle, handle, handlePos, handleInset }) =>
    hingedDoor({ id: 'door', x0: -w / 2, y0: 0, z0: -d / 2, w, h, t: d, hinge, openAngle, handle, handlePos, handleInset }),
};
