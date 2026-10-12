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
  const design = parseDesign(body.design);
  if (!design) return bad('The design in the request is not valid.');

  const s = isObj(body.settings) ? body.settings : {};
  let cfg: ProviderConfig;
  if (s.provider === 'anthropic') {
    cfg = {
      provider: 'anthropic',
      model: str(s.model),
      baseUrl: str(s.baseUrl),
      apiKey: str(s.apiKey) ?? env.ANTHROPIC_API_KEY,
      effort: EFFORTS.includes(s.effort as Effort) ? (s.effort as Effort) : 'medium',
    };
  } else if (s.provider === 'openai-compatible') {
    cfg = { provider: 'openai-compatible', baseUrl: str(s.baseUrl) ?? env.LLM_BASE_URL, model: str(s.model) ?? env.LLM_MODEL, apiKey: str(s.apiKey) ?? env.LLM_API_KEY };
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
