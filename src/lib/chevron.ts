/** Chevron parquet geometry (mm), drawn into a seamless floor texture tile. */
const ROW_PITCH = 125; // vertical distance between plank edges; 8 rows per metre keeps the tile seamless
const ANGLE = 45;

export const CHEVRON = {
  stripWidth: 500, // two half-strips whose planks meet on the seam lines
  angleDeg: ANGLE,
  rowPitch: ROW_PITCH,
  plankWidth: ROW_PITCH * Math.cos((ANGLE * Math.PI) / 180), // ≈ 88 mm
};

export type Pt = { x: number; y: number };
export interface Plank {
  points: [Pt, Pt, Pt, Pt]; // parallelogram: bottom-left, bottom-right, top-right, top-left
  shade: number; // -1..1, per-plank colour variation
  seed: number; // grain seed; equal for planks that wrap onto each other across the tile edge
}

/** Deterministic pseudo-random in -1..1, so the floor looks the same on every load. */
const hash = (a: number, b: number) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
};

/** All planks needed to cover a square tile of the given size (mm), including rows overhanging its edges. */
export function chevronPlanks(tile: number): Plank[] {
  const half = CHEVRON.stripWidth / 2;
  // Plank edges rise across each left half-strip and fall across each right one, meeting on the seams.
  const amp = half * Math.tan((CHEVRON.angleDeg * Math.PI) / 180);
  const kMin = -Math.ceil(amp / ROW_PITCH) - 1;
  const kMax = Math.ceil(tile / ROW_PITCH) + 1;
  const rows = Math.round(tile / ROW_PITCH);
  const planks: Plank[] = [];
  for (let j = 0; j * half < tile; j++) {
    const x0 = j * half;
    const x1 = x0 + half;
    const [r0, r1] = j % 2 === 0 ? [0, amp] : [amp, 0];
    for (let k = kMin; k <= kMax; k++) {
      const y0 = k * ROW_PITCH;
      const row = ((k % rows) + rows) % rows; // overhanging rows repeat the tile's own rows
      planks.push({
        points: [
          { x: x0, y: y0 + r0 },
          { x: x1, y: y0 + r1 },
          { x: x1, y: y0 + r1 + ROW_PITCH },
          { x: x0, y: y0 + r0 + ROW_PITCH },
        ],
        shade: hash(j, row),
        seed: 1 + j * 97 + row,
      });
    }
  }
  return planks;
}
