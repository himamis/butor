import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from './store';
import { defaultDesign } from './defaults';

const s = () => useStore.getState();

beforeEach(() => {
  useStore.setState({ readOnly: false, exploded: false });
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
