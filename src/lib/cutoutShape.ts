import type { Cutout } from '../types';

export type Pt = { x: number; y: number };

/** Minimum material left around a cutout (mm). */
export const CUTOUT_MARGIN = 10;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Shoelace area; positive for counter-clockwise. */
export function polygonArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/**
 * Outline (counter-clockwise) and holes (clockwise) of a w × h front centered on the origin,
 * with an optional cutout clamped to stay inside the panel.
 */
export function frontOutline(w: number, h: number, cutout?: Cutout): { outline: Pt[]; holes: Pt[][] } {
  const x0 = -w / 2, x1 = w / 2, y0 = -h / 2, y1 = h / 2;
  const rect: Pt[] = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  if (!cutout) return { outline: rect, holes: [] };

  const m = CUTOUT_MARGIN;
  const cw = clamp(cutout.w, 1, Math.max(1, w - 2 * m));
  const cx = clamp(cutout.cx, x0 + m + cw / 2, x1 - m - cw / 2);

  if (cutout.kind === 'notch') {
    const ch = clamp(cutout.h, 1, h / 2);
    const l = cx - cw / 2, r = cx + cw / 2, b = y1 - ch;
    return {
      outline: [
        { x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: r, y: y1 },
        { x: r, y: b }, { x: l, y: b }, { x: l, y: y1 }, { x: x0, y: y1 },
      ],
      holes: [],
    };
  }

  const ch = clamp(cutout.h, 1, Math.max(1, h - 2 * m));
  const cy = clamp(cutout.cy, y0 + m + ch / 2, y1 - m - ch / 2);
  const l = cx - cw / 2, r = cx + cw / 2, b = cy - ch / 2, t = cy + ch / 2;
  return { outline: rect, holes: [[{ x: l, y: b }, { x: l, y: t }, { x: r, y: t }, { x: r, y: b }]] };
}
