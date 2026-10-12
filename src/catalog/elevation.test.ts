import { describe, expect, it } from 'vitest';
import { elevation, entityFrame, wallElevations, type Design } from '../core';
import { instantiatePreset, PRESETS } from './index';
import { add, ctx, freshDesign, sceneOf } from './test-helpers';

const hinged = PRESETS.find((p) => p.id === 'preset.wardrobe-hinged')!;
const placed = (rotation: number, at = { x: 2000, z: 1500 }) => {
  const r = add(freshDesign(), { ...instantiatePreset(hinged, ctx('e').newId, at), rotation });
  return { d: r.doc, id: r.doc.order[0]! };
};

describe('print elevations', () => {
  for (const rotation of [0, 90, 180, -90, 30]) {
    it(`a unit seen from its front is w × h with its fronts nearest (rotation ${rotation})`, () => {
      const { d, id } = placed(rotation);
      const e = d.entities[id]! as Design['entities'][string] & { kind: 'unit' };
      const el = elevation(sceneOf(d), [id], entityFrame(e));
      expect(el.bounds.x0).toBeCloseTo(-500, 0);
      expect(el.bounds.x1).toBeCloseTo(500, 0);
      expect(el.bounds.y0).toBeCloseTo(0, 6);
      expect(el.bounds.y1).toBeCloseTo(2200, 6);
      const last = el.rects[el.rects.length - 1]!;
      expect(['front', 'handle']).toContain(last.role);
      // the left door is on the left of the paper
      const doors = el.rects.filter((r) => r.role === 'front').sort((a, b) => a.x0 - b.x0);
      expect(doors[0]!.x0).toBeCloseTo(-500, -1);
    });
  }

  it('wall elevations: units against a wall, and its openings', () => {
    let { d } = placed(0, { x: 1000, z: 300 }); // against the back wall (wall 1, z = 0)
    const key = Object.keys(d.room.walls)[0]!;
    d = {
      ...d,
      room: {
        ...d.room,
        openings: [{ id: 'w', wall: key, kind: 'window', offset: 2000, width: 1000, height: 1200, sill: 900 }],
      },
    };
    const walls = wallElevations(d, sceneOf(d));
    expect(walls).toHaveLength(4);
    const back = walls[0]!;
    expect(back.elevation.rects.some((r) => r.entity === d.order[0])).toBe(true);
    expect(back.elevation.rects[0]).toMatchObject({ role: 'wall', x0: 0, x1: 4000, y0: 0, y1: 2600 });
    expect(back.elevation.rects.find((r) => r.role === 'opening')).toMatchObject({
      x0: 2000,
      x1: 3000,
      y0: 900,
      y1: 2100,
    });
    expect(walls.slice(1).every((w) => !w.elevation.rects.some((r) => r.entity))).toBe(true);
    // the unit spans x 500–1500 along the back wall, which runs from x = 0
    const unitRects = back.elevation.rects.filter((r) => r.entity);
    expect(Math.min(...unitRects.map((r) => r.x0))).toBeCloseTo(500, 0);
  });
});
