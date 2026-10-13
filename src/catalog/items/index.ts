import { z } from 'zod';
import { choice, count, mm, type ItemBuildContext, type ItemTemplate, type Motion, type PartDraft } from '../../core';
import { boardPart, moving } from '../builders/board';
import { frontPanel } from '../builders/front';
import { handle, handleParams, type HandleKind } from '../builders/handles';
import { runnerLength } from '../builders/hardware';

/* Items sit in a unit column. ctx.y is the item's bottom (unit-local), ctx.x0/width its column, ctx.innerZ its depth. */

const DRAWER_BOARD = 12;
const mid = (z: [number, number]) => (z[0] + z[1]) / 2;
const slide = (id: string, depth: number): Motion => ({
  id,
  kind: 'slide',
  offset: { x: 0, y: 0, z: Math.round(depth * 0.9) },
});

/* ───────────── shelf ───────────── */

export const shelf: ItemTemplate = {
  id: 'item.shelf',
  kind: 'item',
  name: 'Shelf',
  category: 'Interior',
  description: 'Shelf across the column; adjustable shelves rest on pins.',
  tags: ['shelf', 'board', 'adjustable'],
  params: z.object({
    type: choice({ label: 'Type', options: { adjustable: 'Adjustable', fixed: 'Fixed' }, default: 'adjustable' }),
    setback: mm({ label: 'Set back', min: 0, max: 100, default: 0 }),
  }),
  height: (_p, ctx) => ctx.layout.dividerThickness,
  build(p, c) {
    const gap = p.type === 'adjustable' ? 1 : 0;
    return [
      boardPart({
        key: 'shelf',
        label: 'Shelf',
        role: 'shelf',
        material: c.materials.interior,
        thickness: c.thickness,
        x: [c.x0 + gap, c.x0 + c.width - gap],
        y: [c.y, c.y + c.thickness],
        z: [c.innerZ[0], c.innerZ[1] - Number(p.setback)],
        grain: 'x',
        banding: { front: true },
        ...(p.type === 'adjustable' ? { hardware: { name: 'Shelf pins', count: 4 } } : {}),
      }),
    ];
  },
};

/* ───────────── rails ───────────── */

function railPart(c: ItemBuildContext, y: number, motion?: Motion): PartDraft {
  const len = Math.round(c.width - 4);
  return {
    key: 'rail',
    label: 'Hanging rail',
    role: 'rail',
    shape: { kind: 'cylinder', axis: 'x' },
    center: { x: c.x0 + c.width / 2, y, z: mid(c.innerZ) },
    size: { x: len, y: 25, z: 25 },
    material: { id: c.materials.handle },
    hardware: { name: `Hanging rail ${len} mm` },
    ...(motion ? { motion } : {}),
  };
}

export const rail: ItemTemplate = {
  id: 'item.rail',
  kind: 'item',
  name: 'Hanging rail',
  category: 'Interior',
  description: 'Metal clothes rail; leave about 1000 mm below it for shirts, 1600 mm for coats.',
  tags: ['rail', 'rod', 'hanging', 'clothes', 'closet'],
  params: z.object({}),
  height: () => 50,
  build: (_p, c) => [railPart(c, c.y + 25)],
};

export const pullDownRail: ItemTemplate = {
  id: 'item.pull-down-rail',
  kind: 'item',
  name: 'Pull-down rail',
  category: 'Interior',
  description: 'Rail on a lift that swings down and out, for the top of tall wardrobes.',
  tags: ['lift', 'pull-down', 'rail', 'hanging', 'high'],
  params: z.object({}),
  height: () => 900,
  build(_p, c) {
    const motion: Motion = { id: c.id, kind: 'slide', offset: { x: 0, y: -600, z: 250 } };
    const arm = (key: string, x: number) =>
      boardPart({
        key,
        label: 'Lift arm',
        role: 'hardware',
        material: c.materials.handle,
        x: [x, x + 20],
        y: [c.y + 40, c.y + 900],
        z: [mid(c.innerZ) - 15, mid(c.innerZ) + 15],
        motion,
      });
    return [
      { ...railPart(c, c.y + 60, motion), hardware: { name: `Pull-down wardrobe lift ${Math.round(c.width)} mm` } },
      arm('arm-left', c.x0 + 2),
      arm('arm-right', c.x0 + c.width - 22),
    ];
  },
};

/* ───────────── drawers ───────────── */

