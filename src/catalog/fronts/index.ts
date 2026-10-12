import { z } from 'zod';
import {
  choice,
  count,
  mm,
  toggle,
  type FrontBuildContext,
  type FrontTemplate,
  type Motion,
  type PartDraft,
} from '../../core';
import { frontPanel } from '../builders/front';
import { handle, handleParams, type HandleKind } from '../builders/handles';
import { hingesFor } from '../builders/hardware';

/* Fronts cover ctx.rect (unit-local, gaps applied). Overlay fronts sit in front of the carcass: back face at ctx.z. */

export const GLASS = 'glass'; // material id of the glass finish in the default library

const thickness = () => mm({ label: 'Thickness', min: 16, max: 25, default: 18 });
const handlePos = () =>
  choice({ label: 'Handle at', options: { top: 'Top', middle: 'Middle', bottom: 'Bottom' }, default: 'middle' });
const handleInset = () => mm({ label: 'Handle inset', min: 20, max: 300, default: 50 });
const openAngle = (def = 95) => count({ label: 'Opens to (°)', min: 10, max: 180, default: def });

interface Leaf {
  key: string;
  x0: number;
  x1: number;
  hinge: 'left' | 'right';
}

/** One hinged leaf: panel, handle on the free edge, hinge motion swinging outward. */
function leaf(p: Record<string, unknown>, c: FrontBuildContext, l: Leaf): PartDraft[] {
  const t = Number(p.thickness);
  const { y0, y1 } = c.rect;
  const h = y1 - y0;
  const left = l.hinge === 'left';
  const motion: Motion = {
    id: `${c.id}:${l.key}`,
    kind: 'hinge',
    axis: 'y',
    pivot: { x: left ? l.x0 : l.x1, y: 0, z: c.z },
    angle: left ? -Number(p.openAngle) : Number(p.openAngle),
  };
  const inset = Math.min(Number(p.handleInset), (l.x1 - l.x0) / 2);
  const edge = Math.min(150, h / 4);
  const hy = p.handlePos === 'top' ? y1 - edge : p.handlePos === 'bottom' ? y0 + edge : (y0 + y1) / 2;
  const panel = { w: l.x1 - l.x0, h, cx: (l.x0 + l.x1) / 2, cy: (y0 + y1) / 2 };
  const hd = handle({
    kind: p.handle as HandleKind,
    barLength: Number(p.barLength),
    at: { x: left ? l.x1 - inset : l.x0 + inset, y: hy },
    face: c.z + t,
    along: 'y',
    panel,
    finish: c.materials.handle,
    motion,
    grip: 'hole',
  });
  return [
    frontPanel({
      key: l.key,
      label: p.glass ? 'Glass door' : 'Door',
      rect: { x0: l.x0, x1: l.x1, y0, y1 },
      z0: c.z,
      thickness: t,
      material: p.glass ? GLASS : c.materials.front,
      grain: 'y',
      motion,
      cutout: hd.cutout,
      hardware: { name: 'Hinge', count: hingesFor(h) },
    }),
    ...hd.parts.map((x) => ({ ...x, key: `${l.key}-${x.key}` })),
  ];
}

export const door: FrontTemplate = {
  id: 'front.door',
  version: 1,
  kind: 'front',
  name: 'Door',
  category: 'Fronts',
  description: 'Hinged door, left or right, with a handle on the free edge. Can be glass.',
  tags: ['door', 'hinged', 'front', 'glass'],
  params: z.object({
    hinge: choice({ label: 'Hinge', options: { left: 'Left', right: 'Right' }, default: 'left' }),
    ...handleParams('knob'),
    handlePos: handlePos(),
    handleInset: handleInset(),
    openAngle: openAngle(),
    thickness: thickness(),
    glass: toggle({ label: 'Glass', default: false }),
  }),
  minSize: { w: 100, h: 100 },
  mount: 'overlay',
  build: (p, c) => leaf(p, c, { key: 'door', x0: c.rect.x0, x1: c.rect.x1, hinge: p.hinge as 'left' | 'right' }),
};

export const doubleDoor: FrontTemplate = {
  id: 'front.double-door',
  version: 1,
  kind: 'front',
  name: 'Double door',
  category: 'Fronts',
  description: 'Two doors meeting in the middle, hinged on the outer sides.',
  tags: ['door', 'double', 'pair', 'hinged', 'front'],
  params: z.object({
    ...handleParams('knob'),
    handlePos: handlePos(),
    handleInset: handleInset(),
    openAngle: openAngle(),
    thickness: thickness(),
    glass: toggle({ label: 'Glass', default: false }),
  }),
  minSize: { w: 200, h: 100 },
  mount: 'overlay',
  build(p, c) {
    const m = (c.rect.x0 + c.rect.x1) / 2;
    return [
      ...leaf(p, c, { key: 'left', x0: c.rect.x0, x1: m - 1.5, hinge: 'left' }),
      ...leaf(p, c, { key: 'right', x0: m + 1.5, x1: c.rect.x1, hinge: 'right' }),
    ];
  },
};

