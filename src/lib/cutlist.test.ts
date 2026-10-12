import { describe, expect, it } from 'vitest';
import { cutList, hardwareList, toCsv } from './cutlist';
import { obj } from '../test/fixtures';

describe('cutList', () => {
  it('lists a default carcass with merged identical parts', () => {
    const rows = cutList([obj('carcass')]);
    const by = (part: string) => rows.find((r) => r.part === part)!;
    expect(by('Side panel')).toMatchObject({ length: 2200, width: 580, thickness: 18, qty: 2 });
    expect(by('Shelf')).toMatchObject({ length: 764, width: 572, thickness: 18, qty: 3 });
    expect(by('Back panel')).toMatchObject({ length: 2164, width: 764, thickness: 8, qty: 1 });
  });

  it('merges across objects of the same color and splits by color', () => {
    const rows = cutList([obj('carcass'), obj('carcass'), obj('carcass', { color: '#000000' })]);
    const sides = rows.filter((r) => r.part === 'Side panel');
    expect(sides.map((r) => r.qty).sort()).toEqual([2, 4]);
  });

  it('escapes CSV fields', () => {
    const csv = toCsv([{ part: 'Shelf, "deep"', length: 1, width: 2, thickness: 3, color: '#fff', qty: 1 }]);
    expect(csv.split('\n')[1]).toBe('"Shelf, ""deep""",1,2,3,#fff,1');
  });
});

describe('hardware and cutouts', () => {
  it('handles are listed as hardware, not as panels', () => {
    const objs = [obj('carcass-doors', {}, { doors: 2, handle: 1 }), obj('drawer', {}, { handle: 2 }), obj('drawer', {}, { handle: 2 })];
    expect(cutList(objs).some((r) => r.part.startsWith('Knob') || r.part.startsWith('Bar'))).toBe(false);
    expect(hardwareList(objs)).toEqual(expect.arrayContaining([
      { part: 'Bar handle 160 mm', qty: 2 },
      { part: 'Knob Ø30', qty: 2 },
    ]));
  });

  it('fronts with a cutout are named so the workshop knows', () => {
    const rows = cutList([obj('door', {}, { handle: 3 }), obj('drawer', {}, { handle: 3 })]);
    expect(rows.map((r) => r.part)).toEqual(expect.arrayContaining(['Door (grip hole)', 'Drawer front (grip notch)']));
  });

  it('CSV appends hardware rows', () => {
    const csv = toCsv([], [{ part: 'Knob Ø30', qty: 4 }]);
    expect(csv.split('\n')).toContain('Knob Ø30,,,,hardware,4');
  });
});

describe('hinges and runners', () => {
  it('counts hinges per door by height, and a pair of runners per drawer by depth', () => {
    const hw = hardwareList([obj('carcass-doors', {}, { height: 2200, doors: 2, handle: 0 }), obj('drawer-unit', {}, { drawers: 3, depth: 500, handle: 0 })]);
    expect(hw).toEqual(expect.arrayContaining([
      { part: 'Hinge', qty: 8 },             // two ~2196 mm doors → 4 hinges each
      { part: 'Drawer runners 450 mm (pair)', qty: 3 },
    ]));
  });

  it('short doors get 2 hinges; sliding doors get none', () => {
    const hw = hardwareList([obj('door', {}, { height: 700, handle: 0 }), obj('sliding-door', {}, { handle: 0 })]);
    expect(hw).toEqual([{ part: 'Hinge', qty: 2 }]);
  });
});
