import { describe, expect, it } from 'vitest';
import { layoutColumns } from './layout';

const col = (width: number | 'auto') => ({ width });

describe('layoutColumns', () => {
  it('auto columns share what fixed columns and dividers leave', () => {
    // inner 1964 = 2000 − 2×18; two dividers of 18
    const r = layoutColumns({
      innerW: 1964,
      x0: -982,
      divider: 18,
      minWidth: 100,
      columns: [col(500), col('auto'), col('auto')],
    });
    expect(r).toEqual({
      columns: [
        { x0: -982, width: 500 },
        { x0: -464, width: 714 },
        { x0: 268, width: 714 },
      ],
    });
  });

  it('without auto columns the right-most one absorbs the remainder', () => {
    const r = layoutColumns({ innerW: 1000, x0: -500, divider: 18, minWidth: 100, columns: [col(400), col(300)] });
    expect(r).toEqual({
      columns: [
        { x0: -500, width: 400 },
        { x0: -82, width: 582 },
      ],
    });
  });

  it('refuses layouts where a column would be narrower than the minimum', () => {
    const r = layoutColumns({ innerW: 1000, x0: -500, divider: 18, minWidth: 100, columns: [col(900), col('auto')] });
    expect(r).toEqual({ error: expect.stringMatching(/narrower than 100/) });
  });

  it('a single column fills the unit', () => {
    expect(layoutColumns({ innerW: 764, x0: -382, divider: 18, minWidth: 100, columns: [col(300)] })).toEqual({
      columns: [{ x0: -382, width: 764 }],
    });
  });
});
