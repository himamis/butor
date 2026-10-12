import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { choice, color, count, defaultsOf, describeParams, mm, parseParams, toggle } from './params';

const schema = z.object({
  width: mm({ label: 'Width', min: 100, max: 2400, default: 800 }),
  hinge: choice({ label: 'Hinge', options: { left: 'Left', right: 'Right' }, default: 'left' }),
  shelves: count({ label: 'Shelves', min: 0, max: 10, default: 3 }),
  glass: toggle({ label: 'Glass', default: false }),
  tint: color({ label: 'Tint', default: '#ffffff' }),
});

describe('template params', () => {
  it('defaults come from the schema', () => {
    expect(defaultsOf(schema)).toEqual({ width: 800, hinge: 'left', shelves: 3, glass: false, tint: '#ffffff' });
  });

  it('merges a patch over the current params', () => {
    const r = parseParams(schema, { width: 1000 }, defaultsOf(schema));
    expect(r).toMatchObject({ ok: true, value: { width: 1000, hinge: 'left' }, notes: [] });
  });

  it('clamps numbers to their limits with a note, and rounds counts', () => {
    const r = parseParams(schema, { width: 99999, shelves: 2.6 }, defaultsOf(schema));
    expect(r.ok && r.value.width).toBe(2400);
    expect(r.ok && r.value.shelves).toBe(3);
    expect(r.notes.join(' ')).toMatch(/width clamped to 2400 \(100–2400\)/);
  });

  it('reports unknown keys and keeps going', () => {
    const r = parseParams(schema, { colour: 3 }, defaultsOf(schema));
    expect(r.ok).toBe(true);
    expect(r.notes.join(' ')).toMatch(/unknown param "colour".*width, hinge/);
  });

  it('rejects wrong types and enum values with a readable message', () => {
    expect(parseParams(schema, { hinge: 'up' }, defaultsOf(schema))).toMatchObject({
      ok: false,
      error: expect.stringMatching(/hinge/),
    });
    expect(parseParams(schema, { width: 'wide' }, defaultsOf(schema))).toMatchObject({
      ok: false,
      error: expect.stringMatching(/width/),
    });
    expect(parseParams(schema, { tint: 'red' }, defaultsOf(schema))).toMatchObject({ ok: false });
  });

  it('fills missing params with defaults when there is no base', () => {
    expect(parseParams(schema, {}, undefined)).toMatchObject({ ok: true, value: defaultsOf(schema) });
  });

  it('describes params for UIs and the AI (labels, kinds, limits, options as strings)', () => {
    expect(describeParams(schema)).toEqual([
      { key: 'width', kind: 'mm', label: 'Width', min: 100, max: 2400, default: 800 },
      { key: 'hinge', kind: 'choice', label: 'Hinge', options: { left: 'Left', right: 'Right' }, default: 'left' },
      { key: 'shelves', kind: 'count', label: 'Shelves', min: 0, max: 10, default: 3 },
      { key: 'glass', kind: 'toggle', label: 'Glass', default: false },
      { key: 'tint', kind: 'color', label: 'Tint', default: '#ffffff' },
    ]);
  });
});
