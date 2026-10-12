import { describe, expect, it } from 'vitest';
import { cutList, toCsv } from './cutlist';
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
