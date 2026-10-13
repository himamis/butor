import { networkInterfaces } from 'node:os';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { readFileSync } from 'node:fs';
import { createApp } from './app';

const production = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT ?? (production ? 4173 : 8787));
const hostname = process.env.HOST ?? (production ? '127.0.0.1' : '127.0.0.1');

// In development Vite serves the app on 5173 and proxies /api here; LAN URLs point at Vite's port.
const publicPort = production ? port : Number(process.env.WEB_PORT ?? 5173);
const app = createApp({
  port: publicPort,
  interfaces: networkInterfaces(),
  ai: {
    env: {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      LLM_API_KEY: process.env.LLM_API_KEY,
      LLM_BASE_URL: process.env.LLM_BASE_URL,
      LLM_MODEL: process.env.LLM_MODEL,
      AI_ACCESS_TOKEN: process.env.AI_ACCESS_TOKEN,
    },
  },
});

if (production) {
  app.use('/*', serveStatic({ root: './dist' }));
  // Single-page app: unknown non-API paths get index.html.
  const index = readFileSync('./dist/index.html', 'utf8');
  app.get('*', (c) => c.html(index));
}

serve({ fetch: app.fetch, port, hostname }, (info) => {
  console.log(`Butor ${production ? 'server' : 'API'} listening on http://${hostname}:${info.port}`);
});
