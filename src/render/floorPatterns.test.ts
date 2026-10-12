import { describe, expect, it } from 'vitest';
import { chevronTile, herringboneTile, plankTile, type Tile } from './floorPatterns';

function inPoly(p: { x: number; y: number }, poly: { x: number; y: number }[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!,
      b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Every sample point inside the tile is covered by exactly one plank (no gaps, no overlaps). */
function coverage(tile: Tile) {
  const counts: number[] = [];
  for (let i = 0; i < 40; i++) {
    for (let j = 0; j < 40; j++) {
      // avoid sampling exactly on edges
      const p = { x: ((i + 0.37) / 40) * tile.width, y: ((j + 0.61) / 40) * tile.height };
      counts.push(tile.planks.filter((pl) => inPoly(p, pl.points)).length);
    }
  }
  return counts;
}

describe('floor patterns tile seamlessly', () => {
  it('herringbone: rectangular tile of 4 × 6 periods (√2·n·w × √2·w), exact cover, varied tones', () => {
    const t = herringboneTile({ plankWidth: 90, ratio: 5 });
    expect(t.width).toBeCloseTo(4 * Math.SQRT2 * 5 * 90);
    expect(t.height).toBeCloseTo(6 * Math.SQRT2 * 90);
    expect(new Set(t.planks.map((p) => p.key)).size).toBe(2 * 4 * 6);
    expect(new Set(coverage(t))).toEqual(new Set([1]));
  });

  it('chevron: exact cover of its tile', () => {
    expect(new Set(coverage(chevronTile()))).toEqual(new Set([1]));
  });

  it('planks: exact cover of its tile', () => {
    expect(new Set(coverage(plankTile()))).toEqual(new Set([1]));
  });

  it('per-plank tone is the same for planks that wrap onto each other across the tile edge', () => {
    for (const t of [herringboneTile({ plankWidth: 90, ratio: 5 }), chevronTile(), plankTile()]) {
      for (const p of t.planks) expect(Number.isFinite(p.shade)).toBe(true);
      const keys = new Map<string, number>();
      for (const p of t.planks) {
        const prev = keys.get(p.key);
        if (prev !== undefined) expect(p.shade).toBe(prev);
        keys.set(p.key, p.shade);
      }
    }
  });
});
