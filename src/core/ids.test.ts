import { afterEach, describe, expect, it, vi } from 'vitest';
import { createIdGenerator, newId } from './ids';

describe('ids', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('are 21 url-safe characters and unique', () => {
    const ids = new Set(Array.from({ length: 5000 }, () => newId()));
    expect(ids.size).toBe(5000);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]{21}$/);
  });

  it('work without crypto.randomUUID (plain-http LAN origin)', () => {
    vi.stubGlobal('crypto', { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) });
    expect(newId()).toMatch(/^[A-Za-z0-9_-]{21}$/);
  });

  it('a deterministic generator gives reproducible ids for tests and the server', () => {
    const a = createIdGenerator('t');
    const b = createIdGenerator('t');
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(a()).toBe('t4');
  });
});
