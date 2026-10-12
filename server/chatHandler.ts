import type { ChatProvider } from '../src/ai/agent';
import { runAgent } from '../src/ai/agent';
import { SYSTEM_PROMPT } from '../src/ai/prompt';
import { parseDesign } from '../src/lib/persistence';
import { anthropicProvider, describeAnthropicError } from './providers/anthropic';
import { openAICompatProvider } from './providers/openaiCompat';

export type Env = Record<string, string | undefined>;
type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface ProviderConfig {
  provider: 'anthropic' | 'openai-compatible';
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  effort?: Effort;
}

const MAX_MESSAGE = 10000;
const MAX_HISTORY = 400; // entries; reject rather than drop, history must stay append-only
const MAX_HISTORY_BYTES = 3 * 1024 * 1024;
const sameUrl = (a?: string, b?: string) => !!a && !!b && a.replace(/\/+$/, '') === b.replace(/\/+$/, '');

/**
 * Cross-site protection. Browsers send Origin on cross-site POSTs, and requiring JSON forces a CORS preflight,
 * so a web page the user visits cannot drive this route. Returns an error response, or null if the request may proceed.
 */
export function checkRequest(headers: Record<string, string | string[] | undefined>): { status: number; json: { error: string } } | null {
  const type = String(headers['content-type'] ?? '');
  if (!/^application\/json\b/i.test(type)) return { status: 415, json: { error: 'Content-Type must be application/json.' } };
  const origin = headers.origin;
  if (typeof origin === 'string') {
    let host = '';
    try {
      host = new URL(origin).host;
    } catch {
      // unparsable origin → rejected below
    }
    if (host !== headers.host) return { status: 403, json: { error: 'Cross-origin requests are not allowed.' } };
  }
  return null;
}
const EFFORTS: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max'];
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function defaultProviderFactory(cfg: ProviderConfig): ChatProvider {
  return cfg.provider === 'anthropic'
    ? anthropicProvider({ apiKey: cfg.apiKey, baseURL: cfg.baseUrl, model: cfg.model, effort: cfg.effort })
    : openAICompatProvider({ baseUrl: cfg.baseUrl!, model: cfg.model!, apiKey: cfg.apiKey });
}

/** What the browser may know about the server's AI setup — never the keys themselves. */
export function publicConfig(env: Env) {
  return { anthropicKey: !!env.ANTHROPIC_API_KEY, llmKey: !!env.LLM_API_KEY, llmBaseUrl: env.LLM_BASE_URL ?? '', llmModel: env.LLM_MODEL ?? '' };
}

const bad = (error: string) => ({ status: 400, json: { error } });

/** Validates an untrusted /api/chat request body and runs one agent turn. */
export async function handleChat(body: unknown, env: Env, makeProvider: (cfg: ProviderConfig) => ChatProvider = defaultProviderFactory) {
  if (!isObj(body)) return bad('Request body must be a JSON object.');
  const message = str(body.message);
  if (!message) return bad('Message is empty.');
  if (message.length > MAX_MESSAGE) return bad(`Message is longer than ${MAX_MESSAGE} characters.`);
  if (!Array.isArray(body.history)) return bad('history must be an array.');
  if (body.history.length > MAX_HISTORY || JSON.stringify(body.history).length > MAX_HISTORY_BYTES) {
    return bad('This conversation is too long. Click “New chat” to start a fresh one (the design is kept).');
  }
  const design = parseDesign(body.design);
  if (!design) return bad('The design in the request is not valid.');

  const s = isObj(body.settings) ? body.settings : {};
  let cfg: ProviderConfig;
  if (s.provider === 'anthropic') {
    cfg = {
      provider: 'anthropic',
      model: str(s.model),
      baseUrl: str(s.baseUrl),
      // A server key only ever goes to Anthropic's default endpoint, never to a URL chosen by the browser.
      apiKey: str(s.apiKey) ?? (str(s.baseUrl) ? undefined : env.ANTHROPIC_API_KEY),
      effort: EFFORTS.includes(s.effort as Effort) ? (s.effort as Effort) : 'medium',
    };
  } else if (s.provider === 'openai-compatible') {
    const baseUrl = str(s.baseUrl) ?? env.LLM_BASE_URL;
    // The server key only goes to the server-configured URL.
    cfg = { provider: 'openai-compatible', baseUrl, model: str(s.model) ?? env.LLM_MODEL, apiKey: str(s.apiKey) ?? (sameUrl(baseUrl, env.LLM_BASE_URL) ? env.LLM_API_KEY : undefined) };
    if (!cfg.baseUrl || !/^https?:\/\//.test(cfg.baseUrl)) return bad('Set a base URL (e.g. http://localhost:11434/v1) in AI settings or LLM_BASE_URL.');
    if (!cfg.model) return bad('Set a model name in AI settings or LLM_MODEL.');
  } else {
    return bad('Unknown provider.');
  }

  try {
    const result = await runAgent({ provider: makeProvider(cfg), system: SYSTEM_PROMPT, history: body.history, message, design });
    return { status: 200, json: result };
  } catch (e) {
    const error = cfg.provider === 'anthropic' ? describeAnthropicError(e) : e instanceof Error ? e.message : String(e);
    return { status: 502, json: { error } };
  }
}
