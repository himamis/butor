import { describe, expect, it } from 'vitest';
import { createIdGenerator } from '../ids';
import { testCatalog } from '../test/catalog';
import { emptyDesign } from '../test/designs';
import { noNewIds, withIds } from './ids';
import { PublicOp } from './schema';
import { applyTransaction } from './transaction';

const parse = (op: unknown) => PublicOp.parse(op);

describe('withIds', () => {
  it('fills every id an entity.add creates — the entity, its columns (default included), items and fronts', () => {
    const ids = createIdGenerator('n');
    const unit = withIds(
      parse({
        type: 'entity.add',
        entity: {
          kind: 'unit',
          template: { id: 'test.unit' },
          position: { x: 0, z: 0 },
          columns: [{ items: [{ template: { id: 'test.shelf' }, y: 100 }] }],
          fronts: [{ id: 'keep', template: { id: 'test.door' }, columns: [0, 0], y: [0, 500] }],
        },
      }),
      ids,
    );
    expect(unit).toMatchObject({
      entity: {
        id: expect.any(String),
        columns: [{ id: expect.any(String), items: [{ id: expect.any(String) }] }],
        fronts: [{ id: 'keep' }],
      },
    });
    const bare = withIds(
      parse({ type: 'entity.add', entity: { kind: 'unit', template: { id: 'test.unit' }, position: { x: 0, z: 0 } } }),
      ids,
    );
    expect(bare).toMatchObject({ entity: { columns: [{ id: expect.any(String), width: 'auto', items: [] }] } });
  });

  it('fills the ids of every other creating op', () => {
    const ids = createIdGenerator('n');
    const ops = [
      { type: 'unit.column.add', unit: 'u', at: 0 },
      { type: 'unit.item.add', unit: 'u', column: 'c', template: { id: 'test.shelf' }, y: 0 },
      { type: 'unit.front.add', unit: 'u', template: { id: 'test.door' }, columns: [0, 0], y: [0, 100] },
      { type: 'group.create', members: ['a', 'b'] },
      { type: 'room.corner.insert', after: 'c1', at: { x: 0, z: 0 } },
    ].map((o) => withIds(parse(o), ids) as { id?: string });
    for (const o of ops) expect(o.id).toEqual(expect.any(String));
    const opening = withIds(
      parse({ type: 'room.opening.add', opening: { wall: 'w', kind: 'door', offset: 0, width: 900, height: 2000 } }),
      ids,
    );
    expect(opening).toMatchObject({ opening: { id: expect.any(String) } });
    const obstacle = withIds(
      parse({
        type: 'room.obstacle.add',
        obstacle: { kind: 'box', min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
      }),
      ids,
    );
    expect(obstacle).toMatchObject({ obstacle: { id: expect.any(String) } });
  });

  it('a replay that would need a new id fails with a message instead of inventing one', () => {
    const r = applyTransaction(
      emptyDesign(),
      {
        label: 'x',
        ops: [
          { type: 'entity.add', entity: { kind: 'unit', template: { id: 'test.unit' }, position: { x: 500, z: 300 } } },
        ],
      },
      { newId: noNewIds, now: () => '', catalog: testCatalog, mode: 'strict' },
    );
    expect(r.ok).toBe(false);
    expect(r.results[0]!.message).toContain('missing an id');
  });
});
