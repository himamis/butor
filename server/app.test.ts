import { describe, expect, it } from 'vitest';
import { createApp } from './app';

describe('server app', () => {
  const app = createApp({
    port: 8787,
    interfaces: {
      en0: [{ address: '192.168.0.224', family: 'IPv4', internal: false }],
      lo0: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
    },
  });

  it('reports health', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it('lists LAN URLs (external IPv4 only) so the share dialog can suggest one', async () => {
    const res = await app.request('/api/host');
    expect(await res.json()).toEqual({ urls: ['http://192.168.0.224:8787'] });
  });

  it('answers unknown API routes with JSON 404', async () => {
    const res = await app.request('/api/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: expect.any(String) });
  });
});
