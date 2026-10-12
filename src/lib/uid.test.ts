import { afterEach, describe, expect, it, vi } from 'vitest';
import { uid } from './uid';

describe('uid', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('works without crypto.randomUUID (plain-http LAN address = insecure context)', () => {
    vi.stubGlobal('crypto', { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) });
    const a = uid();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(uid()).not.toBe(a);
  });
});
