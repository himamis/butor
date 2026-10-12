/**
 * Indicative hardware prices (EUR) by name prefix, used by the cost estimate.
 * Names come from the templates' hardware entries; the longest matching prefix wins.
 */
const PRICES: [prefix: string, price: number | ((name: string) => number)][] = [
  ['Hinge', 4.5],
  ['Drawer runners', (n) => 14 + (Number(/(\d+) mm/.exec(n)?.[1] ?? 450) / 50) * 1.2],
  ['Knob', 5],
  ['Bar handle', (n) => 6 + Number(/(\d+) mm/.exec(n)?.[1] ?? 160) * 0.03],
  ['Push latch', 4],
  ['Shelf pins', 0.15],
  ['Hanging rail', (n) => 4 + Number(/(\d+) mm/.exec(n)?.[1] ?? 800) * 0.008],
  ['Pull-down wardrobe lift', 95],
  ['Wire basket', 42],
  ['Pull-out trouser rack', 65],
  ['Pull-out tie & belt rack', 38],
  ['Flap stay', 22],
  ['Sliding door roller set', 28],
  ['LED strip', (n) => 10 + Number(/(\d+) mm/.exec(n)?.[1] ?? 1000) * 0.025],
  ['Wall-mounting rail', (n) => 6 + Number(/(\d+) mm/.exec(n)?.[1] ?? 1000) * 0.012],
];

export function HARDWARE_PRICES(name: string): number | undefined {
  const match = PRICES.filter(([prefix]) => name.startsWith(prefix)).sort((a, b) => b[0].length - a[0].length)[0];
  if (!match) return undefined;
  const [, p] = match;
  return Math.round((typeof p === 'function' ? p(name) : p) * 100) / 100;
}
