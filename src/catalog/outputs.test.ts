import { describe, expect, it } from 'vitest';
import { costEstimate, cutList, cutListCsv, hardwareList } from '../core';
import { HARDWARE_PRICES, instantiatePreset, PRESETS } from './index';
import { add, freshDesign, sceneOf } from './test-helpers';
import { createIdGenerator } from '../core';

const wardrobe = () => {
  const p = PRESETS.find((x) => x.id === 'preset.wardrobe-hinged')!;
  return add(freshDesign(), instantiatePreset(p, createIdGenerator('w'), { x: 1000, z: 300 })).doc;
};

describe('cut list', () => {
  it('lists boards per material and thickness, length along the grain, identical parts merged', () => {
    const d = wardrobe();
    const rows = cutList(d, sceneOf(d));
    const side = rows.find((r) => r.part === 'Side panel')!;
    expect(side).toMatchObject({
      material: 'white',
      materialName: 'White melamine',
      thickness: 18,
      length: 2200,
      width: 600,
      qty: 2,
      banding: { length: 1, width: 0 },
    });
    const doors = rows.find((r) => r.part === 'Door')!;
    expect(doors).toMatchObject({ qty: 2, thickness: 18, banding: { length: 2, width: 2 } });
    expect(doors.length).toBeGreaterThan(doors.width); // grain runs along the height of a door
    const back = rows.find((r) => r.part === 'Back panel')!;
    expect(back).toMatchObject({ material: 'hardboard', thickness: 8, qty: 1 });
    // no hardware in the cut list
    expect(rows.some((r) => /rail|hinge|knob|bar/i.test(r.part))).toBe(false);
  });

  it('matches the reference snapshot', () => {
    const d = wardrobe();
    expect(cutList(d, sceneOf(d))).toMatchSnapshot();
  });

  it('CSV has a header and quotes safely', () => {
    const d = wardrobe();
    const csv = cutListCsv(cutList(d, sceneOf(d)));
    expect(csv.split('\n')[0]).toBe(
      'Material,Part,Length (mm),Width (mm),Thickness (mm),Qty,Banded long edges,Banded short edges',
    );
    expect(csv).toContain('White melamine,Side panel,2200,600,18,2,1,0');
  });
});

describe('hardware list', () => {
  it('counts hinges by door height, handles, rails and shelf pins', () => {
    const d = wardrobe();
    const hw = hardwareList(sceneOf(d));
    expect(hw).toEqual(
      expect.arrayContaining([
        { name: 'Hinge', qty: 8 }, // two 2197 mm leaves × 4
        { name: 'Bar handle 160 mm', qty: 2 },
        { name: expect.stringMatching(/^Hanging rail \d+ mm$/), qty: 1 },
      ]),
    );
  });
});

describe('cost estimate', () => {
  it('prices boards with waste, banding and hardware', () => {
    const d = wardrobe();
    const scene = sceneOf(d);
    const est = costEstimate(d, cutList(d, scene), hardwareList(scene), HARDWARE_PRICES);
    expect(est.currency).toBe('EUR');
    const white = est.lines.find((l) => l.label.startsWith('White melamine'))!;
    expect(white.amount).toBeGreaterThan(0);
    expect(est.lines.some((l) => l.label.startsWith('Hinge'))).toBe(true);
    expect(est.total).toBeCloseTo(
      est.lines.reduce((s, l) => s + l.amount, 0),
      6,
    );
    expect(est.unpriced).toEqual([]);
  });
});