function drawerBox(
  c: ItemBuildContext,
  o: { height: number; front: number; runners: 'side' | 'under'; motion: Motion; depthLeft: number },
): PartDraft[] {
  const gap = o.runners === 'side' ? 13 : 5;
  const bw = c.width - 2 * gap;
  const bh = Math.max(40, o.height - 50);
  const by = c.y + Math.min(25, (o.height - bh) / 2);
  const depth = runnerLength(o.depthLeft);
  const z1 = o.front;
  const z0 = z1 - depth;
  const x0 = c.x0 + gap;
  const t = DRAWER_BOARD;
  const parts = [
    boardPart({
      key: 'box-left',
      label: 'Drawer side',
      role: 'drawer-box',
      material: c.materials.interior,
      thickness: t,
      x: [x0, x0 + t],
      y: [by, by + bh],
      z: [z0, z1],
      grain: 'z',
      banding: { top: true },
      hardware: { name: `Drawer runners ${depth} mm (pair)` },
    }),
    boardPart({
      key: 'box-right',
      label: 'Drawer side',
      role: 'drawer-box',
      material: c.materials.interior,
      thickness: t,
      x: [x0 + bw - t, x0 + bw],
      y: [by, by + bh],
      z: [z0, z1],
      grain: 'z',
      banding: { top: true },
    }),
    boardPart({
      key: 'box-back',
      label: 'Drawer back',
      role: 'drawer-box',
      material: c.materials.interior,
      thickness: t,
      x: [x0 + t, x0 + bw - t],
      y: [by, by + bh],
      z: [z0, z0 + t],
      grain: 'x',
      banding: { top: true },
    }),
    boardPart({
      key: 'box-front',
      label: 'Drawer box front',
      role: 'drawer-box',
      material: c.materials.interior,
      thickness: t,
      x: [x0 + t, x0 + bw - t],
      y: [by, by + bh],
      z: [z1 - t, z1],
      grain: 'x',
      banding: { top: true },
    }),
    boardPart({
      key: 'box-bottom',
      label: 'Drawer bottom',
      role: 'drawer-box',
      material: c.materials.back,
      thickness: 8,
      x: [x0 + t, x0 + bw - t],
      y: [by, by + 8],
      z: [z0 + t, z1 - t],
      grain: 'x',
    }),
  ];
  return moving(parts, o.motion);
}

export const drawer: ItemTemplate = {
  id: 'item.drawer',
  kind: 'item',
  name: 'Drawer',
  category: 'Interior',
  description: 'Drawer on runners — with its own front inside the column, or with a drawer front on the unit.',
  tags: ['drawer', 'pull-out', 'chest', 'internal'],
  params: z.object({
    height: mm({ label: 'Height', min: 80, max: 600, default: 200 }),
    style: choice({
      label: 'Front',
      options: { external: 'On the unit front', internal: 'Inside the column' },
      default: 'external',
    }),
    runners: choice({ label: 'Runners', options: { under: 'Undermount', side: 'Side-mounted' }, default: 'under' }),
    ...handleParams('grip'),
  }),
  height: (p) => Number(p.height),
  takesFront: (p) => p.style === 'external',
  build(p, c) {
    const h = Number(p.height);
    const internal = p.style === 'internal';
    const frontT = 16;
    // Internal drawers stay 5 mm behind the carcass front so doors can close over them.
    const frontFace = internal ? c.innerZ[1] - 5 : c.innerZ[1] - 2;
    const boxFront = internal ? frontFace - frontT : frontFace;
    const depthLeft = boxFront - c.innerZ[0] - 10;
    const motion = slide(c.id, runnerLength(depthLeft));
    const parts = drawerBox(c, {
      height: h,
      front: boxFront,
      runners: p.runners as 'side' | 'under',
      motion,
      depthLeft,
    });
    if (!internal) return parts;
    const rect = { x0: c.x0 + 2, x1: c.x0 + c.width - 2, y0: c.y + 2, y1: c.y + h - 2 };
    const panel = {
      w: rect.x1 - rect.x0,
      h: rect.y1 - rect.y0,
      cx: (rect.x0 + rect.x1) / 2,
      cy: (rect.y0 + rect.y1) / 2,
    };
    const hd = handle({
      kind: p.handle as HandleKind,
      barLength: Number(p.barLength),
      at: { x: panel.cx, y: p.handle === 'grip' ? rect.y1 : panel.cy },
      face: frontFace,
      along: 'x',
      panel,
      finish: c.materials.handle,
      motion,
      grip: 'notch',
    });
    return [
      ...parts,
      frontPanel({
        key: 'front',
        label: 'Inner drawer front',
        rect,
        z0: boxFront,
        thickness: frontT,
        material: c.materials.interior,
        grain: 'x',
        motion,
        cutout: hd.cutout,
      }),
      ...hd.parts.map((x) => ({ ...x, key: `front-${x.key}` })),
    ];
  },
};

/* ───────────── pull-outs ───────────── */

