import { describe, expect, it } from 'vitest';
import { applyTransaction, createIdGenerator, type Design, type Op } from '../../core';
import { testCatalog } from '../../core/test/catalog';
import { emptyDesign } from '../../core/test/designs';
import type { Hit } from '../../render/Renderer';
import type { EditorPort, ToolPointer, ViewPort } from '../types';
import { roomHandles, RoomTool } from './room';

/** A top-down view where client px = world mm (x → x, y → z). */
function harness(start: Design) {
  let committed = start;
  let shown: Design | null = null;
  let status: string | null = null;
  const ctx = {
    newId: createIdGenerator('t'),
    now: () => '2026-10-12T00:00:00.000Z',
    catalog: testCatalog,
    mode: 'strict' as const,
  };
  const editor = {
    design: () => committed,
    apply: (ops: Op[], label: string) => {
      const r = applyTransaction(committed, { label, ops }, ctx);
      if (r.ok) committed = r.doc;
      return r;
    },
    preview: (ops: Op[], label: string) => {
      const r = applyTransaction(committed, { label, ops }, ctx);
      shown = r.ok ? r.doc : null;
      return r;
    },
    commitPreview: () => {
      if (shown) committed = shown;
      shown = null;
    },
    cancelPreview: () => {
      shown = null;
    },
    grid: () => 10,
    snapping: () => true,
    setStatus: (s: string | null) => {
      status = s;
    },
  } as unknown as EditorPort;
  const view = {
    ray: (x: number, y: number) => ({ origin: { x, y: 10_000, z: y }, dir: { x: 0, y: -1, z: 0 } }),
    toScreen: (p: { x: number; z: number }) => ({ x: p.x, y: p.z }),
  } as unknown as ViewPort;
  const tool = new RoomTool(editor, view);
  const ptr = (x: number, y: number, handle?: string, alt = false): ToolPointer => ({
    x,
    y,
    hit: handle ? ({ kind: 'handle', handle, point: { x, y: 0, z: y }, normal: { x: 0, y: 1, z: 0 } } as Hit) : null,
    shift: false,
    alt,
    mod: false,
  });
  return { tool, ptr, design: () => committed, status: () => status };
}

describe('room handles', () => {
  it('one per corner, wall and opening', () => {
    const d = emptyDesign();
    const key = Object.keys(d.room.walls)[0]!;
    const room = {
      ...d.room,
      openings: [{ id: 'w1', wall: key, kind: 'window' as const, offset: 1000, width: 1200, height: 1200, sill: 900 }],
    };
    const hs = roomHandles(room);
    expect(hs.map((h) => h.id.split(':')[0])).toEqual([
      ...Array(4).fill('corner'),
      ...Array(4).fill('wall'),
      'opening',
    ]);
    const o = hs.find((h) => h.id === 'opening:w1')!;
    expect(o.position.x).toBeCloseTo(1600); // middle of the window along the first wall
    expect(o.position.z).toBeGreaterThan(0); // just inside the room
  });
});

describe('RoomTool', () => {
  it('drags a corner with grid snapping and squares it to its neighbours', () => {
    const h = harness(emptyDesign());
    const c = h.design().room.corners[2]!; // (4000, 3500)
    expect(h.tool.down(h.ptr(4000, 3500, `corner:${c.id}`))).toBe(true);
    h.tool.drag(h.ptr(4523, 3502));
    h.tool.dragEnd(h.ptr(4523, 3502), false);
    const moved = h.design().room.corners[2]!;
    expect(moved).toMatchObject({ x: 4520, z: 3500 }); // x on the 10 mm grid, z squared to the next corner
  });

  it('drags a wall along its normal, moving both its corners', () => {
    const h = harness(emptyDesign());
    const [a, b] = h.design().room.corners;
    h.tool.down(h.ptr(2000, 0, `wall:${a!.id}>${b!.id}`));
    h.tool.drag(h.ptr(2100, -304));
    h.tool.dragEnd(null, false);
    const cs = h.design().room.corners;
    expect(cs[0]).toMatchObject({ x: 0, z: -300 });
    expect(cs[1]).toMatchObject({ x: 4000, z: -300 });
  });

  it('a self-intersecting room is refused: the drag ends with a message and nothing changes', () => {
    const h = harness(emptyDesign());
    const before = h.design();
    const c = before.room.corners[2]!;
    h.tool.down(h.ptr(4000, 3500, `corner:${c.id}`));
    h.tool.drag(h.ptr(-1000, -2000, undefined, true));
    h.tool.dragEnd(null, false);
    expect(h.design()).toBe(before);
    expect(h.status()).toBeTruthy();
  });

  it('slides an opening along its wall, kept within the wall', () => {
    const h = harness(emptyDesign());
    const key = Object.keys(h.design().room.walls)[0]!;
    const r = applyTransaction(
      h.design(),
      {
        label: 'w',
        ops: [
          {
            type: 'room.opening.add',
            opening: { id: 'w1', wall: key, kind: 'window', offset: 1000, width: 1200, height: 1200, sill: 900 },
          },
        ],
      },
      { newId: createIdGenerator('x'), now: () => '', catalog: testCatalog, mode: 'strict' },
    );
    const h2 = harness(r.doc);
    h2.tool.down(h2.ptr(1600, 180, 'opening:w1'));
    h2.tool.drag(h2.ptr(9000, 180));
    h2.tool.dragEnd(null, false);
    expect(h2.design().room.openings[0]!.offset).toBe(2800); // 4000 − 1200: stops at the wall's end
  });

  it('double-click adds a corner in the middle of a wall, and removes a corner', () => {
    const h = harness(emptyDesign());
    const [a, b] = h.design().room.corners;
    h.tool.doubleClick(h.ptr(2000, 0, `wall:${a!.id}>${b!.id}`));
    expect(h.design().room.corners).toHaveLength(5);
    expect(h.design().room.corners[1]).toMatchObject({ x: 2000, z: 0 });
    h.tool.doubleClick(h.ptr(2000, 0, `corner:${h.design().room.corners[1]!.id}`));
    expect(h.design().room.corners).toHaveLength(4);
  });
});
