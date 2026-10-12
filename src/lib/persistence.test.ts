import { describe, expect, it } from 'vitest';
import { parseDesign } from './persistence';
import { DEFAULT_ROOM } from '../state/defaults';

const valid = () => ({
  version: 1,
  room: DEFAULT_ROOM,
  objects: [{ id: 'a', templateId: 'carcass', name: 'C', params: { width: 900 }, position: { x: 1, y: 0, z: 2 }, rotationY: 90, color: '#123456' }],
});

describe('parseDesign', () => {
  it('accepts a valid design and fills missing params with defaults', () => {
    const d = parseDesign(valid())!;
    expect(d.objects[0].params).toMatchObject({ width: 900, height: 2200, shelves: 3 });
  });

  it.each([
    ['not an object', 42],
    ['wrong version', { ...valid(), version: 2 }],
    ['too few room points', { ...valid(), room: { ...DEFAULT_ROOM, points: [{ x: 0, z: 0 }, { x: 1, z: 1 }] } }],
  ])('rejects %s', (_, json) => {
    expect(parseDesign(json)).toBeNull();
  });

  it('defaults bad room fields', () => {
    const d = parseDesign({ ...valid(), room: { points: DEFAULT_ROOM.points, floorKind: 'lava' } })!;
    expect(d.room.floorKind).toBe(DEFAULT_ROOM.floorKind);
    expect(d.room.height).toBe(DEFAULT_ROOM.height);
  });
});

describe('older and hand-edited files', () => {
  it('clamps out-of-range params so templates never build broken geometry', () => {
    const json = { ...valid(), objects: [{ ...valid().objects[0], templateId: 'door', params: { width: 10, handle: 3 } }] };
    expect(parseDesign(json)!.objects[0].params.width).toBe(100);
  });

  it('an old door without hardware params loads with defaults', () => {
    const json = { ...valid(), objects: [{ ...valid().objects[0], templateId: 'door', params: { width: 400, height: 2190, depth: 18 } }] };
    expect(parseDesign(json)!.objects[0].params).toMatchObject({ hinge: 0, openAngle: 95, handle: 1 });
  });
});

describe('one bad object never costs the whole design', () => {
  it('skips objects with unknown templates or broken positions and keeps the rest', () => {
    const good = valid().objects[0];
    const d = parseDesign({
      ...valid(),
      objects: [good, { ...good, id: 'x', templateId: 'spaceship' }, { ...good, id: 'y', position: { x: 'a', y: 0, z: 0 } }, 'junk'],
    })!;
    expect(d.objects.map((o) => o.id)).toEqual(['a']);
  });
});
