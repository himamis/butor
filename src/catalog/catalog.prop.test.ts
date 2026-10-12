import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { describeParams, obbIntersects, type AnyTemplate, type Design, type ScenePart } from '../core';
import { catalog, TEMPLATES } from './index';
import { add, freshDesign, sceneOf } from './test-helpers';

/**
 * Catalog-wide invariants (docs/v2/04-catalog.md#catalog-wide-invariants) for random valid params of
 * every template, placed the way the app places them: units in the room, items in a unit column,
 * fronts on a unit, free parts in the room.
 */

/** Random valid params for a template, from its param descriptions. */
function paramsArb(t: AnyTemplate) {
  const shape: Record<string, fc.Arbitrary<unknown>> = {};
  for (const p of describeParams(t.params)) {
    if (p.kind === 'mm') shape[p.key] = fc.integer({ min: Math.ceil(p.min), max: Math.floor(p.max) });
    else if (p.kind === 'count') shape[p.key] = fc.integer({ min: p.min, max: p.max });
    else if (p.kind === 'choice') shape[p.key] = fc.constantFrom(...Object.keys(p.options));
    else if (p.kind === 'toggle') shape[p.key] = fc.boolean();
    else shape[p.key] = fc.constant(p.default);
  }
  return fc.record(shape);
}

const BOARD_ROLES = new Set(['carcass', 'back', 'divider', 'shelf', 'front', 'drawer-box', 'trim']);
const TOL = 0.01;

function inside(p: ScenePart, box: { x: [number, number]; y: [number, number]; z: [number, number] }) {
  for (const k of ['x', 'y', 'z'] as const) {
    const lo = p.center[k] - p.size[k] / 2;
    const hi = p.center[k] + p.size[k] / 2;
    if (lo < box[k][0] - TOL || hi > box[k][1] + TOL)
      return `${p.id} ${k} [${lo}, ${hi}] outside [${box[k][0]}, ${box[k][1]}]`;
  }
  return null;
}

/** Board parts of one entity must not intersect each other by more than 0.5 mm (closed state). */
function selfIntersections(parts: ScenePart[]): string[] {
  const boards = parts.filter((p) => BOARD_ROLES.has(p.role));
  const out: string[] = [];
  for (let i = 0; i < boards.length; i++) {
    for (let j = i + 1; j < boards.length; j++) {
      if (obbIntersects(boards[i]!.obb, boards[j]!.obb, 0.5)) out.push(`${boards[i]!.id} × ${boards[j]!.id}`);
    }
  }
  return out;
}

function commonChecks(parts: ScenePart[]) {
  expect(parts.filter((p) => p.role === 'invalid').map((p) => p.invalid)).toEqual([]);
  for (const p of parts) {
    for (const v of [p.size.x, p.size.y, p.size.z]) expect(v).toBeGreaterThan(0);
    if (BOARD_ROLES.has(p.role)) {
      expect(p.material.thickness, `${p.id} has a thickness`).toBeGreaterThan(0);
      expect(p.grainAlong, `${p.id} has a grain axis`).toBeDefined();
    }
  }
  expect(selfIntersections(parts)).toEqual([]);
  // every moving group shares one motion object shape per id
  const byId = new Map<string, string>();
  for (const p of parts)
    if (p.motion) {
      const key = JSON.stringify(p.motion);
      expect(byId.get(p.motion.id) ?? key, `motion ${p.motion.id} consistent`).toBe(key);
      byId.set(p.motion.id, key);
    }
}

const unitInput = (extra: Record<string, unknown> = {}) => ({
  kind: 'unit' as const,
  template: { id: 'unit.standard' },
  position: { x: 2000, z: 400 },
  size: { w: 1200, h: 2200, d: 600 },
  columns: [{ width: 'auto' as const }, { width: 'auto' as const }],
  ...extra,
});

const kinds = (k: AnyTemplate['kind']) => TEMPLATES.filter((t) => t.kind === k);

