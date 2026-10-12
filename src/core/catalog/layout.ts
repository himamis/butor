/**
 * Splits a unit's inner width into columns separated by dividers.
 * Fixed widths are kept; 'auto' columns share the rest equally; with no auto column the
 * right-most column absorbs the remainder (so resizing a unit always has somewhere to go).
 */
export function layoutColumns(o: {
  innerW: number;
  x0: number; // left inner edge (unit-local x)
  divider: number; // divider thickness
  minWidth: number;
  columns: { width: number | 'auto' }[];
}): { columns: { x0: number; width: number }[] } | { error: string } {
  const n = o.columns.length;
  const available = o.innerW - (n - 1) * o.divider;
  const widths = o.columns.map((c) => c.width);
  const autoIdx = widths.flatMap((w, i) => (w === 'auto' ? [i] : []));
  const flexible = autoIdx.length ? autoIdx : [n - 1];
  const fixedSum = widths.reduce<number>((s, w, i) => s + (flexible.includes(i) || w === 'auto' ? 0 : w), 0);
  const share = (available - fixedSum) / flexible.length;
  const resolved = widths.map((w, i) => (flexible.includes(i) ? share : (w as number)));
  const narrow = resolved.findIndex((w) => w < o.minWidth - 1e-9);
  if (narrow >= 0) {
    return {
      error: `column ${narrow + 1} would be ${Math.round(resolved[narrow] ?? 0)} mm wide — narrower than ${o.minWidth} mm`,
    };
  }
  let x = o.x0;
  return {
    columns: resolved.map((width) => {
      const c = { x0: round(x), width: round(width) };
      x += width + o.divider;
      return c;
    }),
  };
}

const round = (v: number) => Math.round(v * 1000) / 1000;
