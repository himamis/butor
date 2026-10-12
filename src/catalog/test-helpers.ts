/** Helpers for catalog tests (not shipped code paths). */
import {
  applyTransaction,
  buildScene,
  createDesign,
  createIdGenerator,
  defaultsOf,
  type Design,
  type EntityInput,
  type OpContext,
} from '../core';
import { catalog, DEFAULT_MATERIALS, DEFAULT_ROLES } from './index';

export function freshDesign(): Design {
  return createDesign({
    id: 'd',
    name: 'Test',
    now: 't',
    newId: createIdGenerator('room'),
    materials: DEFAULT_MATERIALS,
    defaults: DEFAULT_ROLES,
  });
}

export function ctx(prefix = 'id'): OpContext {
  return { newId: createIdGenerator(prefix), now: () => 't', catalog, mode: 'strict' };
}

export function add(d: Design, entity: EntityInput, c = ctx()) {
  return applyTransaction(d, { label: 'add', ops: [{ type: 'entity.add', entity }] }, c);
}

export const sceneOf = (d: Design) => buildScene(d, catalog);

export function defaultParamsOf(id: string): Record<string, unknown> {
  const t = catalog.get(id);
  if (!t) throw new Error(id);
  return defaultsOf(t.params);
}
