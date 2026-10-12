import { applyTransaction, createIdGenerator, type Design, type Op } from '../core';
import { catalog, instantiatePreset, PRESETS } from '../catalog';
import { newDesign } from './store';

/** Deterministic designs for tests and performance budgets. */
export function fixtureDesign(name: 'hundred-units' | 'reference'): Design {
  const ids = createIdGenerator('fx');
  let d = newDesign();
  const ops: Op[] = [];
  if (name === 'reference') {
    d = { ...d, id: 'reference' };
    const wardrobe = PRESETS.find((p) => p.id === 'preset.wardrobe-drawers')!;
    const sliding = PRESETS.find((p) => p.id === 'preset.wardrobe-sliding')!;
    ops.push({ type: 'entity.add', entity: instantiatePreset(wardrobe, ids, { x: 600, z: 300 }) });
    ops.push({ type: 'entity.add', entity: instantiatePreset(sliding, ids, { x: 2000, z: 325 }) });
    ops.push({ type: 'room.update', floor: { finish: 'chevron', color: '#e8dcc8' } });
  } else {
    // 100 units in a 20 × 12 m room: a mix of every wardrobe and cabinet preset.
    const size = { x: 20_000, z: 12_000 };
    ops.push({ type: 'room.corner.move', id: d.room.corners[1]!.id, to: { x: size.x, z: 0 } });
    ops.push({ type: 'room.corner.move', id: d.room.corners[2]!.id, to: { x: size.x, z: size.z } });
    ops.push({ type: 'room.corner.move', id: d.room.corners[3]!.id, to: { x: 0, z: size.z } });
    const presets = PRESETS.filter((p) => p.id !== 'preset.corner');
    for (let i = 0; i < 100; i++) {
      const p = presets[i % presets.length]!;
      ops.push({
        type: 'entity.add',
        entity: instantiatePreset(p, ids, { x: 1200 + (i % 10) * 1950, z: 600 + Math.floor(i / 10) * 1150 }),
      });
    }
  }
  const r = applyTransaction(
    d,
    { label: 'fixture', ops },
    { newId: ids, now: () => '2026-01-01T00:00:00.000Z', catalog, mode: 'strict' },
  );
  if (!r.ok)
    throw new Error(
      `fixture "${name}" failed: ${r.results
        .filter((x) => !x.ok)
        .map((x) => x.message)
        .join('; ')}`,
    );
  return r.doc;
}
