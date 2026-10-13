import { describe, expect, it } from 'vitest';
import { applyTransaction, type Design } from '../core';
import { catalog, instantiatePreset, PRESETS } from '../catalog';
import { ctx, freshDesign } from '../catalog/test-helpers';
import { parseDesignFile, serializeDesign, fileNameFor } from './files';
import { createRepository, memoryBackend, type Backend } from './repository';
import { decodeShare, encodeShare } from './share';

function reference(): Design {
  const ids = ctx('ref');
  const ops = PRESETS.filter((p) => p.id !== 'preset.corner')
    .slice(0, 4)
    .map((p, i) => ({
      type: 'entity.add' as const,
      entity: instantiatePreset(p, ids.newId, { x: 600 + i * 1000, z: 1500 }),
    }));
  const r = applyTransaction(freshDesign(), { label: 'ref', ops }, ids);
  expect(r.ok).toBe(true);
  return r.doc;
}

/** A design with an entity this app cannot read (a template it does not know), kept as an opaque entity. */
function withOpaque(d: Design): Design {
  const raw = {
    kind: 'unit',
    id: 'future',
    name: 'From the future',
    template: { id: 'unit.hologram' },
    position: { x: 3000, y: 0, z: 300 },
    rotation: 0,
    locked: false,
    params: {},
    size: { w: 600, h: 600, d: 600 },
    materials: {},
    columns: [{ id: 'c', width: 'auto', items: [] }],
    fronts: [],
  };
  const r = parseDesignFile(
    JSON.stringify({ ...d, entities: { ...d.entities, future: raw }, order: [...d.order, 'future'] }),
    catalog,
  );
  if (!r.ok) throw new Error(r.error);
  expect(r.design.entities.future?.kind).toBe('opaque');
  return r.design;
}

describe('design files', () => {
  it('export → import gives back the identical document, opaque entities included', () => {
    const d = withOpaque(reference());
    const r = parseDesignFile(serializeDesign(d), catalog);
    expect(r.ok && r.design).toEqual(d);
    expect(r.ok && r.warnings).toEqual([]);
  });

  it('refuses what is not a design, and files from another format version', () => {
    expect(parseDesignFile('not json', catalog)).toMatchObject({
      ok: false,
      error: expect.stringContaining('not a Butor design'),
    });
    expect(parseDesignFile('{"format":"other"}', catalog)).toMatchObject({ ok: false });
    const newer = JSON.parse(serializeDesign(reference()));
    newer.schemaVersion = 99;
    expect(parseDesignFile(JSON.stringify(newer), catalog)).toMatchObject({
      ok: false,
      error: expect.stringContaining('different version'),
    });
  });

  it('file names are safe', () => {
    expect(fileNameFor({ ...reference(), name: 'Bedroom / wardrobe: v2?' })).toBe('Bedroom-wardrobe-v2.butor.json');
    expect(fileNameFor({ ...reference(), name: '***' })).toBe('design.butor.json');
  });
});

describe('share links', () => {
  it('round-trip, and a typical design is a few KB', () => {
    const d = withOpaque(reference());
    const frag = encodeShare(d);
    expect(frag.length).toBeLessThan(6000);
    const r = decodeShare(`#${frag}`, catalog);
    expect(r.ok && r.design).toEqual(d);
  });

  it('a damaged or truncated link is reported, never thrown', () => {
    const frag = encodeShare(reference());
    for (const bad of ['', '#', '#d=', `#${frag.slice(0, frag.length / 2)}`, '#d=!!!!', '#d=AAAA&v=1']) {
      expect(decodeShare(bad, catalog)).toMatchObject({ ok: false, error: expect.stringContaining('damaged') });
    }
    expect(decodeShare(frag.replace('v=1', 'v=9'), catalog)).toMatchObject({
      ok: false,
      error: expect.stringContaining('different version'),
    });
  });
});

describe('repository', () => {
  it('lists newest first, keeps the thumbnail when a save has none, and removes everything of a design', async () => {
    const repo = createRepository(memoryBackend());
    const a = { ...reference(), id: 'a', name: 'A', meta: { ...reference().meta, updatedAt: '2026-01-01T00:00:00Z' } };
    const b = { ...a, id: 'b', name: 'B', meta: { ...a.meta, updatedAt: '2026-02-01T00:00:00Z' } };
    await repo.save(a, 'data:image/png;base64,AAA');
    await repo.save(b);
    expect((await repo.list()).map((e) => e.id)).toEqual(['b', 'a']);
    await repo.save({ ...a, name: 'A2', meta: { ...a.meta, updatedAt: '2026-03-01T00:00:00Z' } });
    expect(await repo.list()).toEqual([
      { id: 'a', name: 'A2', updatedAt: '2026-03-01T00:00:00Z', thumbnail: 'data:image/png;base64,AAA' },
      { id: 'b', name: 'B', updatedAt: '2026-02-01T00:00:00Z' },
    ]);
    await repo.putView('a', { mode: 'top' });
    await repo.remove('a');
    expect(await repo.get('a')).toBeUndefined();
    expect(await repo.getView('a')).toBeUndefined();
    expect((await repo.list()).map((e) => e.id)).toEqual(['b']);
  });

  it('saves of one design land in order even when the storage answers out of order', async () => {
    const mem = memoryBackend();
    let delay = 30;
    const slow: Backend = {
      ...mem,
      put: async (n, k, v) => {
        const ms = (delay = Math.max(0, delay - 10));
        await new Promise((r) => setTimeout(r, ms));
        await mem.put(n, k, v);
      },
    };
    const repo = createRepository(slow);
    const d = reference();
    const saves = [1, 2, 3].map((n) => repo.save({ ...d, name: `v${n}` }));
    await Promise.all(saves);
    expect(((await repo.get(d.id)) as Design).name).toBe('v3');
  });

  it('a failed save does not block the next one', async () => {
    const mem = memoryBackend();
    let fail = true;
    const flaky: Backend = {
      ...mem,
      put: async (n, k, v) => {
        if (fail) {
          fail = false;
          throw new Error('quota');
        }
        await mem.put(n, k, v);
      },
    };
    const repo = createRepository(flaky);
    const d = reference();
    await expect(repo.save(d)).rejects.toThrow('quota');
    await repo.save({ ...d, name: 'retry' });
    expect(((await repo.get(d.id)) as Design).name).toBe('retry');
  });
});
