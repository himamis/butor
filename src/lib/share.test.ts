import { describe, expect, it } from 'vitest';
import { decodeShare, encodeShare, shareHashOf } from './share';
import { defaultDesign } from '../state/defaults';
import { obj } from '../test/fixtures';
import { parseDesign } from './persistence';

describe('share link codec', () => {
  const design = { ...defaultDesign(), objects: [obj('carcass-doors', { position: { x: 1000, y: 0, z: 300 } })] };

  it('round-trips a design through the URL hash', () => {
    const hash = encodeShare(design);
    expect(hash.startsWith('#view=')).toBe(true);
    expect(decodeShare(hash)).toEqual(parseDesign(design));
  });

  it('produces URL-safe text', () => {
    expect(encodeShare(design)).toMatch(/^#view=[A-Za-z0-9+\-$_]+$/);
  });

  it.each([
    ['empty hash', ''],
    ['other hash', '#foo'],
    ['garbage', '#view=%%%notvalid'],
    ['valid compression, invalid design', '#view=' + 'N4XyA'],
  ])('returns null for %s', (_, hash) => {
    expect(decodeShare(hash)).toBeNull();
  });

  it('shareHashOf only recognises view links', () => {
    expect(shareHashOf('#view=abc')).toBe('abc');
    expect(shareHashOf('#other')).toBeNull();
  });
});
