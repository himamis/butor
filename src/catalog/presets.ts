import type { Category, EntityInput } from '../core';

/** A ready-made unit inserted with a normal entity.add op (docs/v2/04-catalog.md#template-kinds). */
export interface Preset {
  id: string;
  name: string;
  category: Category;
  description: string;
  tags: string[];
  entity: EntityInput;
}

const at = { x: 0, z: 0 };
const item = (id: string, template: string, y: number, params: Record<string, unknown> = {}) => ({
  id,
  template: { id: template },
  y,
  params,
});
const front = (
  template: string,
  columns: [number, number],
  y: [number, number],
  params: Record<string, unknown> = {},
  drawer?: string,
) => ({
  template: { id: template },
  columns,
  y,
  params,
  ...(drawer ? { drawer } : {}),
});
// Standard unit, 18 mm boards, no plinth: column floor at 18, inner height = h − 36.
const hangingSpace = (innerH: number, prefix: string) => [
  item(`${prefix}-rail`, 'item.rail', innerH - 390),
  item(`${prefix}-top`, 'item.shelf', innerH - 330, { type: 'fixed' }),
];

export const PRESETS: Preset[] = [
  {
    id: 'preset.wardrobe-hinged',
    name: 'Hinged wardrobe',
    category: 'Wardrobes',
    description: 'Wardrobe with a top shelf, hanging rail and a pair of hinged doors.',
    tags: ['closet', 'armoire', 'hanging', 'clothes', 'doors'],
    entity: {
      kind: 'unit',
      name: 'Hinged wardrobe',
      template: { id: 'unit.standard' },
      position: at,
      size: { w: 1000, h: 2200, d: 600 },
      columns: [{ width: 'auto', items: hangingSpace(2164, 'c1') }],
      fronts: [front('front.double-door', [0, 0], [0, 2200], { handle: 'bar' })],
    },
  },
  {
    id: 'preset.wardrobe-sliding',
    name: 'Sliding-door wardrobe',
    category: 'Wardrobes',
    description: 'Two sliding doors on tracks; hanging space on the left, shelves on the right.',
    tags: ['closet', 'sliding', 'door', 'hanging', 'built-in'],
    entity: {
      kind: 'unit',
      name: 'Sliding-door wardrobe',
      template: { id: 'unit.standard' },
      position: at,
      size: { w: 1800, h: 2300, d: 650 },
      columns: [
        { width: 'auto', items: hangingSpace(2264, 'c1') },
        { width: 'auto', items: [450, 900, 1350, 1800].map((y, i) => item(`c2-s${i}`, 'item.shelf', y)) },
      ],
      fronts: [
        front('front.sliding', [0, 0], [0, 2300], { track: 'inner', slides: 'right' }),
        front('front.sliding', [1, 1], [0, 2300], { track: 'outer', slides: 'left' }),
      ],
    },
  },
  {
    id: 'preset.wardrobe-drawers',
    name: 'Wardrobe with drawers',
    category: 'Wardrobes',
    description: 'Hanging space behind doors, with three drawers below.',
    tags: ['closet', 'drawers', 'hanging', 'chest', 'doors'],
    entity: {
      kind: 'unit',
      name: 'Wardrobe with drawers',
      template: { id: 'unit.standard' },
      position: at,
      size: { w: 1000, h: 2200, d: 600 },
      columns: [
        {
          width: 'auto',
          items: [
            item('d1', 'item.drawer', 0),
            item('d2', 'item.drawer', 210),
            item('d3', 'item.drawer', 420),
            ...hangingSpace(2164, 'c1'),
          ],
        },
      ],
      fronts: [
        front('front.drawer', [0, 0], [0, 228], {}, 'd1'),
        front('front.drawer', [0, 0], [228, 438], {}, 'd2'),
        front('front.drawer', [0, 0], [438, 648], {}, 'd3'),
        front('front.double-door', [0, 0], [648, 2200], { handle: 'bar' }),
      ],
    },
  },
  {
    id: 'preset.drawer-unit',
    name: 'Drawer unit',
    category: 'Cabinets',
    description: 'Chest of four full-width drawers.',
    tags: ['chest', 'drawers', 'dresser', 'commode'],
    entity: {
      kind: 'unit',
      name: 'Drawer unit',
      template: { id: 'unit.standard' },
      position: at,
      size: { w: 600, h: 800, d: 500 },
      columns: [
        { width: 'auto', items: [0, 191, 382, 573].map((y, i) => item(`d${i}`, 'item.drawer', y, { height: 180 })) },
      ],
      fronts: [0, 1, 2, 3].map((i) => front('front.drawer', [0, 0], [i * 200, (i + 1) * 200], {}, `d${i}`)),
    },
  },
  {
    id: 'preset.shoe-cabinet',
    name: 'Shoe cabinet',
    category: 'Cabinets',
    description: 'Shallow cabinet with shoe shelves behind a pair of doors.',
    tags: ['shoe', 'hallway', 'entrance', 'boots'],
    entity: {
      kind: 'unit',
      name: 'Shoe cabinet',
      template: { id: 'unit.standard' },
      position: at,
      size: { w: 800, h: 1000, d: 350 },
      columns: [{ width: 'auto', items: [120, 330, 540, 750].map((y, i) => item(`s${i}`, 'item.shoe-shelf', y)) }],
      fronts: [front('front.double-door', [0, 0], [0, 1000])],
    },
  },
  {
    id: 'preset.bookcase',
    name: 'Bookcase',
    category: 'Cabinets',
    description: 'Shallow open unit with four shelves.',
    tags: ['bookcase', 'bookshelf', 'shelves', 'open', 'display'],
    entity: {
      kind: 'unit',
      name: 'Bookcase',
      template: { id: 'unit.standard' },
      position: at,
      size: { w: 800, h: 2000, d: 350 },
      columns: [{ width: 'auto', items: [380, 760, 1140, 1520].map((y, i) => item(`s${i}`, 'item.shelf', y)) }],
      fronts: [],
    },
  },
  {
    id: 'preset.top-cabinet',
    name: 'Top cabinet',
    category: 'Cabinets',
    description: 'Short cabinet with a lift-up flap that sits on top of a wardrobe.',
    tags: ['overhead', 'top box', 'attic', 'storage', 'flap'],
    entity: {
      kind: 'unit',
      name: 'Top cabinet',
      template: { id: 'unit.standard' },
      position: at,
      size: { w: 1000, h: 450, d: 600 },
      columns: [{ width: 'auto', items: [] }],
      fronts: [front('front.flap', [0, 0], [0, 450])],
    },
  },
  {
    id: 'preset.open-unit',
    name: 'Open unit',
    category: 'Cabinets',
    description: 'Carcass with three shelves and no fronts.',
    tags: ['carcass', 'open', 'shelves', 'box'],
    entity: {
      kind: 'unit',
      name: 'Open unit',
      template: { id: 'unit.standard' },
      position: at,
      size: { w: 800, h: 2200, d: 580 },
      columns: [{ width: 'auto', items: [540, 1080, 1620].map((y, i) => item(`s${i}`, 'item.shelf', y)) }],
      fronts: [],
    },
  },
  {
    id: 'preset.corner',
    name: 'Corner shelving',
    category: 'Cabinets',
    description: 'L-shaped open shelving for an inside corner.',
    tags: ['corner', 'l-shape', 'angle', 'shelves'],
    entity: {
      kind: 'unit',
      name: 'Corner shelving',
      template: { id: 'unit.corner' },
      position: at,
      size: { w: 1200, h: 2200, d: 1200 },
      columns: [{ width: 'auto', items: [] }],
      fronts: [],
    },
  },
];

/** A preset with fresh ids for every column, item and front (drawer links follow), placed at `position`. */
export function instantiatePreset(
  p: Preset,
  newId: () => string,
  position: { x: number; y?: number; z: number },
): EntityInput {
  const e = structuredClone(p.entity);
  if (e.kind !== 'unit') return { ...e, position };
  const ids = new Map<string, string>();
  const fresh = (old: string | undefined) => {
    const id = newId();
    if (old) ids.set(old, id);
    return id;
  };
  return {
    ...e,
    position,
    columns: e.columns?.map((c) => ({
      ...c,
      id: fresh(c.id),
      items: c.items?.map((i) => ({ ...i, id: fresh(i.id) })),
    })),
    fronts: e.fronts?.map((f) => ({
      ...f,
      id: fresh(f.id),
      ...(f.drawer ? { drawer: ids.get(f.drawer) ?? f.drawer } : {}),
    })),
  };
}
