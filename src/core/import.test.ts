import { describe, expect, it } from 'vitest';
import { importDesign } from './import';
import { testCatalog } from './test/catalog';
import { emptyDesign, unit, withEntities } from './test/designs';
import { checkDesign } from './invariants';

const json = (v: unknown) => JSON.parse(JSON.stringify(v));

describe('importDesign', () => {
  it('accepts a valid current-version design unchanged', () => {
    const d = withEntities(emptyDesign(), unit('u1'));
    const r = importDesign(json(d), testCatalog);
    expect(r).toMatchObject({ ok: true, warnings: [] });
    expect(r.ok && r.design).toEqual(d);
  });

  it('refuses other format versions (no migrations) and things that are not designs', () => {
    expect(importDesign({ ...json(emptyDesign()), schemaVersion: 99 }, testCatalog)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/different version/),
    });
    expect(importDesign('nope', testCatalog)).toMatchObject({ ok: false });
    expect(importDesign({ hello: 1 }, testCatalog)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/not a Butor design/),
    });
  });

  it('keeps entities with unknown templates as opaque entities (raw preserved), with a warning', () => {
    const d = json(withEntities(emptyDesign(), unit('u1'), unit('u2', { template: { id: 'future.unit' } })));
    const r = importDesign(d, testCatalog);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.design.entities.u2).toMatchObject({
      kind: 'opaque',
      raw: d.entities.u2,
      reason: expect.stringMatching(/unknown template "future.unit"/),
    });
    expect(r.design.entities.u1!.kind).toBe('unit');
    expect(r.warnings.join()).toMatch(/u2/);
    expect(checkDesign(r.design, testCatalog)).toEqual([]);
  });

  it('keeps structurally broken entities as opaque instead of dropping them', () => {
    const d = json(
      withEntities(
        emptyDesign(),
        unit('u1', {
          columns: [
            { id: 'c1', width: 2000, items: [] },
            { id: 'c2', width: 'auto', items: [] },
          ],
        }),
      ),
    );
    const r = importDesign(d, testCatalog);
    expect(r.ok && r.design.entities.u1!.kind).toBe('opaque');
    const broken = json(withEntities(emptyDesign(), unit('u1')));
    broken.entities.u1.size = 'big';
    const r2 = importDesign(broken, testCatalog);
    expect(r2.ok && r2.design.entities.u1!.kind).toBe('opaque');
  });

  it('drops invalid groups and repairs the order list, with warnings', () => {
    const d = json(withEntities(emptyDesign(), unit('u1')));
    d.groups = { g: { id: 'g', members: ['u1', 'ghost'] } };
    d.order = ['u1', 'u1', 'ghost'];
    const r = importDesign(d, testCatalog);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.design.groups).toEqual({});
    expect(r.design.order).toEqual(['u1']);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});
