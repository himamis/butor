import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from './store';
import { defaultDesign } from './defaults';
import { findOverlaps } from '../lib/geometry';

const s = () => useStore.getState();

beforeEach(() => {
  useStore.setState({ readOnly: false, exploded: false, measures: [], measureStart: null, tool: 'select' });
  s().loadDesign(defaultDesign());
});

describe('store', () => {
  it('group rotate is one undo step that restores every member', () => {
    s().addObject('carcass', { x: 400, y: 0, z: 400 });
    s().addObject('carcass', { x: 1200, y: 0, z: 400 });
    const [a, b] = s().design.objects;
    s().select(a.id, false);
    s().select(b.id, true);
    s().groupSelected();
    const before = s().design;
    s().rotateSelected(90);
    expect(s().design.objects.every((o) => o.rotationY === 90)).toBe(true);
    s().undo();
    expect(s().design).toBe(before);
  });

  it('a drag records exactly one undo step, even with commits inside it', () => {
    s().addObject('carcass', { x: 400, y: 0, z: 400 });
    const id = s().design.objects[0].id;
    const n = s().past.length;
    s().beginDrag();
    for (const c of ['#111111', '#222222', '#333333']) s().updateObjects([id], (o) => ({ ...o, color: c }));
    s().beginDrag(); // nested begin keeps the first snapshot
    s().endDrag();
    expect(s().past.length).toBe(n + 1);
    s().undo();
    expect(s().design.objects[0].color).not.toBe('#333333');
  });

  it('setParam clamps and a no-op edit adds no history', () => {
    s().addObject('carcass', { x: 400, y: 0, z: 400 });
    const id = s().design.objects[0].id;
    s().setParam(id, 'width', 99999);
    expect(s().design.objects[0].params.width).toBe(2400);
    const n = s().past.length;
    s().setParam(id, 'width', 5000);
    s().setParam(id, 'width', NaN);
    expect(s().past.length).toBe(n + 1); // NaN → default 800 is a real change; 5000 → 2400 is not
    expect(s().design.objects[0].params.width).toBe(800);
  });

  it('clicking a group member selects the whole group', () => {
    s().addObject('carcass', { x: 400, y: 0, z: 400 });
    s().addObject('carcass', { x: 1200, y: 0, z: 400 });
    const [a, b] = s().design.objects;
    s().select(a.id, false);
    s().select(b.id, true);
    s().groupSelected();
    s().select(null, false);
    s().select(b.id, false);
    expect(s().selection.sort()).toEqual([a.id, b.id].sort());
  });
});

describe('view state: open / explode', () => {
  it('toggling a door open or exploding never touches the design or undo history', () => {
    s().addObject('door', { x: 400, y: 0, z: 400 });
    s().addObject('carcass', { x: 1200, y: 0, z: 400 });
    const [door] = s().design.objects;
    const design = s().design;
    const past = s().past.length;
    s().toggleOpen(door.id);
    expect(s().openIds).toEqual([door.id]);
    s().toggleOpen(door.id);
    expect(s().openIds).toEqual([]);
    s().setUi({ exploded: true, explodeAmount: 0.8 });
    expect(s().design).toBe(design);
    expect(s().past.length).toBe(past);
  });

  it('open all opens only objects that have moving parts; close all closes them', () => {
    s().addObject('door', { x: 400, y: 0, z: 400 });
    s().addObject('carcass', { x: 1200, y: 0, z: 400 });
    s().addObject('drawer', { x: 2000, y: 0, z: 400 });
    const [door, , drawer] = s().design.objects;
    s().setOpenAll(true);
    expect(s().openIds.sort()).toEqual([door.id, drawer.id].sort());
    s().setOpenAll(false);
    expect(s().openIds).toEqual([]);
  });
});

describe('open state follows the design', () => {
  it('deleting an open unit forgets it, and undo brings it back closed', () => {
    s().addObject('door', { x: 400, y: 0, z: 400 });
    const id = s().design.objects[0].id;
    s().toggleOpen(id);
    s().select(id, false);
    s().deleteSelected();
    expect(s().openIds).toEqual([]);
    s().undo();
    expect(s().design.objects[0].id).toBe(id);
    expect(s().openIds).toEqual([]);
  });
});

describe('read-only viewer', () => {
  it('enterViewer shows the shared design and refuses every edit', () => {
    s().addObject('carcass', { x: 400, y: 0, z: 400 });
    const shared = { ...defaultDesign(), objects: [] };
    s().enterViewer(shared);
    expect(s().readOnly).toBe(true);
    expect(s().design).toBe(shared);
    expect(s().past).toEqual([]);

    s().addObject('carcass', { x: 0, y: 0, z: 0 });
    s().commit((d) => ({ ...d, objects: [] }));
    s().updateObjectsLive(['x'], (o) => o);
    s().setRoom((r) => ({ ...r, height: 9999 }));
    s().loadDesign({ ...defaultDesign(), objects: [] });
    expect(s().design).toBe(shared);
    expect(s().past).toEqual([]);
  });

  it('viewing actions still work', () => {
    s().addObject('door', { x: 400, y: 0, z: 400 });
    const d = s().design;
    s().enterViewer(d);
    s().setOpenAll(true);
    expect(s().openIds).toHaveLength(1);
    s().setUi({ exploded: true });
    expect(s().exploded).toBe(true);
  });
});