export const basket: ItemTemplate = {
  id: 'item.basket',
  kind: 'item',
  name: 'Wire basket',
  category: 'Interior',
  description: 'Pull-out wire basket on runners for clothes, scarves or accessories.',
  tags: ['basket', 'wire', 'pull-out', 'accessories'],
  params: z.object({ height: mm({ label: 'Height', min: 100, max: 400, default: 180 }) }),
  height: (p) => Number(p.height),
  build(p, c) {
    const h = Number(p.height);
    const z1 = c.innerZ[1] - 5;
    const depth = runnerLength(z1 - c.innerZ[0] - 10);
    const z0 = z1 - depth;
    const x0 = c.x0 + 10;
    const x1 = c.x0 + c.width - 10;
    const R = 8;
    const f = c.materials.handle;
    const motion = slide(c.id, depth);
    const parts = [
      boardPart({
        key: 'base',
        label: 'Basket base',
        role: 'hardware',
        material: f,
        x: [x0, x1],
        y: [c.y, c.y + 4],
        z: [z0, z1],
        hardware: { name: `Wire basket ${Math.round(x1 - x0)}×${depth} mm` },
      }),
      boardPart({
        key: 'rim-front',
        label: 'Basket rim',
        role: 'hardware',
        material: f,
        x: [x0, x1],
        y: [c.y + h - R, c.y + h],
        z: [z1 - R, z1],
      }),
      boardPart({
        key: 'rim-back',
        label: 'Basket rim',
        role: 'hardware',
        material: f,
        x: [x0, x1],
        y: [c.y + h - R, c.y + h],
        z: [z0, z0 + R],
      }),
      boardPart({
        key: 'rim-left',
        label: 'Basket rim',
        role: 'hardware',
        material: f,
        x: [x0, x0 + R],
        y: [c.y + h - R, c.y + h],
        z: [z0 + R, z1 - R],
      }),
      boardPart({
        key: 'rim-right',
        label: 'Basket rim',
        role: 'hardware',
        material: f,
        x: [x1 - R, x1],
        y: [c.y + h - R, c.y + h],
        z: [z0 + R, z1 - R],
      }),
    ];
    for (const [sx, sz] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ] as const) {
      const px = sx ? x1 - R : x0;
      const pz = sz ? z1 - R : z0;
      parts.push(
        boardPart({
          key: `post-${sx}${sz}`,
          label: 'Basket post',
          role: 'hardware',
          material: f,
          x: [px, px + R],
          y: [c.y + 4, c.y + h - R],
          z: [pz, pz + R],
        }),
      );
    }
    return moving(parts, motion);
  },
};

export const trouserRack: ItemTemplate = {
  id: 'item.trouser-rack',
  kind: 'item',
  name: 'Trouser rack',
  category: 'Interior',
  description: 'Pull-out frame with bars for hanging trousers flat.',
  tags: ['trousers', 'pants', 'hanger', 'pull-out', 'bars'],
  params: z.object({ bars: count({ label: 'Bars', min: 3, max: 15, default: 8 }) }),
  height: () => 100,
  build(p, c) {
    const z1 = c.innerZ[1] - 5;
    const depth = runnerLength(z1 - c.innerZ[0] - 10);
    const z0 = z1 - depth;
    const f = c.materials.handle;
    const motion = slide(c.id, depth);
    const n = Number(p.bars);
    const step = (depth - 40) / (n - 1);
    const len = c.width - 50;
    const parts: PartDraft[] = [
      boardPart({
        key: 'runner-left',
        label: 'Trouser rack frame',
        role: 'hardware',
        material: f,
        x: [c.x0 + 5, c.x0 + 25],
        y: [c.y, c.y + 100],
        z: [z0, z1],
        hardware: { name: `Pull-out trouser rack ${Math.round(c.width)} mm` },
      }),
      boardPart({
        key: 'runner-right',
        label: 'Trouser rack frame',
        role: 'hardware',
        material: f,
        x: [c.x0 + c.width - 25, c.x0 + c.width - 5],
        y: [c.y, c.y + 100],
        z: [z0, z1],
      }),
    ];
    for (let i = 0; i < n; i++) {
      parts.push({
        key: `bar-${i + 1}`,
        label: 'Trouser bar',
        role: 'hardware',
        shape: { kind: 'cylinder', axis: 'x' },
        center: { x: c.x0 + c.width / 2, y: c.y + 88, z: z0 + 20 + i * step },
        size: { x: len, y: 12, z: 12 },
        material: { id: f },
      });
    }
    return moving(parts, motion);
  },
};

