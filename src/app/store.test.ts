import { beforeEach, describe, expect, it } from 'vitest';
import { createIdGenerator, type Unit } from '../core';
import { instantiatePreset, PRESETS } from '../catalog';
import { newDesign, useApp } from './store';

const s = () => useApp.getState();
const addPreset = (id: string, x: number) => {
  const p = PRESETS.find((q) => q.id === id)!;
  const r = s().apply(
    [{ type: 'entity.add', entity: instantiatePreset(p, createIdGenerator(`${id}-${x}-`), { x, z: 300 }) }],
    'Add',
  );
  expect(r.ok).toBe(true);
  return r.results[0]!.created![0]!;
};

beforeEach(() => s().load(newDesign()));

describe('editor store', () => {
  it('a previewed drag commits as exactly one undo step', () => {
    const id = addPreset('preset.bookcase', 1000);
    const before = s().history.past.length;
    for (let x = 1; x <= 20; x++)
      s().preview([{ type: 'entity.move', ids: [id], delta: { x: x * 10, y: 0, z: 0 } }], 'Move');
    expect(s().design.entities[id]!.position.x).toBe(1000); // not committed yet
    s().commitPreview();
    expect(s().design.entities[id]!.position.x).toBe(1200);
    expect(s().history.past.length).toBe(before + 1);
    s().undo();
    expect(s().design.entities[id]!.position.x).toBe(1000);
  });

  it('cancelling a preview restores the committed design', () => {
    const id = addPreset('preset.bookcase', 1000);
    s().preview([{ type: 'entity.move', ids: [id], delta: { x: 500, y: 0, z: 0 } }], 'Move');
    s().cancelPreview();
    expect(s().previewDoc).toBeNull();
    expect(s().scene.entities.get(id)!.bounds.center.x).toBeCloseTo(1000);
  });

  it('undo/redo keep ids', () => {
    const id = addPreset('preset.bookcase', 1000);
    s().undo();
    expect(s().design.entities[id]).toBeUndefined();
    s().redo();
    expect(s().design.entities[id]).toBeDefined();
  });

  it('selecting a group member selects the whole group', () => {
    const a = addPreset('preset.bookcase', 1000);
    const b = addPreset('preset.bookcase', 1800);
    s().select([a, b]);
    s().groupSelection();
    s().select([b]);
    expect(s().selection.entities.sort()).toEqual([a, b].sort());
  });

  it('paste lines copies up flush to the right, with fresh ids, as one step each', () => {
    const a = addPreset('preset.drawer-unit', 1000); // 600 wide
    s().select([a]);
    s().copy();
    s().paste();
    s().paste();
    const xs = s().design.order.map((id) => s().design.entities[id]!.position.x);
    expect(xs).toEqual([1000, 1600, 2200]);
    expect(new Set(s().design.order).size).toBe(3);
    // drawer fronts of the copies still move with the copies' drawers
    const copy = s().design.entities[s().design.order[1]!] as Unit;
    const items = new Set(copy.columns.flatMap((c) => c.items.map((i) => i.id)));
    expect(copy.fronts.every((f) => !f.item || items.has(f.item))).toBe(true);
  });

  it('deleting an inner selection removes just that item', () => {
    const a = addPreset('preset.bookcase', 1000);
    const unit = s().design.entities[a] as Unit;
    const shelf = unit.columns[0]!.items[0]!;
    s().selectInner({ entity: a, kind: 'item', id: shelf.id });
    s().removeSelection();
    const after = s().design.entities[a] as Unit;
    expect(after.columns[0]!.items.map((i) => i.id)).not.toContain(shelf.id);
    expect(after.columns[0]!.items.length).toBe(unit.columns[0]!.items.length - 1);
  });
});
