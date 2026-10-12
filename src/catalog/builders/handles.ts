import { choice, mm, type Motion, type PartDraft } from '../../core';
import type { Cutout } from './cutout';

export type HandleKind = 'none' | 'knob' | 'bar' | 'grip' | 'push';

/** Shared handle params for every front template. */
export const handleParams = (def: HandleKind = 'knob') => ({
  handle: choice({
    label: 'Handle',
    options: { none: 'None', knob: 'Knob', bar: 'Bar', grip: 'Grip cutout', push: 'Push to open' },
    default: def,
  }),
  barLength: mm({ label: 'Bar length', min: 96, max: 800, default: 160 }),
});

const KNOB = { d: 30, depth: 25 };
const BAR = { t: 12, standoff: 30 };
const GRIP_HOLE = { w: 30, h: 120 };
const GRIP_NOTCH = { w: 150, h: 30 };

/**
 * Handle hardware for a front. `at` is the handle centre on the front face (entity-local x/y), `face` the
 * z of the front's outer face, `along` the direction a bar runs. Grips return a cutout for the panel instead.
 */
export function handle(o: {
  kind: HandleKind;
  barLength: number;
  at: { x: number; y: number };
  face: number;
  along: 'x' | 'y';
  panel: { w: number; h: number; cx: number; cy: number }; // to clamp bars and place cutouts
  finish: string;
  motion?: Motion | undefined;
  grip: 'hole' | 'notch';
}): { parts: PartDraft[]; cutout?: Cutout } {
  const m = o.motion ? { motion: o.motion } : {};
  switch (o.kind) {
    case 'knob':
      return {
        parts: [
          {
            key: 'handle',
            label: `Knob Ø${KNOB.d}`,
            role: 'handle',
            shape: { kind: 'cylinder', axis: 'z' },
            center: { x: o.at.x, y: o.at.y, z: o.face + KNOB.depth / 2 },
            size: { x: KNOB.d, y: KNOB.d, z: KNOB.depth },
            material: { id: o.finish },
            hardware: { name: `Knob Ø${KNOB.d}` },
            ...m,
          },
        ],
      };
    case 'bar': {
      const len = Math.max(40, Math.min(o.barLength, (o.along === 'x' ? o.panel.w : o.panel.h) - 40));
      return {
        parts: [
          {
            key: 'handle',
            label: `Bar handle ${len} mm`,
            role: 'handle',
            shape: { kind: 'box' },
            center: { x: o.at.x, y: o.at.y, z: o.face + BAR.standoff / 2 },
            size: o.along === 'x' ? { x: len, y: BAR.t, z: BAR.standoff } : { x: BAR.t, y: len, z: BAR.standoff },
            material: { id: o.finish },
            hardware: { name: `Bar handle ${len} mm` },
            ...m,
          },
        ],
      };
    }
    case 'grip':
      return {
        parts: [],
        cutout:
          o.grip === 'notch'
            ? { kind: 'notch', cx: o.at.x - o.panel.cx, cy: 0, ...GRIP_NOTCH }
            : { kind: 'hole', cx: o.at.x - o.panel.cx, cy: o.at.y - o.panel.cy, ...GRIP_HOLE },
      };
    case 'push':
      // The latch sits behind the front; it is hardware only.
      return {
        parts: [
          {
            key: 'latch',
            label: 'Push latch',
            role: 'hardware',
            shape: { kind: 'box' },
            center: { x: o.at.x, y: o.at.y, z: o.face - 40 },
            size: { x: 20, y: 40, z: 20 },
            material: { id: o.finish },
            hardware: { name: 'Push latch' },
            ...m,
          },
        ],
      };
    default:
      return { parts: [] };
  }
}
