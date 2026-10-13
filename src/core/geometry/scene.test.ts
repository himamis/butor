import { describe, expect, it } from 'vitest';
import { buildScene, frontRect, FRONT_GAP } from './scene';
import { testCatalog } from '../test/catalog';
import { emptyDesign, unit, withEntities } from '../test/designs';
import type { Design, Unit } from '../schema';
import type { UnitLayout, UnitTemplate } from '../catalog';

function design(): Design {
  return withEntities(
    emptyDesign(),
    unit('u1', {
      columns: [
        {
          id: 'c1',
          width: 'auto',
          items: [
            {
              id: 'dr1',
              template: { id: 'test.drawer' },
              y: 0,
              params: { height: 200, style: 'external' },
            },
          ],
        },
        {
          id: 'c2',
          width: 'auto',
          items: [{ id: 's1', template: { id: 'test.shelf' }, y: 800, params: {} }],
        },
      ],
      fronts: [
        {
          id: 'f1',
          template: { id: 'test.door' },
          columns: [1, 1],
          y: [0, 2200],
          params: { hinge: 'right' },
        },
        {
          id: 'f2',
          template: { id: 'test.drawer-front' },
          columns: [0, 0],
          y: [0, 250],
          params: {},
          item: 'dr1',
        },
      ],
    }),
  );
}

describe('buildScene', () => {
  it('builds carcass, items and fronts with stable, scoped part ids', () => {
    const s = buildScene(design(), testCatalog);
    const ids = s.entities.get('u1')!.parts.map((p) => p.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'u1/carcass/side-l',
        'u1/carcass/divider-0',
        'u1/item:dr1/box',
        'u1/item:s1/shelf',
        'u1/front:f1/door',
        'u1/front:f2/door',
      ]),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('places items in their column at column floor + y', () => {
    const s = buildScene(design(), testCatalog);
    const shelf = s.parts.get('u1/item:s1/shelf')!;
    expect(shelf.center.y).toBe(18 + 800 + 9);
    expect(shelf.center.x).toBeGreaterThan(0); // right column
  });

  it('a drawer front moves with its drawer', () => {
    const s = buildScene(design(), testCatalog);
    expect(s.parts.get('u1/front:f2/door')!.motion).toEqual(s.parts.get('u1/item:dr1/box')!.motion);
    expect(s.parts.get('u1/front:f1/door')!.motion).toMatchObject({ kind: 'hinge', id: 'f1' });
  });

  it('fronts cover their columns up to the middle of dividers, inset by the gap', () => {
    const d = design();
    const t = testCatalog.get('test.unit') as UnitTemplate;
    const u = d.entities.u1 as Unit;
    const r = frontRect(u, { columns: [0, 0], y: [0, 2200] }, t.layout(u, { trackFronts: false }) as UnitLayout);
    // unit 1000 wide, sides 18: column 1 inner 0..473 from −482; divider centre at −482 + 473 + 9 = 0
    expect(r).toEqual({ x0: -500 + FRONT_GAP, x1: 0 - FRONT_GAP, y0: FRONT_GAP, y1: 2200 - FRONT_GAP });
  });

  it('world boxes follow the entity placement and rotation', () => {
    const d = design();
    const rotated = { ...d, entities: { u1: { ...d.entities.u1!, rotation: 90 } } };
    const b = buildScene(rotated, testCatalog).entities.get('u1')!.bounds;
    expect(b.rotation).toBe(90);
    expect(Math.abs(b.center.x - 1000)).toBeLessThan(20); // fronts sit in front of the carcass, so the centre is slightly off
  });

  it('an entity whose build fails becomes one invalid part; the rest still builds', () => {
    const d = withEntities(
      design(),
      unit('bad', {
        position: { x: 3000, y: 0, z: 300 },
        template: { id: 'test.unit' },
        columns: [
          { id: 'cx', width: 5000, items: [] },
          { id: 'cy', width: 'auto', items: [] },
        ],
      }),
    );
    const s = buildScene(d, testCatalog);
    expect(s.entities.get('bad')!.parts).toEqual([
      expect.objectContaining({ role: 'invalid', invalid: expect.stringMatching(/narrower/) }),
    ]);
    expect(s.entities.get('u1')!.parts.length).toBeGreaterThan(5);
  });

  it('opaque entities render as an invalid box of their bounds', () => {
    const d = design();
    const withOpaque: Design = {
      ...d,
      entities: {
        ...d.entities,
        o1: {
          kind: 'opaque',
          id: 'o1',
          name: 'X',
          position: { x: 0, y: 0, z: 0 },
          rotation: 0,
          locked: false,
          raw: {},
          reason: 'unknown template',
          bounds: { w: 300, h: 400, d: 500 },
        },
      },
      order: [...d.order, 'o1'],
    };
    const p = buildScene(withOpaque, testCatalog).entities.get('o1')!.parts[0]!;
    expect(p).toMatchObject({ role: 'invalid', size: { x: 300, y: 400, z: 500 }, invalid: 'unknown template' });
  });

  it('unchanged entities are not rebuilt (cache by entity identity)', () => {
    const d = design();
    const a = buildScene(d, testCatalog).entities.get('u1')!.parts;
    const moved = { ...d, entities: { ...d.entities, u1: { ...d.entities.u1!, name: 'renamed' } } };
    expect(buildScene(d, testCatalog).entities.get('u1')!.parts).toBe(a);
    expect(buildScene(moved, testCatalog).entities.get('u1')!.parts).not.toBe(a);
  });
});
