import type { ParsedOp } from './schema';

/**
 * Fills in every id an operation would create (entities with their columns, items and fronts; columns, items,
 * fronts, groups, corners, openings, obstacles). This is the only place new ids are made, so an op that has been
 * through it is a complete record: applying it again — after a rebase, on another machine — creates the same ids.
 */
export function withIds(op: ParsedOp, newId: () => string): ParsedOp {
  switch (op.type) {
    case 'entity.add': {
      const e = op.entity;
      if (e.kind === 'part') return { ...op, entity: { ...e, id: e.id ?? newId() } };
      return {
        ...op,
        entity: {
          ...e,
          id: e.id ?? newId(),
          columns: (e.columns ?? [{ width: 'auto', items: [] }]).map((c) => ({
            ...c,
            id: c.id ?? newId(),
            items: (c.items ?? []).map((i) => ({ ...i, id: i.id ?? newId() })),
          })),
          fronts: (e.fronts ?? []).map((f) => ({ ...f, id: f.id ?? newId() })),
        },
      };
    }
    case 'unit.column.add':
    case 'unit.item.add':
    case 'unit.front.add':
    case 'group.create':
    case 'room.corner.insert':
      return { ...op, id: op.id ?? newId() };
    case 'room.opening.add':
      return { ...op, opening: { ...op.opening, id: op.opening.id ?? newId() } };
    case 'room.obstacle.add':
      return { ...op, obstacle: { ...op.obstacle, id: op.obstacle.id ?? newId() } };
    default:
      return op;
  }
}

/** Raised when an op that should be complete (a replay) still needs a new id. */
export class MissingIdError extends Error {}

/** `newId` for replays: replayed ops must carry all their ids, so asking for one is an error, never a silent drift. */
export const noNewIds = (): string => {
  throw new MissingIdError('a replayed operation is missing an id');
};
