import { describe, expect, it } from 'vitest';
import { checkDesign, createIdGenerator, describeParams, movePoint, type Design } from '../core';
import { catalog, CATEGORIES, instantiatePreset, LIBRARY, PRESETS, searchLibrary, TEMPLATES } from './index';
import { add, ctx, freshDesign, sceneOf } from './test-helpers';

describe('presets', () => {
  for (const p of PRESETS) {
    it(`${p.id} inserts cleanly (twice) and builds without invalid parts`, () => {
      let d: Design = freshDesign();
      const c = ctx(p.id);
      const ids = createIdGenerator(`${p.id}-`);
      for (const x of [600, 3000]) {
        const r = add(d, instantiatePreset(p, ids, { x, z: 700 }), c);
        expect(r.results[0]!.message).not.toMatch(/refused|not|invalid/);
        expect(r.ok).toBe(true);
        d = r.doc;
      }
      expect(checkDesign(d, catalog)).toEqual([]);
      const scene = sceneOf(d);
      for (const e of scene.entities.values()) expect(e.parts.filter((x) => x.role === 'invalid')).toEqual([]);
    });
  }

  it('drawer fronts in presets move with their drawers', () => {
    const p = PRESETS.find((x) => x.id === 'preset.drawer-unit')!;
    const d = add(freshDesign(), instantiatePreset(p, createIdGenerator('x'), { x: 500, z: 500 })).doc;
    const parts = [...sceneOf(d).parts.values()];
    const fronts = parts.filter((x) => x.label.startsWith('Drawer front'));
    expect(fronts).toHaveLength(4);
    for (const f of fronts) {
      expect(f.motion?.kind).toBe('slide');
      expect(parts.some((x) => x.role === 'drawer-box' && x.motion?.id === f.motion?.id)).toBe(true);
    }
  });
});

describe('library', () => {
  it('every category has entries; every entry has a description and unique id', () => {
    for (const c of CATEGORIES) expect(LIBRARY.some((e) => e.category === c.id)).toBe(true);
    expect(new Set(LIBRARY.map((e) => e.id)).size).toBe(LIBRARY.length);
    for (const e of LIBRARY) expect(e.description.length).toBeGreaterThan(15);
  });

  it('search: all words must match name/description/tags; category filter', () => {
    expect(searchLibrary('sliding door').map((e) => e.id)).toEqual(
      expect.arrayContaining(['front.sliding', 'preset.wardrobe-sliding']),
    );
    expect(searchLibrary('closet').length).toBeGreaterThan(0);
    expect(searchLibrary('door', 'Interior')).toEqual([]);
    expect(searchLibrary('', 'Fronts').every((e) => e.category === 'Fronts')).toBe(true);
    expect(searchLibrary('zzz')).toEqual([]);
  });

  it('every param has a label and choice options are strings', () => {
    for (const t of TEMPLATES) {
      for (const p of describeParams(t.params)) {
        expect(p.label.length).toBeGreaterThan(0);
        if (p.kind === 'choice') for (const k of Object.keys(p.options)) expect(typeof k).toBe('string');
      }
    }
  });
});

describe('doors and drawers move the right way', () => {
  const unitWith = (fronts: unknown[], items: unknown[] = []) =>
    add(freshDesign(), {
      kind: 'unit',
      template: { id: 'unit.standard' },
      position: { x: 1000, z: 400 },
      columns: [{ width: 'auto', items: items as never }],
      fronts: fronts as never,
    }).doc;

  it.each(['left', 'right'])('a %s-hinged door swings its free edge outward', (hinge) => {
    const d = unitWith([{ template: { id: 'front.door' }, columns: [0, 0], y: [0, 2200], params: { hinge } }]);
    const door = [...sceneOf(d).parts.values()].find((x) => x.label === 'Door')!;
    const freeX = hinge === 'left' ? door.center.x + door.size.x / 2 : door.center.x - door.size.x / 2;
    expect(movePoint({ x: freeX, y: 1000, z: door.center.z }, door.motion!, 1).z).toBeGreaterThan(door.center.z + 300);
  });

  it('a flap lifts outward and up; a drawer slides forward', () => {
    const d = unitWith(
      [{ template: { id: 'front.flap' }, columns: [0, 0], y: [1200, 2200] }],
      [{ id: 'dr', template: { id: 'item.drawer' }, y: 0, params: { style: 'internal' } }],
    );
    const parts = [...sceneOf(d).parts.values()];
    const flap = parts.find((x) => x.label === 'Flap')!;
    const bottom = { x: 0, y: flap.center.y - flap.size.y / 2, z: flap.center.z };
    const opened = movePoint(bottom, flap.motion!, 1);
    expect(opened.z).toBeGreaterThan(bottom.z + 500);
    expect(opened.y).toBeGreaterThan(bottom.y + 500);
    const box = parts.find((x) => x.role === 'drawer-box')!;
    expect(movePoint(box.center, box.motion!, 1).z).toBeGreaterThan(box.center.z + 300);
  });
});
