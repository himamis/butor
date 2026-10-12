import type { Connect, Plugin } from 'vite';
import { handleChat, publicConfig } from './chatHandler';

const MAX_BODY = 4 * 1024 * 1024;

function readBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('Request too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const middleware: Connect.NextHandleFunction = async (req, res, next) => {
  const send = (status: number, json: unknown) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(json));
  };
  if (req.url === '/config' && req.method === 'GET') return send(200, publicConfig(process.env));
  if (req.url !== '/' && req.url !== '') return next();
  if (req.method !== 'POST') return send(405, { error: 'Use POST.' });
  try {
    const body = JSON.parse(await readBody(req));
    const r = await handleChat(body, process.env);
    send(r.status, r.json);
  } catch (e) {
    send(400, { error: e instanceof Error ? e.message : 'Bad request' });
  }
};

/** Serves POST /api/chat (and GET /api/chat/config) from the dev and preview servers. Keys stay on this machine. */
export function chatPlugin(): Plugin {
  return {
    name: 'wardrobe-chat',
    configureServer(server) {
      server.middlewares.use('/api/chat', middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/chat', middleware);
    },
  };
}
