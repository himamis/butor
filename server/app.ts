import { Hono } from 'hono';

type Interfaces = Record<string, { address: string; family: string | number; internal: boolean }[] | undefined>;

export interface AppOptions {
  port: number; // the port clients reach the app on (used for LAN URLs)
  interfaces: Interfaces; // os.networkInterfaces(), injectable for tests
}

/** The HTTP API. Static hosting is added by main.ts in production. */
export function createApp(o: AppOptions): Hono {
  const app = new Hono();

  app.get('/api/health', (c) => c.json({ ok: true, version: '2' }));

  // Network addresses this machine is reachable on, for share links made from localhost (docs/v2/09).
  app.get('/api/host', (c) => {
    const urls = Object.values(o.interfaces)
      .flatMap((list) => list ?? [])
      .filter((i) => !i.internal && (i.family === 'IPv4' || i.family === 4))
      .map((i) => `http://${i.address}:${o.port}`);
    return c.json({ urls });
  });

  app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404));
  return app;
}