export const tieRack: ItemTemplate = {
  id: 'item.tie-rack',
  kind: 'item',
  name: 'Tie & belt rack',
  category: 'Interior',
  description: 'Narrow pull-out rack with hooks for ties and belts.',
  tags: ['tie', 'belt', 'hooks', 'accessories', 'pull-out'],
  params: z.object({}),
  height: () => 120,
  build(_p, c) {
    const z1 = c.innerZ[1] - 5;
    const depth = runnerLength(z1 - c.innerZ[0] - 10);
    const x = c.x0 + c.width / 2;
    return [
      boardPart({
        key: 'rack',
        label: 'Tie rack',
        role: 'hardware',
        material: c.materials.handle,
        x: [x - 40, x + 40],
        y: [c.y, c.y + 120],
        z: [z1 - depth, z1],
        motion: slide(c.id, depth),
        hardware: { name: 'Pull-out tie & belt rack' },
      }),
    ];
  },
};

export const shoeShelf: ItemTemplate = {
  id: 'item.shoe-shelf',
  kind: 'item',
  name: 'Shoe shelf',
  category: 'Interior',
  description: 'Shelf with a front lip so shoes do not slide off.',
  tags: ['shoe', 'boots', 'lip', 'shelf'],
  params: z.object({ lip: mm({ label: 'Lip height', min: 20, max: 80, default: 40 }) }),
  height: (p, ctx) => ctx.layout.dividerThickness + Number(p.lip),
  build(p, c) {
    const t = c.thickness;
    return [
      boardPart({
        key: 'shelf',
        label: 'Shoe shelf',
        role: 'shelf',
        material: c.materials.interior,
        thickness: t,
        x: [c.x0, c.x0 + c.width],
        y: [c.y, c.y + t],
        z: [c.innerZ[0], c.innerZ[1]],
        grain: 'x',
        banding: { front: true },
      }),
      boardPart({
        key: 'lip',
        label: 'Shoe shelf lip',
        role: 'shelf',
        material: c.materials.interior,
        thickness: t,
        x: [c.x0, c.x0 + c.width],
        y: [c.y + t, c.y + t + Number(p.lip)],
        z: [c.innerZ[1] - t, c.innerZ[1]],
        grain: 'x',
        banding: { top: true },
      }),
    ];
  },
};

export const accessoryTray: ItemTemplate = {
  id: 'item.tray',
  kind: 'item',
  name: 'Accessory tray',
  category: 'Interior',
  description: 'Shallow pull-out tray with dividers for watches, jewellery and small things.',
  tags: ['tray', 'divider', 'jewellery', 'watch', 'pull-out', 'accessories'],
  params: z.object({ compartments: count({ label: 'Compartments', min: 1, max: 8, default: 3 }) }),
  height: () => 80,
  build(p, c) {
    const z1 = c.innerZ[1] - 5;
    const depth = runnerLength(z1 - c.innerZ[0] - 10);
    const motion = slide(c.id, depth);
    const t = DRAWER_BOARD;
    const x0 = c.x0 + 5;
    const x1 = c.x0 + c.width - 5;
    const z0 = z1 - depth;
    const parts = [
      boardPart({
        key: 'bottom',
        label: 'Tray bottom',
        role: 'drawer-box',
        material: c.materials.interior,
        thickness: t,
        x: [x0, x1],
        y: [c.y, c.y + t],
        z: [z0, z1],
        grain: 'x',
        hardware: { name: `Drawer runners ${depth} mm (pair)` },
      }),
      boardPart({
        key: 'front',
        label: 'Tray front',
        role: 'drawer-box',
        material: c.materials.interior,
        thickness: t,
        x: [x0, x1],
        y: [c.y + t, c.y + 70],
        z: [z1 - t, z1],
        grain: 'x',
        banding: { top: true },
      }),
      boardPart({
        key: 'back',
        label: 'Tray back',
        role: 'drawer-box',
        material: c.materials.interior,
        thickness: t,
        x: [x0, x1],
        y: [c.y + t, c.y + 70],
        z: [z0, z0 + t],
        grain: 'x',
        banding: { top: true },
      }),
    ];
    const n = Number(p.compartments);
    for (let i = 1; i < n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      parts.push(
        boardPart({
          key: `divider-${i}`,
          label: 'Tray divider',
          role: 'drawer-box',
          material: c.materials.interior,
          thickness: 8,
          x: [x - 4, x + 4],
          y: [c.y + t, c.y + 60],
          z: [z0 + t, z1 - t],
          grain: 'z',
        }),
      );
    }
    return moving(parts, motion);
  },
};

export const ITEMS: ItemTemplate[] = [
  shelf,
  rail,
  pullDownRail,
  drawer,
  basket,
  trouserRack,
  tieRack,
  shoeShelf,
  accessoryTray,
];
