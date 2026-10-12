import { describe, expect, it } from 'vitest';
import { CUTOUT_MARGIN, frontOutline, polygonArea } from './cutoutShape';

describe('frontOutline', () => {
  it('is a plain rectangle without a cutout', () => {
    const { outline, holes } = frontOutline(400, 600);
    expect(outline).toHaveLength(4);
    expect(holes).toHaveLength(0);
    expect(Math.abs(polygonArea(outline))).toBe(400 * 600);
  });

  it('adds a hole fully inside the panel', () => {
    const { outline, holes } = frontOutline(400, 600, { kind: 'hole', cx: 150, cy: 0, w: 30, h: 120 });
    expect(Math.abs(polygonArea(outline))).toBe(400 * 600);
    expect(holes).toHaveLength(1);
    expect(Math.abs(polygonArea(holes[0]))).toBe(30 * 120);
    for (const p of holes[0]) {
      expect(p.x).toBeGreaterThanOrEqual(-200 + CUTOUT_MARGIN);
      expect(p.x).toBeLessThanOrEqual(200 - CUTOUT_MARGIN);
    }
  });

  it('clamps an oversized or off-panel hole to stay inside with a margin', () => {
    const { holes } = frontOutline(400, 600, { kind: 'hole', cx: 500, cy: 0, w: 1000, h: 50 });
    const xs = holes[0].map((p) => p.x);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-200 + CUTOUT_MARGIN);
    expect(Math.max(...xs)).toBeLessThanOrEqual(200 - CUTOUT_MARGIN);
    expect(Math.abs(polygonArea(holes[0]))).toBeGreaterThan(0);
  });

  it('cuts a notch into the top edge', () => {
    const { outline, holes } = frontOutline(800, 200, { kind: 'notch', cx: 0, cy: 0, w: 150, h: 30 });
    expect(holes).toHaveLength(0);
    expect(outline).toHaveLength(8);
    expect(Math.abs(polygonArea(outline))).toBe(800 * 200 - 150 * 30);
    expect(Math.max(...outline.map((p) => p.y))).toBe(100);
  });

  it('limits notch depth to half the panel height', () => {
    const { outline } = frontOutline(800, 100, { kind: 'notch', cx: 0, cy: 0, w: 150, h: 500 });
    expect(Math.abs(polygonArea(outline))).toBe(800 * 100 - 150 * 50);
  });
});
