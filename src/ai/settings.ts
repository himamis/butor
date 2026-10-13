/** Assistant settings, kept in this browser only (docs/v2/08-ai.md#ui). Keys never leave it except to our server. */
export interface AiSettings {
  provider: 'anthropic' | 'openai';
  model: string; // empty = server default
  baseUrl: string; // empty = server default
  apiKey: string; // empty = server key (if any)
  effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  accessToken: string; // for servers with AI_ACCESS_TOKEN
}

const KEY = 'butor:ai-settings';

export const DEFAULT_SETTINGS: AiSettings = {
  provider: 'anthropic',
  model: '',
  baseUrl: '',
  apiKey: '',
  effort: 'medium',
  accessToken: '',
};

export function loadSettings(): AiSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AiSettings>) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: AiSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // storage blocked: the settings last for this page only
  }
}
