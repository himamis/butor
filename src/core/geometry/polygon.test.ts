import { describe, expect, it } from 'vitest';
import { isSimplePolygon, signedArea } from './polygon';

const sq = [
  { x: 0, z: 0 },
  { x: 4000, z: 0 },
  { x: 4000, z: 3500 },
  { x: 0, z: 3500 },
];

describe('polygon', () => {
  it('signed area (x/z shoelace): the room convention is a positive area', () => {
    expect(signedArea(sq)).toBe(14_000_000);
    expect(signedArea([...sq].reverse())).toBe(-14_000_000);
  });

  it('detects self-intersection, duplicate corners and degenerate polygons', () => {
    expect(isSimplePolygon(sq)).toBe(true);
    expect(
      isSimplePolygon([
        { x: 0, z: 0 },
        { x: 4000, z: 3500 },
        { x: 4000, z: 0 },
        { x: 0, z: 3500 },
      ]),
    ).toBe(false); // bow tie
    expect(
      isSimplePolygon([
        { x: 0, z: 0 },
        { x: 0, z: 0 },
        { x: 10, z: 10 },
      ]),
    ).toBe(false);
    expect(
      isSimplePolygon([
        { x: 0, z: 0 },
        { x: 10, z: 0 },
        { x: 20, z: 0 },
      ]),
    ).toBe(false); // zero area
  });

  it('accepts an L-shape', () => {
    expect(
      isSimplePolygon([
        { x: 0, z: 0 },
        { x: 5000, z: 0 },
        { x: 5000, z: 2000 },
        { x: 2500, z: 2000 },
        { x: 2500, z: 4000 },
        { x: 0, z: 4000 },
      ]),
    ).toBe(true);
  });
});
