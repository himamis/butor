/**
 * Floor patterns as plank polygons covering one seamless rectangular tile (mm, x right, y down the tile).
 * Planks that cross the tile edge appear once per copy with the same `key`, so their tone matches when
 * the texture repeats (v1 lesson: per-plank randomness must be keyed modulo the tile).
 */
export type Pt = { x: number; y: number };
export interface Plank {
  points: Pt[];
  key: string; // identity modulo the tile
  shade: number; // −1…1 tone variation
}
export interface Tile {
  width: number;
  height: number;
  planks: Plank[];
}

const hash = (a: number, b: number) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
};
const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Straight planks in staggered rows (each row offset by a third of a plank). */
export function plankTile(o = { width: 200, length: 1200 }): Tile {
  const rows = 3;
  const width = o.length;
  const height = o.width * rows;
  const planks: Plank[] = [];
  for (let r = 0; r < rows; r++) {
    const off = ((r * o.length) / rows) % o.length;
    for (let k = -1; k <= 1; k++) {
      const x0 = off + k * o.length;
      const y0 = r * o.width;
      planks.push({
        points: [
          { x: x0, y: y0 },
          { x: x0 + o.length, y: y0 },
          { x: x0 + o.length, y: y0 + o.width },
          { x: x0, y: y0 + o.width },
        ],
        key: `${r}`,
        shade: hash(r, 7),
      });
    }
  }
  return { width, height, planks };
}

/** 45° chevron: planks meet on straight seams in strips 500 mm wide; 8 rows per 1000 mm tile. */
export function chevronTile(o = { strip: 500, pitch: 125 }): Tile {
  const size = 1000;
  const half = o.strip / 2;
  const amp = half; // tan 45°
  const rows = Math.round(size / o.pitch);
  const planks: Plank[] = [];
  for (let j = 0; j * half < size; j++) {
    const x0 = j * half;
    const [r0, r1] = j % 2 === 0 ? [0, amp] : [amp, 0];
    for (let k = -Math.ceil(amp / o.pitch) - 1; k <= rows + 1; k++) {
      const y0 = k * o.pitch;
      const row = mod(k, rows);
      planks.push({
        points: [
          { x: x0, y: y0 + r0 },
          { x: x0 + half, y: y0 + r1 },
          { x: x0 + half, y: y0 + r1 + o.pitch },
          { x: x0, y: y0 + r0 + o.pitch },
        ],
        key: `${j}:${row}`,
        shade: hash(j, row),
      });
    }
  }
  return { width: size, height: size, planks };
}

/**
 * Herringbone with planks `ratio` times longer than wide. In a frame rotated 45° the pattern is one
 * horizontal plank [0,n]×[0,1] plus one vertical plank [n,n+1]×[1−n,1], repeated on the lattice
 * (1, 1) and (n+1, 1−n). That lattice contains (0, √2·w) and (√2·n·w, 0) in room axes, so a rectangle of
 * those sides is a period. The tile spans 4 × 6 periods so plank tones vary; copies of a plank one tile
 * apart (lattice steps i += 6, or (i, j) += (−4, 4)) share a key.
 */
export function herringboneTile(o = { plankWidth: 90, ratio: 5 }): Tile {
  const w = o.plankWidth;
  const n = o.ratio;
  const PX = 4; // periods across
  const PY = 6; // periods down
  const s = Math.SQRT1_2;
  const toXY = (u: number, v: number): Pt => ({ x: (u - v) * s * w, y: (u + v) * s * w });
  const width = PX * Math.SQRT2 * n * w;
  const height = PY * Math.SQRT2 * w;
  const base = [
    [
      [0, 0],
      [n, 0],
      [n, 1],
      [0, 1],
    ],
    [
      [n, 1 - n],
      [n + 1, 1 - n],
      [n + 1, 1],
      [n, 1],
    ],
  ] as const;
  const planks: Plank[] = [];
  const R = PX * (n + 1) + PY + 4;
  for (let i = -R; i <= R; i++) {
    for (let j = -R; j <= R; j++) {
      const du = i + j * (n + 1);
      const dv = i + j * (1 - n);
      const m = Math.floor(j / PX);
      const jj = j - PX * m;
      const ii = mod(i + PX * m, PY);
      base.forEach((poly, which) => {
        const pts = poly.map(([u, v]) => toXY(u + du, v + dv));
        const xs = pts.map((p) => p.x);
        const ys = pts.map((p) => p.y);
        if (Math.max(...xs) < 0 || Math.min(...xs) > width || Math.max(...ys) < 0 || Math.min(...ys) > height) return;
        planks.push({ points: pts, key: `${which}:${ii}:${jj}`, shade: hash(which * 100 + ii, jj) });
      });
    }
  }
  return { width, height, planks };
}
