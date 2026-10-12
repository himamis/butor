/** Hinges an overlay door needs, by its height (common manufacturer guidance). */
export function hingesFor(doorHeight: number): number {
  return doorHeight <= 1000 ? 2 : doorHeight <= 1500 ? 3 : doorHeight <= 2200 ? 4 : 5;
}

/** Drawer runners come in 50 mm steps; the longest that fits the available depth (at least 250). */
export function runnerLength(depth: number): number {
  return Math.max(250, Math.floor(depth / 50) * 50);
}
