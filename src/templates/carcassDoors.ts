import type { TemplateDef } from '../types';
import { W, H, D, p } from './helpers';
import { carcass } from './carcass';
import { handleInsetParam, handleParam, handlePosParam, hingedDoor, openAngleParam, shiftPanels } from './hardware';

const DOOR_T = 18;
const GAP = 2;

/** Carcass with 1 or 2 overlay doors in front. Depth includes the doors. */
export const carcassDoors: TemplateDef = {
  id: 'carcass-doors',
  name: 'Carcass with doors',
  category: 'Units',
  params: [
    W(800, 200, 2400), H(2200, 200, 3000), D(600, 120, 1000),
    p('thickness', 'Thickness', 18, 8, 40), p('shelves', 'Shelves', 3, 0, 10),
    { ...p('doors', 'Doors', 2, 1, 2), options: [{ value: 1, label: 'One' }, { value: 2, label: 'Two' }] },
    openAngleParam(), handleParam(), handlePosParam(), handleInsetParam(),
  ],
  build: ({ width: w, height: h, depth: d, thickness, shelves, doors, openAngle, handle, handlePos, handleInset }) => {
    const body = shiftPanels(carcass.build({ width: w, height: h, depth: d - DOOR_T, thickness, shelves }), 0, 0, -DOOR_T / 2);
    const z0 = d / 2 - DOOR_T;
    const dh = h - 2 * GAP;
    const common = { y0: GAP, z0, h: dh, t: DOOR_T, openAngle, handle, handlePos, handleInset };
    if (Math.round(doors) === 1) {
      return [...body, ...hingedDoor({ ...common, id: 'door-0', x0: -w / 2 + GAP, w: w - 2 * GAP, hinge: 0 })];
    }
    const dw = (w - 3 * GAP) / 2;
    return [
      ...body,
      ...hingedDoor({ ...common, id: 'door-0', x0: -w / 2 + GAP, w: dw, hinge: 0 }),
      ...hingedDoor({ ...common, id: 'door-1', x0: -w / 2 + 2 * GAP + dw, w: dw, hinge: 1 }),
    ];
  },
};
