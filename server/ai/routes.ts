import type { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { importDesign } from '../../src/core';
import { catalog } from '../../src/catalog';
import { runTurn, type TurnEvent } from './agent';
import { anthropicAdapter, ANTHROPIC_DEFAULT_MODEL } from './providers/anthropic';
import { openAiAdapter } from './providers/openai';
import { ProviderError, type ProviderAdapter } from './providers/types';
import { checkRequest, LIMITS, resolveCredentials, tokenMatches, type AiEnv, type Credentials } from './security';

const TurnRequest = z.object({
  provider: z.enum(['anthropic', 'openai']),
  model: z.string().trim().min(1).max(200).optional(),
  baseUrl: z.string().max(500).optional(),
  apiKey: z.string().max(500).optional(),
  effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional(),
  message: z.string().trim().min(1).max(LIMITS.message),
  design: z.unknown(),
  history: z.array(z.unknown()),
});
export type TurnRequest = z.infer<typeof TurnRequest>;

export type AdapterFactory = (c: Credentials, req: TurnRequest, env: AiEnv) => ProviderAdapter;

export const defaultAdapter: AdapterFactory = (c, req, env) =>
  c.provider === 'anthropic'
    ? anthropicAdapter({
        apiKey: c.apiKey,
        baseURL: c.baseURL,
        model: req.model ?? ANTHROPIC_DEFAULT_MODEL,
        effort: req.effort ?? 'medium',
      })
    : openAiAdapter({
        baseUrl: c.baseUrl,
        ...(c.apiKey ? { apiKey: c.apiKey } : {}),
        model: req.model ?? env.LLM_MODEL ?? 'default',
      });

/** /api/ai/config and /api/ai/turn (docs/v2/08-ai.md). */
export function aiRoutes(app: Hono, env: AiEnv, makeAdapter: AdapterFactory = defaultAdapter) {
  // Only whether keys exist — never the keys.
  app.get('/api/ai/config', (c) =>
    c.json({
      anthropic: { serverKey: !!env.ANTHROPIC_API_KEY?.trim(), defaultModel: ANTHROPIC_DEFAULT_MODEL },
      openai: {
        serverKey: !!env.LLM_API_KEY?.trim(),
        baseUrl: env.LLM_BASE_URL?.trim() || null,
        model: env.LLM_MODEL?.trim() || null,
      },
      tokenRequired: !!env.AI_ACCESS_TOKEN,
    }),
  );

  app.post('/api/ai/turn', async (c) => {
    const bad = checkRequest({
      origin: c.req.header('origin'),
      host: c.req.header('host'),
      contentType: c.req.header('content-type'),
      length: c.req.header('content-length'),
    });
    if (bad) return c.json({ error: bad.error }, bad.status as 403);
    if (!tokenMatches(env.AI_ACCESS_TOKEN, c.req.header('x-butor-ai-token')))
      return c.json({ error: 'The assistant needs the access token (settings).' }, 401);

    const text = await c.req.text();
    if (text.length > LIMITS.body) return c.json({ error: 'The request is too large.' }, 413);
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return c.json({ error: 'The request is not valid JSON.' }, 400);
    }
    const parsed = TurnRequest.safeParse(json);
    if (!parsed.success) {
      const tooLong = parsed.error.issues.some((i) => i.path[0] === 'message' && i.code === 'too_big');
      return c.json(
        { error: tooLong ? `Messages are limited to ${LIMITS.message} characters.` : 'The request is malformed.' },
        400,
      );
    }
    const req = parsed.data;
    // History is append-only and never trimmed here: when it is too long the user starts a new chat.
    if (req.history.length > LIMITS.historyEntries || JSON.stringify(req.history).length > LIMITS.historyBytes)
      return c.json({ error: 'This chat is too long. Start a new chat.' }, 400);
    const design = importDesign(req.design, catalog);
    if (!design.ok) return c.json({ error: `The design could not be read: ${design.error}` }, 400);
    const creds = resolveCredentials(req, env);
    if (!creds.ok) return c.json({ error: creds.error }, creds.status as 400);
    const adapter = makeAdapter(creds.credentials, req, env);

    return streamSSE(c, async (stream) => {
      const ac = new AbortController();
      stream.onAbort(() => ac.abort());
      let chain = Promise.resolve();
      const send = (event: string, data: unknown) => {
        chain = chain.then(() => stream.writeSSE({ event, data: JSON.stringify(data) }));
        return chain;
      };
      try {
        const out = await runTurn(
          adapter,
          { message: req.message, design: design.design, history: req.history },
          ac.signal,
          (e: TurnEvent) => void send(e.type, e),
        );
        await send('final', out);
      } catch (e) {
        const message =
          e instanceof ProviderError
            ? e.message
            : `The assistant failed: ${e instanceof Error ? e.message.slice(0, 300) : String(e)}`;
        await send('error', { message });
      }
    });
  });
}