describe('copy and paste', () => {
  it('pastes a copy with a new id, offset, selected, as one undo step', () => {
    s().addObject('carcass', { x: 400, y: 0, z: 400 });
    const [a] = s().design.objects;
    s().select(a.id, false);
    s().copySelected();
    const past = s().past.length;
    s().paste();
    const objs = s().design.objects;
    expect(objs).toHaveLength(2);
    expect(objs[1].id).not.toBe(a.id);
    // lands flush to the right of the original (800 mm wide), not overlapping it
    expect(objs[1]).toMatchObject({ templateId: 'carcass', params: a.params, position: { x: 1200, y: 0, z: 400 } });
    expect(s().selection).toEqual([objs[1].id]);
    expect(s().past.length).toBe(past + 1);
  });

  it('repeated pastes line up side by side, without overlaps', () => {
    s().addObject('carcass', { x: 400, y: 0, z: 400 });
    s().copySelected();
    s().paste();
    s().paste();
    expect(s().design.objects.map((o) => o.position.x)).toEqual([400, 1200, 2000]);
    expect(findOverlaps(s().design.objects).size).toBe(0);
  });

  it('duplicate also places the copy flush beside the selection (group width for groups)', () => {
    s().addObject('carcass', { x: 400, y: 0, z: 400 });
    s().addObject('carcass', { x: 1200, y: 0, z: 400 });
    const [a, b] = s().design.objects;
    s().select(a.id, false);
    s().select(b.id, true);
    s().duplicateSelected();
    expect(s().design.objects.slice(2).map((o) => o.position.x)).toEqual([2000, 2800]);
  });

  it('copies the clipboard at copy time, not later edits', () => {
    s().addObject('carcass', { x: 400, y: 0, z: 400 });
    const id = s().design.objects[0].id;
    s().copySelected();
    s().setParam(id, 'width', 1200);
    s().paste();
    expect(s().design.objects[1].params.width).toBe(800);
  });

  it('keeps groups together with a fresh group id', () => {
    s().addObject('carcass', { x: 400, y: 0, z: 400 });
    s().addObject('carcass', { x: 1200, y: 0, z: 400 });
    const [a, b] = s().design.objects;
    s().select(a.id, false);
    s().select(b.id, true);
    s().groupSelected();
    s().copySelected();
    s().paste();
    const pasted = s().design.objects.slice(2);
    expect(pasted).toHaveLength(2);
    expect(pasted[0].groupId).toBeTruthy();
    expect(pasted[0].groupId).toBe(pasted[1].groupId);
    expect(pasted[0].groupId).not.toBe(a.groupId);
  });

  it('survives opening another design, and pastes nothing when empty', () => {
    useStore.setState({ clipboard: [] });
    s().paste();
    expect(s().design.objects).toHaveLength(0);
    s().addObject('door', { x: 400, y: 0, z: 400 });
    s().copySelected();
    s().loadDesign(defaultDesign());
    s().paste();
    expect(s().design.objects.map((o) => o.templateId)).toEqual(['door']);
  });

  it('pasted copies are unlocked, and the viewer cannot paste', () => {
    s().addObject('door', { x: 400, y: 0, z: 400 });
    s().updateObjects([s().design.objects[0].id], (o) => ({ ...o, locked: true }));
    s().copySelected();
    s().paste();
    expect(s().design.objects[1].locked).toBe(false);
    s().enterViewer(s().design);
    s().paste();
    expect(s().design.objects).toHaveLength(2);
  });
});

describe('measure tool', () => {
  it('two clicks make a measurement; the design and undo history are untouched; works in the viewer', () => {
    s().addObject('carcass', { x: 400, y: 0, z: 400 });
    s().enterViewer(s().design);
    const design = s().design;
    s().setUi({ tool: 'measure' });
    s().measureClick({ x: 800, y: 1000, z: 400 }, { x: 1, y: 0, z: 0 });
    expect(s().measureStart).not.toBeNull();
    s().measureClick({ x: 4000, y: 500, z: 100 }, { x: -1, y: 0, z: 0 });
    expect(s().measureStart).toBeNull();
    expect(s().measures).toHaveLength(1);
    expect(s().measures[0].distance).toBe(3200);
    expect(s().design).toBe(design);
    expect(s().past).toEqual([]);
  });

  it('cancel drops a half-finished measurement, clear removes all', () => {
    s().setUi({ tool: 'measure' });
    s().measureClick({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    s().measureClick({ x: 0, y: 2200, z: 0 }, { x: 0, y: -1, z: 0 });
    s().measureClick({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    s().cancelMeasure();
    expect(s().measureStart).toBeNull();
    expect(s().measures).toHaveLength(1);
    s().clearMeasures();
    expect(s().measures).toEqual([]);
  });
});

describe('history limits', () => {
  it('redo never grows the history past its cap', () => {
    s().addObject('carcass', { x: 400, y: 0, z: 400 });
    const id = s().design.objects[0].id;
    for (let i = 0; i < 105; i++) s().setParam(id, 'width', 200 + i);
    expect(s().past.length).toBe(100);
    s().undo();
    s().redo();
    expect(s().past.length).toBeLessThanOrEqual(100);
  });

  it('grouping needs two different objects', () => {
    s().addObject('carcass', { x: 400, y: 0, z: 400 });
    const id = s().design.objects[0].id;
    useStore.setState({ selection: [id, id] });
    s().groupSelected();
    expect(s().design.objects[0].groupId).toBeUndefined();
  });
});
