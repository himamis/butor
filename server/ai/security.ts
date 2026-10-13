import { timingSafeEqual } from 'node:crypto';
import { ANTHROPIC_DEFAULT_URL } from './providers/anthropic';

/** Server configuration for the assistant (environment variables). */
export interface AiEnv {
  ANTHROPIC_API_KEY?: string;
  LLM_API_KEY?: string;
  LLM_BASE_URL?: string;
  LLM_MODEL?: string;
  AI_ACCESS_TOKEN?: string;
}

export const LIMITS = {
  body: 4 * 1024 * 1024,
  message: 10_000,
  historyEntries: 400,
  historyBytes: 3 * 1024 * 1024,
};

export type Credentials =
  | { provider: 'anthropic'; apiKey: string; baseURL: string }
  | { provider: 'openai'; apiKey?: string; baseUrl: string };

export type Resolved = { ok: true; credentials: Credentials } | { ok: false; status: number; error: string };

const norm = (u: string) => u.trim().replace(/\/+$/, '').toLowerCase();

function httpUrl(u: string): boolean {
  try {
    const p = new URL(u);
    return p.protocol === 'http:' || p.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Which key goes where (docs/v2/08-ai.md#security). A server key is only ever sent to its own configured endpoint;
 * a URL chosen in the browser needs a key typed in the browser (or none, for a local OpenAI-compatible server).
 */
export function resolveCredentials(
  req: { provider: 'anthropic' | 'openai'; baseUrl?: string; apiKey?: string },
  env: AiEnv,
): Resolved {
  const typedKey = req.apiKey?.trim() || undefined;
  const typedUrl = req.baseUrl?.trim() || undefined;
  if (typedUrl && !httpUrl(typedUrl))
    return { ok: false, status: 400, error: 'The base URL must start with http:// or https://.' };

  if (req.provider === 'anthropic') {
    const custom = typedUrl && norm(typedUrl) !== norm(ANTHROPIC_DEFAULT_URL);
    if (custom) {
      if (!typedKey)
        return { ok: false, status: 400, error: 'A custom Anthropic URL needs an API key entered in settings.' };
      return { ok: true, credentials: { provider: 'anthropic', apiKey: typedKey, baseURL: typedUrl } };
    }
    const apiKey = typedKey ?? env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey)
      return {
        ok: false,
        status: 400,
        error: 'No Anthropic API key: enter one in settings, or set ANTHROPIC_API_KEY on the server.',
      };
    return { ok: true, credentials: { provider: 'anthropic', apiKey, baseURL: ANTHROPIC_DEFAULT_URL } };
  }

  const baseUrl = typedUrl ?? env.LLM_BASE_URL?.trim();
  if (!baseUrl)
    return {
      ok: false,
      status: 400,
      error: 'No model server URL: enter one in settings, or set LLM_BASE_URL on the server.',
    };
  if (typedKey) return { ok: true, credentials: { provider: 'openai', apiKey: typedKey, baseUrl } };
  const serverUrl = env.LLM_BASE_URL?.trim();
  const apiKey = serverUrl && norm(serverUrl) === norm(baseUrl) ? env.LLM_API_KEY?.trim() || undefined : undefined;
  return { ok: true, credentials: { provider: 'openai', baseUrl, ...(apiKey ? { apiKey } : {}) } };
}

/** Same-host origin and a JSON body (forces a CORS preflight, so other sites cannot post here). */
export function checkRequest(headers: {
  origin?: string;
  host?: string;
  contentType?: string;
  length?: string;
}): { status: number; error: string } | null {
  if (!(headers.contentType ?? '').toLowerCase().startsWith('application/json'))
    return { status: 415, error: 'Send JSON.' };
  let originHost: string | null = null;
  try {
    originHost = headers.origin ? new URL(headers.origin).host : null;
  } catch {
    originHost = null;
  }
  if (!originHost || !headers.host || originHost.toLowerCase() !== headers.host.toLowerCase())
    return { status: 403, error: 'Requests must come from this app.' };
  if (headers.length && Number(headers.length) > LIMITS.body)
    return { status: 413, error: 'The request is too large.' };
  return null;
}

export function tokenMatches(expected: string | undefined, given: string | undefined): boolean {
  if (!expected) return true;
  if (!given) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}
