import type { TemplateDef } from '../types';
import { W, H, D, p } from './helpers';
import { carcass } from './carcass';
import { doorSet, doorsParam, handleInsetParam, handleParam, handlePosParam, openAngleParam, shiftPanels } from './hardware';

export const DOOR_T = 18;

/** Carcass with 1 or 2 overlay doors in front. Depth includes the doors. */
export const carcassDoors: TemplateDef = {
  id: 'carcass-doors',
  name: 'Carcass with doors',
  category: 'Cabinets',
  description: 'Shelved carcass with one or two hinged doors.',
  tags: ['cupboard', 'cabinet', 'doors', 'closet'],
  params: [
    W(800, 200, 2400), H(2200, 200, 3000), D(600, 120, 1000),
    p('thickness', 'Thickness', 18, 8, 40), p('shelves', 'Shelves', 3, 0, 10),
    doorsParam(), openAngleParam(), handleParam(), handlePosParam(), handleInsetParam(),
  ],
  build: ({ width: w, height: h, depth: d, thickness, shelves, doors, openAngle, handle, handlePos, handleInset }) => [
    ...shiftPanels(carcass.build({ width: w, height: h, depth: d - DOOR_T, thickness, shelves }), 0, 0, -DOOR_T / 2),
    ...doorSet({ w, h, z0: d / 2 - DOOR_T, t: DOOR_T, doors, openAngle, handle, handlePos, handleInset }),
  ],
};
