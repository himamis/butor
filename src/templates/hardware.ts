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
      name: `Knob Ø${KNOB.d}`, hardware: `Knob Ø${KNOB.d}`, role: 'handle', shape: 'knob', motion: o.motion,
      pos: { x: o.hx, y: o.hy, z: face + KNOB.proj / 2 },
      size: { x: KNOB.d, y: KNOB.d, z: KNOB.proj },
    }];
  }
  if (handle === HANDLE.bar) {
    const len = Math.min(BAR.len, (o.horizontal ? o.w : o.h) - 40);
    return [front, {
      name: `Bar handle ${len} mm`, hardware: `Bar handle ${len} mm`, role: 'handle', motion: o.motion,
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

/**
 * A drawer: front (with handle) whose back face is at frontZ0, and a box behind it.
 * Everything shares one slide motion; it opens 85 % of the box depth.
 */
export function drawerPanels(o: {
  id: string;
  name?: string;
  x0: number; y0: number; w: number; h: number;
  frontZ0: number; frontT: number;
  box: { x0: number; y0: number; w: number; h: number; d: number; t: number };
  handle: number;
}): Panel[] {
  const b = o.box;
  const motion: Motion = { id: o.id, kind: 'slide', offset: { x: 0, y: 0, z: b.d * 0.85 } };
  const m = (pn: Panel): Panel => ({ ...pn, motion });
  const bz0 = o.frontZ0 - b.d;
  const hy = Math.round(o.handle) === HANDLE.cutout ? o.y0 + o.h : o.y0 + o.h / 2; // a grip notch sits in the top edge
  return [
    ...frontWithHandle({ name: o.name ?? 'Drawer front', x0: o.x0, y0: o.y0, z0: o.frontZ0, w: o.w, h: o.h, t: o.frontT, handle: o.handle, hx: o.x0 + o.w / 2, hy, horizontal: true, motion }),
    m(box('Drawer side', 'drawer', b.x0, b.y0, bz0, b.t, b.h, b.d)),
    m(box('Drawer side', 'drawer', b.x0 + b.w - b.t, b.y0, bz0, b.t, b.h, b.d)),
    m(box('Drawer back', 'drawer', b.x0 + b.t, b.y0, bz0, b.w - 2 * b.t, b.h, b.t)),
    m(box('Drawer bottom', 'drawer', b.x0 + b.t, b.y0, bz0 + b.t, b.w - 2 * b.t, b.t, b.d - b.t)),
  ];
}

/** One or two overlay doors (2 mm gaps, outer hinges) whose back face is at z0. */
export function doorSet(o: {
  w: number; h: number; z0: number; t: number; doors: number;
  openAngle: number; handle: number; handlePos: number; handleInset: number;
  y0?: number; gap?: number;
}): Panel[] {
  const gap = o.gap ?? 2;
  const y0 = o.y0 ?? gap;
  const common = { y0, z0: o.z0, h: o.h - 2 * gap, t: o.t, openAngle: o.openAngle, handle: o.handle, handlePos: o.handlePos, handleInset: o.handleInset };
  if (Math.round(o.doors) === 1) return hingedDoor({ ...common, id: 'door-0', x0: -o.w / 2 + gap, w: o.w - 2 * gap, hinge: 0 });
  const dw = (o.w - 3 * gap) / 2;
  return [
    ...hingedDoor({ ...common, id: 'door-0', x0: -o.w / 2 + gap, w: dw, hinge: 0 }),
    ...hingedDoor({ ...common, id: 'door-1', x0: -o.w / 2 + 2 * gap + dw, w: dw, hinge: 1 }),
  ];
}

/** A sliding door whose back face is at z0; dir −1 slides left, +1 right, by `travel` mm. Handle sits at its leading edge. */
export function slidingDoor(o: { id: string; x0: number; y0: number; z0: number; w: number; h: number; t: number; dir: number; travel: number; handle: number; moves?: boolean }): Panel[] {
  const motion: Motion | undefined = o.moves === false ? undefined : { id: o.id, kind: 'slide', offset: { x: o.dir * o.travel, y: 0, z: 0 } };
  const edge = Math.min(60, o.w / 4);
  const hx = o.dir < 0 ? o.x0 + edge : o.x0 + o.w - edge; // pull on the side it moves towards
  return frontWithHandle({ name: 'Sliding door', x0: o.x0, y0: o.y0, z0: o.z0, w: o.w, h: o.h, t: o.t, handle: o.handle, hx, hy: o.y0 + o.h / 2, horizontal: false, motion });
}

export const doorsParam = (def = 2): ParamDef => ({
  ...p('doors', 'Doors', def, 1, 2),
  options: [{ value: 1, label: 'One' }, { value: 2, label: 'Two' }],
});
