import { describe, expect, it } from 'vitest';
import { CHEVRON, chevronPlanks } from './chevron';
import { parseDesign } from './persistence';
import { applyOperations } from '../ai/operations';
import { DEFAULT_ROOM, defaultDesign } from '../state/defaults';

describe('chevron floor pattern', () => {
  const tile = 1000;
  const planks = chevronPlanks(tile);

  it('plank width and angle match a classic chevron', () => {
    expect(CHEVRON.plankWidth).toBeCloseTo(88.4, 0);
    expect(CHEVRON.angleDeg).toBe(45);
  });

  it('is seamless: the tile height is a whole number of rows and the width a whole number of strips', () => {
    expect(tile % CHEVRON.stripWidth).toBe(0);
    expect((tile / CHEVRON.rowPitch) % 1).toBe(0);
  });

  it('planks in neighbouring half-strips meet at the seam (chevron, not herringbone)', () => {
    const seam = CHEVRON.stripWidth / 2;
    const left = planks.filter((p) => p.points[1].x === seam).map((p) => p.points[1].y).sort((a, b) => a - b);
    const right = planks.filter((p) => p.points[0].x === seam).map((p) => p.points[0].y).sort((a, b) => a - b);
    expect(left.length).toBeGreaterThan(0);
    for (const y of left.filter((y) => y > 0 && y < tile)) expect(right).toContainEqual(expect.closeTo(y, 6));
  });

  it('covers the whole tile (rows reach above and below it)', () => {
    const ys = planks.flatMap((p) => p.points.map((q) => q.y));
    expect(Math.min(...ys)).toBeLessThanOrEqual(0);
    expect(Math.max(...ys)).toBeGreaterThanOrEqual(tile);
  });

  it('can be chosen in files and by the AI', () => {
    expect(parseDesign({ version: 1, objects: [], room: { points: DEFAULT_ROOM.points, floorKind: 'chevron' } })!.room.floorKind).toBe('chevron');
    expect(applyOperations(defaultDesign(), [{ op: 'set_room', floorKind: 'chevron' }]).design.room.floorKind).toBe('chevron');
  });
});

describe('chevron tiling', () => {
  it('planks that wrap around the tile edge look identical (same tone and grain seed)', () => {
    const planks = chevronPlanks(1000);
    const rows = 1000 / CHEVRON.rowPitch;
    for (const p of planks) {
      const twin = planks.find((q) => q.points[0].x === p.points[0].x && Math.abs(q.points[0].y - (p.points[0].y + rows * CHEVRON.rowPitch)) < 1e-6);
      if (twin) {
        expect(twin.shade).toBe(p.shade);
        expect(twin.seed).toBe(p.seed);
      }
    }
  });
});
