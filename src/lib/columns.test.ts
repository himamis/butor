import { describe, expect, it } from 'vitest';
import { columnBoxes, findOverlaps } from './geometry';
import { parseDesign } from './persistence';
import { applyOperations } from '../ai/operations';
import { DEFAULT_ROOM, defaultDesign } from '../state/defaults';
import { obj } from '../test/fixtures';
import type { Room } from '../types';

const room: Room = { ...DEFAULT_ROOM, columns: [{ id: 'col', x: 200, z: 200, w: 400, d: 400 }] };

describe('room columns', () => {
  it('are floor-to-ceiling boxes centered on x/z', () => {
    expect(columnBoxes(room)).toEqual([{ min: { x: 0, y: 0, z: 0 }, max: { x: 400, y: 2600, z: 400 } }]);
  });

  it('flag furniture that intersects them, not furniture that touches them', () => {
    const touching = obj('carcass', { position: { x: 800, y: 0, z: 290 } }); // x 400..1200
    const clashing = obj('carcass', { position: { x: 700, y: 0, z: 290 } }); // x 300..1100
    expect(findOverlaps([touching], room).size).toBe(0);
    expect([...findOverlaps([clashing], room)]).toEqual([clashing.id]);
  });

  it('load from files; old files get no columns; bad entries are dropped', () => {
    const base = { version: 1, objects: [] };
    expect(parseDesign({ ...base, room: { points: DEFAULT_ROOM.points } })!.room.columns).toEqual([]);
    const d = parseDesign({ ...base, room: { points: DEFAULT_ROOM.points, columns: [{ id: 'a', x: 1, z: 2, w: 300, d: 300 }, { x: 'bad' }, 'nope', { x: 0, z: 0, w: -5, d: 300 }] } })!;
    expect(d.room.columns).toHaveLength(1);
    expect(d.room.columns[0]).toMatchObject({ id: 'a', x: 1, z: 2, w: 300, d: 300 });
  });

  it('can be set by the AI', () => {
    const ok = applyOperations(defaultDesign(), [{ op: 'set_room', columns: [{ x: 3800, z: 200, w: 400, d: 400 }] }]);
    expect(ok.results[0].ok).toBe(true);
    expect(ok.design.room.columns[0]).toMatchObject({ x: 3800, z: 200, w: 400, d: 400 });
    expect(ok.design.room.columns[0].id).toBeTruthy();
    const bad = applyOperations(defaultDesign(), [{ op: 'set_room', columns: [{ x: 0, z: 0, w: 0, d: 400 }] }]);
    expect(bad.results[0].ok).toBe(false);
  });
});