describe('catalog invariants (random params)', () => {
  for (const t of kinds('unit')) {
    it(`${t.id}: parts stay inside the unit and do not intersect`, () => {
      let built = 0;
      const limits = (t as Extract<AnyTemplate, { kind: 'unit' }>).sizeLimits;
      fc.assert(
        fc.property(
          paramsArb(t),
          fc.integer({ min: limits.w[0], max: limits.w[1] }),
          fc.integer({ min: limits.h[0], max: limits.h[1] }),
          fc.integer({ min: limits.d[0], max: limits.d[1] }),
          fc.integer({ min: 1, max: 3 }),
          (params, w, h, d, cols) => {
            const columns =
              t.id === 'unit.corner'
                ? [{ width: 'auto' as const }]
                : Array.from({ length: cols }, () => ({ width: 'auto' as const }));
            const r = add(freshDesign(), {
              kind: 'unit',
              template: { id: t.id },
              position: { x: 2000, z: 1500 },
              params,
              size: { w, h, d },
              columns,
            });
            if (!r.ok) return; // e.g. too many columns for a narrow unit — refused by the ops, fine
            built++;
            const parts = [...sceneOf(r.doc).parts.values()];
            commonChecks(parts);
            for (const p of parts) expect(inside(p, { x: [-w / 2, w / 2], y: [0, h], z: [-d / 2, d / 2] })).toBeNull();
          },
        ),
        { numRuns: 60 },
      );
      expect(built, 'most random units should build').toBeGreaterThanOrEqual(24);
    });
  }

  for (const t of kinds('item')) {
    it(`${t.id}: fits its column and moves forward`, () => {
      let built = 0;
      fc.assert(
        fc.property(
          paramsArb(t),
          fc.integer({ min: 0, max: 1200 }),
          fc.integer({ min: 350, max: 800 }),
          (params, y, depth) => {
            const r = add(
              freshDesign(),
              unitInput({
                size: { w: 1200, h: 2200, d: depth },
                columns: [
                  { width: 'auto', items: [{ id: 'it', template: { id: t.id }, y, params }] },
                  { width: 'auto' },
                ],
              }),
            );
            if (!r.ok) return; // item taller than the space above y — refused
            built++;
            const scene = sceneOf(r.doc);
            const parts = [...scene.parts.values()];
            commonChecks(parts);
            const mine = parts.filter((p) => p.id.includes('/item:it/'));
            expect(mine.length).toBeGreaterThan(0);
            for (const p of mine) {
              if (p.role === 'front' || p.role === 'handle') continue; // internal fronts/handles: checked against the unit
              expect(
                inside(p, { x: [-600 + 18, 0 - 9 + 0.01], y: [18, 2200 - 18], z: [-depth / 2, depth / 2] }),
              ).toBeNull();
            }
            for (const p of mine.filter((x) => x.motion?.kind === 'slide' && x.motion.offset.z !== 0))
              expect(p.motion!.kind === 'slide' && p.motion!.offset.z).toBeGreaterThan(0);
          },
        ),
        { numRuns: 60 },
      );
      expect(built, 'most random items should fit').toBeGreaterThanOrEqual(24);
    });
  }

  for (const t of kinds('front')) {
    it(`${t.id}: stays on the unit front and inside its height`, () => {
      let built = 0;
      fc.assert(
        fc.property(
          paramsArb(t),
          fc.integer({ min: 0, max: 1 }),
          fc.integer({ min: 0, max: 1000 }),
          fc.integer({ min: 600, max: 1200 }),
          (params, c1, y0, span) => {
            const isDrawer = t.id === 'front.drawer';
            const items = isDrawer
              ? [{ id: 'dr', template: { id: 'item.drawer' }, y: 0, params: { height: 300 } }]
              : [];
            const fronts = [
              {
                template: { id: t.id },
                columns: [0, isDrawer ? 0 : c1],
                y: isDrawer ? [0, 330] : [y0, Math.min(2200, y0 + span)],
                params,
                ...(isDrawer ? { drawer: 'dr' } : {}),
              },
            ];
            const r = add(freshDesign(), unitInput({ columns: [{ width: 'auto', items }, { width: 'auto' }], fronts }));
            if (!r.ok) return;
            built++;
            const parts = [...sceneOf(r.doc).parts.values()];
            commonChecks(parts);
            for (const p of parts.filter((x) => x.role === 'front'))
              expect(inside(p, { x: [-600 - 100, 600 + 100], y: [0, 2200], z: [-300, 300 + 40] })).toBeNull();
          },
        ),
        { numRuns: 60 },
      );
      expect(built, 'most random fronts should fit').toBeGreaterThanOrEqual(24);
    });
  }

  for (const t of kinds('part')) {
    it(`${t.id}: parts fill its stated size`, () => {
      fc.assert(
        fc.property(paramsArb(t), (params) => {
          const r = add(freshDesign(), {
            kind: 'part',
            template: { id: t.id },
            position: { x: 2000, z: 1500 },
            params,
          });
          expect(r.ok).toBe(true);
          const parts = [...sceneOf(r.doc).parts.values()];
          commonChecks(parts);
          const s = (t as Extract<AnyTemplate, { kind: 'part' }>).size(
            r.doc.entities[r.doc.order[0]!]!.kind === 'part'
              ? (r.doc.entities[r.doc.order[0]!] as { params: Record<string, unknown> }).params
              : {},
          );
          for (const p of parts)
            expect(inside(p, { x: [-s.w / 2, s.w / 2], y: [0, s.h], z: [-s.d / 2, s.d / 2] })).toBeNull();
        }),
        { numRuns: 40 },
      );
    });
  }

  it('builds are deterministic', () => {
    const d: Design = add(
      freshDesign(),
      unitInput({ fronts: [{ template: { id: 'front.double-door' }, columns: [0, 1], y: [0, 2200] }] }),
    ).doc;
    const a = JSON.stringify([...sceneOf(d).parts.values()]);
    const copy = JSON.parse(JSON.stringify(d)) as Design; // new objects → no cache
    expect(JSON.stringify([...sceneOf(copy).parts.values()])).toBe(a);
  });
});

