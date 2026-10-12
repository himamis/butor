/** Design builders for core tests. */
import { createDesign } from '../design';
import { createIdGenerator } from '../ids';
import type { Design, Unit } from '../schema';
import type { MaterialLibrary } from '../schema/materials';

export const testMaterials: MaterialLibrary = {
  white: {
    kind: 'board',
    name: 'White',
    thicknesses: [8, 18, 25],
    appearance: { color: '#f4f3ef', texture: 'plain', roughness: 0.7 },
    grain: 'none',
    price: { perM2: 20, currency: 'EUR' },
  },
  chrome: { kind: 'finish', name: 'Chrome', appearance: { color: '#c0c4c8', metalness: 0.9, roughness: 0.2 } },
};

export function emptyDesign(): Design {
  return createDesign({
    id: 'd1',
    name: 'Test',
    now: '2026-10-12T00:00:00.000Z',
    newId: createIdGenerator('r'),
    materials: testMaterials,
    defaults: { carcass: 'white', front: 'white', back: 'white', interior: 'white', handle: 'chrome' },
  });
}

/** A 1000 × 2200 × 600 test unit at x = 1000 with two auto columns. */
export function unit(id: string, patch: Partial<Unit> = {}): Unit {
  return {
    kind: 'unit',
    id,
    name: 'Unit',
    position: { x: 1000, y: 0, z: 300 },
    rotation: 0,
    locked: false,
    template: { id: 'test.unit', version: 1 },
    params: { thickness: 18 },
    size: { w: 1000, h: 2200, d: 600 },
    materials: {},
    columns: [
      { id: `${id}-c1`, width: 'auto', items: [] },
      { id: `${id}-c2`, width: 'auto', items: [] },
    ],
    fronts: [],
    ...patch,
  };
}

export function withEntities(d: Design, ...entities: Unit[]): Design {
  return {
    ...d,
    entities: { ...d.entities, ...Object.fromEntries(entities.map((e) => [e.id, e])) },
    order: [...d.order, ...entities.map((e) => e.id)],
  };
}
