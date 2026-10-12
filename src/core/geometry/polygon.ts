export type P2 = { x: number; z: number };

/** Shoelace area in the x/z plane (sign depends on winding). */
export function signedArea(pts: P2[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    a += p.x * q.z - q.x * p.z;
  }
  return a / 2;
}

const cross = (o: P2, a: P2, b: P2) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);

function segmentsIntersect(a: P2, b: P2, c: P2, d: P2): boolean {
  const d1 = cross(c, d, a),
    d2 = cross(c, d, b),
    d3 = cross(a, b, c),
    d4 = cross(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  const on = (p: P2, q: P2, r: P2) =>
    Math.min(p.x, q.x) <= r.x && r.x <= Math.max(p.x, q.x) && Math.min(p.z, q.z) <= r.z && r.z <= Math.max(p.z, q.z);
  return (
    (d1 === 0 && on(c, d, a)) || (d2 === 0 && on(c, d, b)) || (d3 === 0 && on(a, b, c)) || (d4 === 0 && on(a, b, d))
  );
}

/** At least 3 distinct corners, non-zero area, and no two non-adjacent edges touching. */
export function isSimplePolygon(pts: P2[]): boolean {
  const n = pts.length;
  if (n < 3 || Math.abs(signedArea(pts)) < 1e-6) return false;
  for (let i = 0; i < n; i++) {
    const a = pts[i]!,
      b = pts[(i + 1) % n]!;
    if (a.x === b.x && a.z === b.z) return false;
    for (let j = i + 1; j < n; j++) {
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue; // adjacent edges share a corner
      if (segmentsIntersect(a, b, pts[j]!, pts[(j + 1) % n]!)) return false;
    }
  }
  return true;
}