describe('golden snapshots (bump the template version when these change)', () => {
  for (const t of TEMPLATES) {
    it(`${t.id}@v${t.version}`, () => {
      let entity: Parameters<typeof add>[1];
      if (t.kind === 'unit') entity = { kind: 'unit', template: { id: t.id }, position: { x: 0, z: 0 } };
      else if (t.kind === 'part') entity = { kind: 'part', template: { id: t.id }, position: { x: 0, z: 0 } };
      else if (t.kind === 'item')
        entity = unitInput({
          position: { x: 0, z: 0 },
          columns: [{ width: 'auto', items: [{ id: 'it', template: { id: t.id }, y: 100 }] }],
        });
      else if (t.id === 'front.drawer')
        entity = unitInput({
          position: { x: 0, z: 0 },
          columns: [{ width: 'auto', items: [{ id: 'dr', template: { id: 'item.drawer' }, y: 0 }] }],
          fronts: [{ template: { id: t.id }, columns: [0, 0], y: [0, 240], drawer: 'dr' }],
        });
      else
        entity = unitInput({
          position: { x: 0, z: 0 },
          columns: [{ width: 'auto' }],
          fronts: [{ template: { id: t.id }, columns: [0, 0], y: [0, 2200] }],
        });
      const r = add(freshDesign(), entity);
      expect(r.ok).toBe(true);
      const parts = [...sceneOf(r.doc).parts.values()]
        .filter(
          (p) => t.kind === 'unit' || t.kind === 'part' || p.id.includes(t.kind === 'item' ? '/item:' : '/front:'),
        )
        .map(({ obb: _obb, entity: _e, id, ...rest }) => ({
          ...rest,
          id: id.replace(/^[^/]+\//, '').replace(/front:[^/]+/, 'front'),
        }));
      expect(parts).toMatchSnapshot();
    });
  }
});

// Keep the registry referenced so tree-shaking in test runs never drops templates.
void catalog;
