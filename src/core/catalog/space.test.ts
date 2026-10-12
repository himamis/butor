import { describe, expect, it } from 'vitest';
import { drawerFrontSpan, freeSpot } from './space';

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

describe('drawerFrontSpan', () => {
  const layout = { floorY: 18 } as Parameters<typeof drawerFrontSpan>[2];
  const unit = (fronts: { y: [number, number] }[]) =>
    ({
      size: { w: 600, h: 2000, d: 600 },
      fronts: fronts.map((f) => ({ ...f, columns: [0, 0] })),
    }) as unknown as Parameters<typeof drawerFrontSpan>[0];
  it('the box plus a reveal, within the unit', () => {
    expect(drawerFrontSpan(unit([]), 0, layout, { y: 0, height: 200 })).toEqual([8, 228]);
  });
  it('stacked drawers: each front starts where the one below ends', () => {
    expect(drawerFrontSpan(unit([{ y: [8, 228] }]), 0, layout, { y: 200, height: 200 })).toEqual([228, 428]);
  });
  it('stops below a front above it', () => {
    expect(drawerFrontSpan(unit([{ y: [420, 2000] }]), 0, layout, { y: 200, height: 200 })).toEqual([208, 420]);
  });
  it('fronts over other columns do not matter', () => {
    const u = unit([]);
    (u.fronts as unknown[]).push({ y: [0, 2000], columns: [1, 1] });
    expect(drawerFrontSpan(u, 0, layout, { y: 0, height: 200 })).toEqual([8, 228]);
  });
  it('null when the drawer is already covered', () => {
    expect(drawerFrontSpan(unit([{ y: [0, 2000] }]), 0, layout, { y: 200, height: 200 })).toBeNull();
  });
});