export const flap: FrontTemplate = {
  id: 'front.flap',
  version: 1,
  kind: 'front',
  name: 'Lift-up flap',
  category: 'Fronts',
  description: 'Front hinged at the top that lifts up and out — for top cabinets.',
  tags: ['flap', 'lift', 'up', 'top', 'front'],
  params: z.object({ ...handleParams('bar'), openAngle: openAngle(100), thickness: thickness() }),
  minSize: { w: 200, h: 150 },
  mount: 'overlay',
  build(p, c) {
    const t = Number(p.thickness);
    const { x0, x1, y0, y1 } = c.rect;
    const motion: Motion = {
      id: c.id,
      kind: 'hinge',
      axis: 'x',
      pivot: { x: 0, y: y1, z: c.z },
      angle: -Number(p.openAngle),
    };
    const panel = { w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
    const hd = handle({
      kind: p.handle as HandleKind,
      barLength: Number(p.barLength),
      at: { x: panel.cx, y: y0 + Math.min(60, panel.h / 4) },
      face: c.z + t,
      along: 'x',
      panel,
      finish: c.materials.handle,
      motion,
      grip: 'hole',
    });
    return [
      frontPanel({
        key: 'flap',
        label: 'Flap',
        rect: c.rect,
        z0: c.z,
        thickness: t,
        material: c.materials.front,
        grain: 'x',
        motion,
        cutout: hd.cutout,
        hardware: { name: 'Hinge', count: 2 },
      }),
      {
        key: 'stay',
        label: 'Flap stay',
        role: 'hardware',
        shape: { kind: 'box' },
        center: { x: x0 + 40, y: y1 - 60, z: c.z - 30 },
        size: { x: 20, y: 80, z: 40 },
        material: { id: c.materials.handle },
        hardware: { name: 'Flap stay (pair)' },
        motion,
      },
      ...hd.parts,
    ];
  },
};

export const sliding: FrontTemplate = {
  id: 'front.sliding',
  version: 1,
  kind: 'front',
  name: 'Sliding door',
  category: 'Fronts',
  description: 'Door on a front or back track that slides sideways over its neighbour.',
  tags: ['sliding', 'door', 'track', 'bypass', 'front'],
  params: z.object({
    track: choice({ label: 'Track', options: { outer: 'Front track', inner: 'Back track' }, default: 'outer' }),
    slides: choice({ label: 'Slides to', options: { left: 'Left', right: 'Right' }, default: 'right' }),
    overlap: mm({ label: 'Overlap', min: 0, max: 100, default: 25 }),
    ...handleParams('grip'),
    thickness: thickness(),
  }),
  minSize: { w: 300, h: 300 },
  mount: 'track',
  build(p, c) {
    const t = Number(p.thickness);
    const ov = Number(p.overlap);
    // Sliding doors run between the sides, top and bottom; they extend over neighbours so they overlap when closed.
    const o = c.opening;
    const outerLeft = c.rect.x0 <= -c.unit.w / 2 + 2;
    const outerRight = c.rect.x1 >= c.unit.w / 2 - 2;
    const x0 = outerLeft ? o.x0 + 1 : Math.max(o.x0 + 1, c.rect.x0 - ov);
    const x1 = outerRight ? o.x1 - 1 : Math.min(o.x1 - 1, c.rect.x1 + ov);
    const y0 = Math.max(c.rect.y0, o.y0 + 1);
    const y1 = Math.min(c.rect.y1, o.y1 - 1);
    const [, zf] = c.trackZone ?? [c.z, c.z + 80];
    const z0 = p.track === 'outer' ? zf - 4 - t : zf - 4 - 2 * t - 20;
    const dir = p.slides === 'right' ? 1 : -1;
    const w = x1 - x0;
    const motion: Motion = { id: c.id, kind: 'slide', offset: { x: dir * Math.round(w * 0.9), y: 0, z: 0 } };
    const panel = { w, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
    const edge = Math.min(60, w / 4);
    const hd = handle({
      kind: p.handle as HandleKind,
      barLength: Number(p.barLength),
      at: { x: dir > 0 ? x1 - edge : x0 + edge, y: panel.cy },
      face: z0 + t,
      along: 'y',
      panel,
      finish: c.materials.handle,
      motion,
      grip: 'hole',
    });
    return [
      frontPanel({
        key: 'door',
        label: 'Sliding door',
        rect: { x0, x1, y0, y1 },
        z0,
        thickness: t,
        material: c.materials.front,
        grain: 'y',
        motion,
        cutout: hd.cutout,
        hardware: { name: 'Sliding door roller set' },
      }),
      ...hd.parts,
    ];
  },
};

export const drawerFront: FrontTemplate = {
  id: 'front.drawer',
  version: 1,
  kind: 'front',
  name: 'Drawer front',
  category: 'Fronts',
  description: 'Front of a drawer on the unit; it moves with the drawer it belongs to.',
  tags: ['drawer', 'front'],
  params: z.object({ ...handleParams('bar'), thickness: thickness() }),
  minSize: { w: 100, h: 60 },
  mount: 'overlay',
  build(p, c) {
    const t = Number(p.thickness);
    const { x0, x1, y0, y1 } = c.rect;
    const panel = { w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
    const hd = handle({
      kind: p.handle as HandleKind,
      barLength: Number(p.barLength),
      at: { x: panel.cx, y: p.handle === 'grip' ? y1 : panel.cy },
      face: c.z + t,
      along: 'x',
      panel,
      finish: c.materials.handle,
      motion: c.drawerMotion,
      grip: 'notch',
    });
    return [
      frontPanel({
        key: 'front',
        label: 'Drawer front',
        rect: c.rect,
        z0: c.z,
        thickness: t,
        material: c.materials.front,
        grain: 'x',
        motion: c.drawerMotion,
        cutout: hd.cutout,
      }),
      ...hd.parts,
    ];
  },
};

export const FRONTS: FrontTemplate[] = [door, doubleDoor, flap, sliding, drawerFront];
