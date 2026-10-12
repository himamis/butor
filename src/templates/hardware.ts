import type { Motion, Panel, ParamDef } from '../types';
import { box, p } from './helpers';

export const HANDLE = { none: 0, knob: 1, bar: 2, cutout: 3 } as const;

const KNOB = { d: 30, proj: 25 };
const BAR = { len: 160, t: 12, proj: 30 };
const GRIP_HOLE = { w: 30, h: 120 };
const GRIP_NOTCH = { w: 150, h: 30 };

export const handleParam = (def: number = HANDLE.knob): ParamDef => ({
  ...p('handle', 'Handle', def, 0, 3),
  options: [
    { value: HANDLE.none, label: 'None' },
    { value: HANDLE.knob, label: 'Knob' },
    { value: HANDLE.bar, label: 'Bar' },
    { value: HANDLE.cutout, label: 'Cutout (grip)' },
  ],
});

export const handlePosParam = (): ParamDef => ({
  ...p('handlePos', 'Handle at', 1, 0, 2),
  options: [
    { value: 0, label: 'Top' },
    { value: 1, label: 'Middle' },
    { value: 2, label: 'Bottom' },
  ],
});

export const hingeParam = (): ParamDef => ({
  ...p('hinge', 'Hinge', 0, 0, 1),
  options: [
    { value: 0, label: 'Left' },
    { value: 1, label: 'Right' },
  ],
});

export const openAngleParam = () => p('openAngle', 'Opens to (°)', 95, 10, 180);
export const handleInsetParam = () => p('handleInset', 'Handle inset', 50, 20, 300);

/**
 * A front panel plus its handle. (hx, hy) = handle center in object-local mm; the front's
 * outer face is at z0 + t. All parts share `motion`.
 */
export function frontWithHandle(o: {
  name: string;
  x0: number; y0: number; z0: number;
  w: number; h: number; t: number;
  handle: number;
  hx: number; hy: number;
  horizontal: boolean;
  motion?: Motion;
}): Panel[] {
  const front: Panel = { ...box(o.name, 'door', o.x0, o.y0, o.z0, o.w, o.h, o.t), motion: o.motion };
  const face = o.z0 + o.t;
  const handle = Math.round(o.handle);

  if (handle === HANDLE.cutout) {
    const rel = { cx: o.hx - front.pos.x, cy: o.hy - front.pos.y };
    front.cutout = o.horizontal
      ? { kind: 'notch', ...rel, ...GRIP_NOTCH }
      : { kind: 'hole', ...rel, ...GRIP_HOLE };
    return [front];
  }
  if (handle === HANDLE.knob) {
    return [front, {
      name: `Knob Ø${KNOB.d}`, role: 'handle', shape: 'knob', motion: o.motion,
      pos: { x: o.hx, y: o.hy, z: face + KNOB.proj / 2 },
      size: { x: KNOB.d, y: KNOB.d, z: KNOB.proj },
    }];
  }
  if (handle === HANDLE.bar) {
    const len = Math.min(BAR.len, (o.horizontal ? o.w : o.h) - 40);
    return [front, {
      name: `Bar handle ${len} mm`, role: 'handle', motion: o.motion,
      pos: { x: o.hx, y: o.hy, z: face + BAR.proj / 2 },
      size: o.horizontal ? { x: len, y: BAR.t, z: BAR.proj } : { x: BAR.t, y: len, z: BAR.proj },
    }];
  }
  return [front];
}

/** A hinged door whose back face is at z0. hinge 0 = left, 1 = right; opens outward (+z). */
export function hingedDoor(o: {
  id: string;
  x0: number; y0: number; z0: number;
  w: number; h: number; t: number;
  hinge: number; openAngle: number;
  handle: number; handlePos: number; handleInset: number;
}): Panel[] {
  const left = Math.round(o.hinge) === 0;
  const motion: Motion = {
    id: o.id,
    kind: 'hinge',
    pivot: { x: left ? o.x0 : o.x0 + o.w, z: o.z0 },
    angle: left ? -o.openAngle : o.openAngle,
  };
  const inset = Math.min(o.handleInset, o.w / 2);
  const hx = left ? o.x0 + o.w - inset : o.x0 + inset;
  const edge = Math.min(150, o.h / 4);
  const pos = Math.round(o.handlePos);
  const hy = pos === 0 ? o.y0 + o.h - edge : pos === 2 ? o.y0 + edge : o.y0 + o.h / 2;
  return frontWithHandle({ name: 'Door', x0: o.x0, y0: o.y0, z0: o.z0, w: o.w, h: o.h, t: o.t, handle: o.handle, hx, hy, horizontal: false, motion });
}

export function shiftPanels(panels: Panel[], dx: number, dy: number, dz: number): Panel[] {
  return panels.map((pn) => ({
    ...pn,
    pos: { x: pn.pos.x + dx, y: pn.pos.y + dy, z: pn.pos.z + dz },
    motion: pn.motion?.kind === 'hinge' ? { ...pn.motion, pivot: { x: pn.motion.pivot.x + dx, z: pn.motion.pivot.z + dz } } : pn.motion,
  }));
}
