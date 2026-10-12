/** A minimal catalog for core tests. Real templates live in src/catalog. */
import { z } from 'zod';
import {
  choice,
  count,
  createRegistry,
  layoutColumns,
  mm,
  type UnitTemplate,
  type ItemTemplate,
  type FrontTemplate,
  type PartTemplate,
} from '../catalog';
import type { PartDraft } from '../geometry/part';

const BACK = 8;

const board = (
  key: string,
  label: string,
  role: PartDraft['role'],
  center: PartDraft['center'],
  size: PartDraft['size'],
  material: string,
  thickness: number,
): PartDraft => ({ key, label, role, shape: { kind: 'box' }, center, size, material: { id: material, thickness } });

export const testUnit: UnitTemplate = {
  id: 'test.unit',
  version: 1,
  kind: 'unit',
  name: 'Test unit',
  category: 'Cabinets',
  description: 'A plain carcass for tests.',
  tags: [],
  params: z.object({ thickness: mm({ label: 'Board', min: 12, max: 30, default: 18 }) }),
  minColumnWidth: 100,
  sizeLimits: { w: [200, 4000], h: [200, 3000], d: [200, 1000] },
  defaultSize: { w: 800, h: 2200, d: 580 },
  layout(unit) {
    const t = Number(unit.params.thickness ?? 18);
    const { w, h, d } = unit.size;
    const cols = layoutColumns({ innerW: w - 2 * t, x0: -w / 2 + t, divider: t, minWidth: 100, columns: unit.columns });
    if ('error' in cols) return cols;
    return {
      inner: { w: w - 2 * t, h: h - 2 * t, d: d - BACK },
      floorY: t,
      innerZ: [-d / 2 + BACK, d / 2],
      columns: cols.columns,
      dividerThickness: t,
    };
  },
  build(unit, layout, m) {
    const t = layout.dividerThickness;
    const { w, h, d } = unit.size;
    const parts: PartDraft[] = [
      board('side-l', 'Side', 'carcass', { x: -w / 2 + t / 2, y: h / 2, z: 0 }, { x: t, y: h, z: d }, m.carcass, t),
      board('side-r', 'Side', 'carcass', { x: w / 2 - t / 2, y: h / 2, z: 0 }, { x: t, y: h, z: d }, m.carcass, t),
      board('top', 'Top', 'carcass', { x: 0, y: h - t / 2, z: 0 }, { x: w - 2 * t, y: t, z: d }, m.carcass, t),
      board('bottom', 'Bottom', 'carcass', { x: 0, y: t / 2, z: 0 }, { x: w - 2 * t, y: t, z: d }, m.carcass, t),
    ];
    layout.columns
      .slice(1)
      .forEach((c, i) =>
        parts.push(
          board(
            `divider-${i}`,
            'Divider',
            'divider',
            { x: c.x0 - t / 2, y: h / 2, z: 0 },
            { x: t, y: h - 2 * t, z: d },
            m.carcass,
            t,
          ),
        ),
      );
    return parts;
  },
};

export const testShelf: ItemTemplate = {
  id: 'test.shelf',
  version: 1,
  kind: 'item',
  name: 'Shelf',
  category: 'Interior',
  description: 'Shelf for tests.',
  tags: [],
  params: z.object({}),
  height: () => 18,
  build: (_p, c) => [
    board(
      'shelf',
      'Shelf',
      'shelf',
      { x: c.x0 + c.width / 2, y: c.y + 9, z: (c.innerZ[0] + c.innerZ[1]) / 2 },
      { x: c.width, y: 18, z: c.innerZ[1] - c.innerZ[0] },
      c.materials.interior,
      18,
    ),
  ],
};

export const testDrawer: ItemTemplate = {
  id: 'test.drawer',
  version: 1,
  kind: 'item',
  name: 'Drawer',
  category: 'Interior',
  description: 'Drawer for tests.',
  tags: [],
  params: z.object({
    height: mm({ label: 'Height', min: 80, max: 600, default: 200 }),
    style: choice({ label: 'Front', options: { internal: 'Inside', external: 'On unit front' }, default: 'internal' }),
  }),
  height: (p) => Number(p.height),
  build: (p, c) => [
    {
      ...board(
        'box',
        'Drawer box',
        'drawer-box',
        { x: c.x0 + c.width / 2, y: c.y + Number(p.height) / 2, z: (c.innerZ[0] + c.innerZ[1]) / 2 },
        { x: c.width - 26, y: Number(p.height) - 20, z: c.innerZ[1] - c.innerZ[0] - 10 },
        c.materials.interior,
        16,
      ),
      motion: { id: c.id, kind: 'slide', offset: { x: 0, y: 0, z: 300 } },
    },
  ],
};

export const testDoor: FrontTemplate = {
  id: 'test.door',
  version: 1,
  kind: 'front',
  name: 'Door',
  category: 'Fronts',
  description: 'Door for tests.',
  tags: [],
  params: z.object({ hinge: choice({ label: 'Hinge', options: { left: 'Left', right: 'Right' }, default: 'left' }) }),
  minSize: { w: 100, h: 100 },
  mount: 'overlay',
  build: (p, c) => {
    const left = p.hinge === 'left';
    const w = c.rect.x1 - c.rect.x0;
    return [
      {
        ...board(
          'door',
          'Door',
          'front',
          { x: c.rect.x0 + w / 2, y: (c.rect.y0 + c.rect.y1) / 2, z: c.z + 9 },
          { x: w, y: c.rect.y1 - c.rect.y0, z: 18 },
          c.materials.front,
          18,
        ),
        motion: c.drawerMotion ?? {
          id: c.id,
          kind: 'hinge',
          axis: 'y',
          pivot: { x: left ? c.rect.x0 : c.rect.x1, y: 0, z: c.z },
          angle: left ? -95 : 95,
        },
      },
    ];
  },
};

export const testPanel: PartTemplate = {
  id: 'test.panel',
  version: 1,
  kind: 'part',
  name: 'Panel',
  category: 'Panels',
  description: 'Panel for tests.',
  tags: [],
  params: z.object({
    w: mm({ label: 'Width', min: 10, max: 3000, default: 600 }),
    h: mm({ label: 'Height', min: 10, max: 3000, default: 18 }),
    d: mm({ label: 'Depth', min: 4, max: 1000, default: 500 }),
    count: count({ label: 'Copies', min: 1, max: 4, default: 1 }),
  }),
  size: (p) => ({ w: Number(p.w), h: Number(p.h), d: Number(p.d) }),
  build: (p, m) => [
    board(
      'panel',
      'Panel',
      'carcass',
      { x: 0, y: Number(p.h) / 2, z: 0 },
      { x: Number(p.w), y: Number(p.h), z: Number(p.d) },
      m.carcass,
      Number(p.h),
    ),
  ],
};

export const testCatalog = createRegistry([testUnit, testShelf, testDrawer, testDoor, testPanel]);
