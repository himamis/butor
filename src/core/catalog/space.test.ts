import { describe, expect, it } from 'vitest';
import { freeFrontItems, freeFrontSpan, freeSpot, frontTakingItems, itemFrontSpan } from './space';
import { testCatalog } from '../test/catalog';

describe('freeSpot', () => {
  it('the floor of an empty column', () => {
    expect(freeSpot([], 200, 2000)).toBe(0);
  });
  it('the first gap that is tall enough, bottom first', () => {
    const spans = [
      { id: 'a', from: 0, to: 100 },
      { id: 'b', from: 250, to: 400 },
      { id: 'c', from: 900, to: 1000 },
    ];
    expect(freeSpot(spans, 150, 2000)).toBe(100);
    expect(freeSpot(spans, 151, 2000)).toBe(400);
    expect(freeSpot(spans, 600, 2000)).toBe(1000);
  });
  it('null when it fits nowhere', () => {
    expect(freeSpot([{ id: 'a', from: 0, to: 1900 }], 200, 2000)).toBeNull();
  });
});

describe('itemFrontSpan', () => {
  const layout = { floorY: 18 } as Parameters<typeof itemFrontSpan>[2];
  const unit = (fronts: { y: [number, number] }[]) =>
    ({
      size: { w: 600, h: 2000, d: 600 },
      fronts: fronts.map((f) => ({ ...f, columns: [0, 0] })),
    }) as unknown as Parameters<typeof itemFrontSpan>[0];
  it('the box plus a reveal, within the unit', () => {
    expect(itemFrontSpan(unit([]), 0, layout, { y: 0, height: 200 })).toEqual([8, 228]);
  });
  it('stacked drawers: each front starts where the one below ends', () => {
    expect(itemFrontSpan(unit([{ y: [8, 228] }]), 0, layout, { y: 200, height: 200 })).toEqual([228, 428]);
  });
  it('stops below a front above it', () => {
    expect(itemFrontSpan(unit([{ y: [420, 2000] }]), 0, layout, { y: 200, height: 200 })).toEqual([208, 420]);
  });
  it('fronts over other columns do not matter', () => {
    const u = unit([]);
    (u.fronts as unknown[]).push({ y: [0, 2000], columns: [1, 1] });
    expect(itemFrontSpan(u, 0, layout, { y: 0, height: 200 })).toEqual([8, 228]);
  });
  it('null when the drawer is already covered', () => {
    expect(itemFrontSpan(unit([{ y: [0, 2000] }]), 0, layout, { y: 200, height: 200 })).toBeNull();
  });
});

describe('front placement from catalog declarations', () => {
  const layout = {
    floorY: 18,
    columns: [{ x0: 0, width: 500 }],
    inner: { w: 500, h: 1964, d: 500 },
  } as unknown as Parameters<typeof freeFrontItems>[1];
  const unit = (
    items: { id: string; y: number; style: string }[],
    fronts: { id: string; y: [number, number]; item?: string }[] = [],
  ) =>
    ({
      size: { w: 600, h: 2000, d: 600 },
      columns: [
        {
          id: 'c',
          width: 'auto',
          items: items.map((i) => ({
            id: i.id,
            template: { id: 'test.drawer' },
            y: i.y,
            params: { height: 200, style: i.style },
          })),
        },
      ],
      fronts: fronts.map((f) => ({ ...f, template: { id: 'test.drawer-front' }, columns: [0, 0], params: {} })),
    }) as unknown as Parameters<typeof freeFrontItems>[0];

  it('items that take a front (per their template) and have none, bottom first', () => {
    const u = unit(
      [
        { id: 'top', y: 600, style: 'external' },
        { id: 'inside', y: 300, style: 'internal' },
        { id: 'low', y: 0, style: 'external' },
        { id: 'taken', y: 900, style: 'external' },
      ],
      [{ id: 'f', y: [910, 1130], item: 'taken' }],
    );
    expect(freeFrontItems(u, layout, testCatalog).map((s) => s.item)).toEqual(['low', 'top']);
    expect(freeFrontItems(u, layout, testCatalog)[0]).toEqual({ item: 'low', column: 0, y: 0, height: 200 });
    expect(frontTakingItems(testCatalog)).toEqual(['drawer']);
  });

  it('free span for an ordinary front: the one at a height, or the tallest', () => {
    const u = unit([], [{ id: 'f', y: [0, 500] }]);
    expect(freeFrontSpan(u, [0, 0])).toEqual([500, 2000]);
    expect(freeFrontSpan(u, [0, 0], 1000)).toEqual([500, 2000]);
    expect(freeFrontSpan(u, [0, 0], 200)).toBeNull();
  });
});
