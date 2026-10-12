import { describe, expect, it } from 'vitest';
import { applyOperations } from './operations';
import { defaultDesign } from '../state/defaults';
import { obj } from '../test/fixtures';
import type { Design } from '../types';

let n = 0;
const ids = () => `new${++n}`;
const base = (): Design => ({
  ...defaultDesign(),
  objects: [obj('carcass', { id: 'c1', position: { x: 1000, y: 0, z: 300 } }), obj('door', { id: 'd1', position: { x: 2000, y: 0, z: 300 } })],
});

describe('applyOperations', () => {
  it('adds an object with defaults, clamped params and a new id', () => {
    const { design, results } = applyOperations(base(), [
      { op: 'add', templateId: 'carcass', params: { width: 99999, shelves: 2 }, position: { x: 500, z: 300 }, color: '#c8a06a' },
    ], ids);
    const added = design.objects[2];
    expect(results[0].ok).toBe(true);
    expect(results[0].id).toBe(added.id);
    expect(added).toMatchObject({ templateId: 'carcass', position: { x: 500, y: 0, z: 300 }, rotationY: 0, color: '#c8a06a' });
    expect(added.params).toMatchObject({ width: 2400, shelves: 2, height: 2200 });
    expect(results[0].message).toMatch(/clamped/);
  });

  it('updates params, position (partial), rotation and colors of an existing object', () => {
    const { design, results } = applyOperations(base(), [
      { op: 'update', id: 'c1', params: { width: 1000 }, position: { x: 1200 }, rotationY: 450, color: '#3a3d40', name: 'Left unit' },
    ], ids);
    const c = design.objects.find((o) => o.id === 'c1')!;
    expect(results[0].ok).toBe(true);
    expect(c).toMatchObject({ name: 'Left unit', position: { x: 1200, y: 0, z: 300 }, rotationY: 90, color: '#3a3d40' });
    expect(c.params.width).toBe(1000);
  });

  it('deletes, groups and ungroups', () => {
    let r = applyOperations(base(), [{ op: 'group', ids: ['c1', 'd1'] }], ids);
    const g = r.design.objects[0].groupId;
    expect(g).toBeTruthy();
    expect(r.design.objects[1].groupId).toBe(g);
    r = applyOperations(r.design, [{ op: 'ungroup', ids: ['c1'] }], ids);
    expect(r.design.objects[0].groupId).toBeUndefined();
    r = applyOperations(r.design, [{ op: 'delete', ids: ['d1'] }], ids);
    expect(r.design.objects.map((o) => o.id)).toEqual(['c1']);
  });

  it('changes the room', () => {
    const { design, results } = applyOperations(base(), [
      { op: 'set_room', height: 2700, floorKind: 'tiles', floorColor: '#bdbdbd', points: [{ x: 0, z: 0 }, { x: 3000, z: 0 }, { x: 3000, z: 3000 }, { x: 0, z: 3000 }] },
    ], ids);
    expect(results[0].ok).toBe(true);
    expect(design.room).toMatchObject({ height: 2700, floorKind: 'tiles', floorColor: '#bdbdbd' });
    expect(design.room.points).toHaveLength(4);
  });

  it('later operations can use ids created earlier in the same batch', () => {
    const { design, results } = applyOperations(base(), [
      { op: 'add', templateId: 'drawer', position: { x: 0, y: 0, z: 0 } },
      { op: 'update', id: 'new-ref', params: {} },
    ], () => 'new-ref');
    expect(results.every((r) => r.ok)).toBe(true);
    expect(design.objects).toHaveLength(3);
  });

  describe('rejects bad input without touching the design', () => {
    it.each([
      ['not an array', { op: 'add' }],
      ['unknown op', [{ op: 'explode_everything' }]],
      ['unknown template', [{ op: 'add', templateId: 'spaceship' }]],
      ['unknown id', [{ op: 'update', id: 'nope', params: { width: 500 } }]],
      ['bad color', [{ op: 'update', id: 'c1', color: 'red' }]],
      ['non-number param', [{ op: 'update', id: 'c1', params: { width: 'wide' } }]],
      ['too few room points', [{ op: 'set_room', points: [{ x: 0, z: 0 }] }]],
      ['bad floor kind', [{ op: 'set_room', floorKind: 'lava' }]],
      ['non-object op', ['add a carcass']],
    ])('%s', (_, ops) => {
      const d = base();
      const { design, results } = applyOperations(d, ops, ids);
      expect(design).toEqual(d);
      expect(results.some((r) => !r.ok)).toBe(true);
    });
  });

  it('applies the valid operations and reports the invalid ones in a mixed batch', () => {
    const { design, results } = applyOperations(base(), [
      { op: 'delete', ids: ['d1'] },
      { op: 'update', id: 'ghost', name: 'x' },
    ], ids);
    expect(design.objects.map((o) => o.id)).toEqual(['c1']);
    expect(results.map((r) => r.ok)).toEqual([true, false]);
  });

  it('ignores unknown param keys with a warning', () => {
    const { design, results } = applyOperations(base(), [{ op: 'update', id: 'c1', params: { colour: 3, width: 900 } }], ids);
    expect(design.objects[0].params.width).toBe(900);
    expect(design.objects[0].params).not.toHaveProperty('colour');
    expect(results[0].message).toMatch(/colour/);
  });
});

describe('limits on model values', () => {
  it('clamps absurd positions to ±100 m', () => {
    const { design } = applyOperations(base(), [{ op: 'update', id: 'c1', position: { x: 1e300, z: -1e9 } }], ids);
    expect(design.objects[0].position).toMatchObject({ x: 100000, z: -100000 });
  });

  it('rejects rooms with too many points and over-long names', () => {
    const many = Array.from({ length: 201 }, (_, i) => ({ x: i, z: i % 2 }));
    expect(applyOperations(base(), [{ op: 'set_room', points: many }], ids).results[0].ok).toBe(false);
    expect(applyOperations(base(), [{ op: 'update', id: 'c1', name: 'x'.repeat(201) }], ids).results[0].ok).toBe(false);
  });
});

describe('group validation', () => {
  it('rejects a group of one object listed twice', () => {
    expect(applyOperations(base(), [{ op: 'group', ids: ['c1', 'c1'] }], ids).results[0].ok).toBe(false);
  });
});
