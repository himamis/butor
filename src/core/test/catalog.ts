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

const BACK = 8;

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
};

export const testCatalog = createRegistry([testUnit, testShelf, testDrawer, testDoor, testPanel]);
