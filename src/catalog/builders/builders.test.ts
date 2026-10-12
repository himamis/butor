import { describe, expect, it } from 'vitest';
import { boardPart } from './board';
import { hingesFor, runnerLength } from './hardware';
import { CUTOUT_MARGIN, frontOutline, polygonArea } from './cutout';

describe('boardPart', () => {
  it('builds a box from extents, with material, thickness and grain', () => {
    const p = boardPart({
      key: 'side',
      label: 'Side panel',
      role: 'carcass',
      material: 'white',
      thickness: 18,
      x: [-500, -482],
      y: [0, 2200],
      z: [-300, 300],
      grain: 'y',
    });
    expect(p).toMatchObject({
      center: { x: -491, y: 1100, z: 0 },
      size: { x: 18, y: 2200, z: 600 },
      material: { id: 'white', thickness: 18 },
      grainAlong: 'y',
      shape: { kind: 'box' },
    });
  });
});

describe('hardware rules', () => {
  it('hinges by door height', () => {
    expect([700, 1000, 1001, 1500, 1501, 2200, 2201].map(hingesFor)).toEqual([2, 2, 3, 3, 4, 4, 5]);
  });
  it('runners in 50 mm steps that fit the depth, at least 250', () => {
    expect([200, 274, 450, 499, 520, 700].map(runnerLength)).toEqual([250, 250, 450, 450, 500, 700]);
  });
});

describe('frontOutline (grip cutouts)', () => {
  it('a rectangle without a cutout', () => {
    const { outline, holes } = frontOutline(400, 600);
    expect(holes).toEqual([]);
    expect(Math.abs(polygonArea(outline))).toBe(240_000);
  });
  it('a hole inside the panel, clamped with a margin', () => {
    const { holes } = frontOutline(400, 600, { kind: 'hole', cx: 500, cy: 0, w: 1000, h: 120 });
    const xs = holes[0]!.map((p) => p.x);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-200 + CUTOUT_MARGIN);
    expect(Math.max(...xs)).toBeLessThanOrEqual(200 - CUTOUT_MARGIN);
  });
  it('a notch in the top edge, at most half the height deep', () => {
    const { outline } = frontOutline(800, 100, { kind: 'notch', cx: 0, cy: 0, w: 150, h: 500 });
    expect(Math.abs(polygonArea(outline))).toBe(800 * 100 - 150 * 50);
  });
  it('panels too small for a cutout stay solid', () => {
    expect(frontOutline(15, 600, { kind: 'hole', cx: 0, cy: 0, w: 30, h: 120 }).holes).toEqual([]);
  });
});
