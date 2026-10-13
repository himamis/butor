import { useEffect, useRef, useState } from 'react';
import { useChat } from './chat';
import type { AiSettings } from './settings';

interface ServerConfig {
  anthropic: { serverKey: boolean; defaultModel: string };
  openai: { serverKey: boolean; baseUrl: string | null; model: string | null };
  tokenRequired: boolean;
}

const EXAMPLES = [
  'Add a 1000 mm wardrobe with two doors next to the left one',
  'Make all fronts walnut',
  'Put three drawers at the bottom of column 2',
];

/** The assistant chat (lazy-loaded): streamed replies, a change list per request with "Undo this", settings. */
export function ChatPanel() {
  const { entries, running, settings } = useChat();
  const [text, setText] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/ai/config')
      .then((r) => (r.ok ? (r.json() as Promise<ServerConfig>) : null))
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [entries]);

  const chat = useChat.getState();
  const needsKey =
    !!config &&
    (settings.provider === 'anthropic'
      ? !settings.apiKey && !config.anthropic.serverKey
      : !settings.baseUrl && !config.openai.baseUrl);
  // Open the settings when something is missing, and keep them open while it is being typed in.
  useEffect(() => {
    if (needsKey) setShowSettings(true);
  }, [needsKey]);
  const send = () => {
    const t = text;
    setText('');
    void chat.send(t);
  };

  return (
    <div className="chat" aria-label="Assistant">
      <div className="row chat-head">
        <select
          aria-label="AI provider"
          value={settings.provider}
          disabled={running}
          onChange={(e) => chat.setSettings({ provider: e.target.value as AiSettings['provider'] })}
        >
          <option value="anthropic">Claude (Anthropic)</option>
          <option value="openai">OpenAI-compatible / local</option>
        </select>
        <button type="button" onClick={() => setShowSettings(!showSettings)} aria-expanded={showSettings}>
          Settings
        </button>
        <button type="button" onClick={() => chat.newChat()} disabled={running}>
          New chat
        </button>
      </div>
      {showSettings && <Settings config={config} disabled={running} />}
      <div className="chat-log" ref={list} aria-live="polite">
        {!entries.length && (
          <div className="muted small">
            <p>Ask for changes in plain words. Each request is one undo step.</p>
            <ul>
              {EXAMPLES.map((x) => (
                <li key={x}>
                  <button type="button" className="disclosure" onClick={() => setText(x)}>
                    “{x}”
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {entries.map((e) => (
          <div key={e.id} className={`msg ${e.role}`} data-testid={`chat-${e.role}`}>
            {e.text && <p>{e.text}</p>}
            {e.status && <p className="muted small">{e.status}</p>}
            {e.changes && e.changes.length > 0 && (
              <details>
                <summary>
                  {e.changes.length} change{e.changes.length === 1 ? '' : 's'}
                </summary>
                <ul className="small">
                  {e.changes.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </details>
            )}
            {e.tx && !e.undone && (
              <button type="button" className="small" onClick={() => chat.undoEntry(e.id)}>
                Undo this
              </button>
            )}
            {e.note && <p className="note small">{e.note}</p>}
          </div>
        ))}
      </div>
      <div className="composer">
        <textarea
          aria-label="Message to the assistant"
          rows={3}
          value={text}
          placeholder="Describe a change…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        {running ? (
          <button type="button" onClick={() => chat.stop()}>
            Stop
          </button>
        ) : (
          <button type="button" className="primary" onClick={send} disabled={!text.trim()}>
            Send
          </button>
        )}
      </div>
    </div>
  );
}

function Settings({ config, disabled }: { config: ServerConfig | null; disabled: boolean }) {
  const settings = useChat((s) => s.settings);
  const set = useChat.getState().setSettings;
  const a = settings.provider === 'anthropic';
  const serverKey = a ? config?.anthropic.serverKey : config?.openai.serverKey;
  return (
    <fieldset className="chat-settings" disabled={disabled}>
      <label className="field text">
        <span>Model</span>
        <input
          aria-label="Model"
          value={settings.model}
          placeholder={
            a ? (config?.anthropic.defaultModel ?? 'claude-opus-5-5') : (config?.openai.model ?? 'model name')
          }
          onChange={(e) => set({ model: e.target.value })}
        />
      </label>
      <label className="field text">
        <span>Base URL</span>
        <input
          aria-label="Base URL"
          value={settings.baseUrl}
          placeholder={a ? 'https://api.anthropic.com' : (config?.openai.baseUrl ?? 'http://localhost:11234/v1')}
          onChange={(e) => set({ baseUrl: e.target.value })}
        />
      </label>
      <label className="field text">
        <span>API key</span>
        <input
          aria-label="API key"
          type="password"
          autoComplete="off"
          value={settings.apiKey}
          placeholder={serverKey ? 'using the server key' : a ? 'sk-ant-…' : 'optional for local servers'}
          onChange={(e) => set({ apiKey: e.target.value })}
        />
      </label>
      {a && (
        <label className="field">
          <span>Effort</span>
          <select
            aria-label="Effort"
            value={settings.effort}
            onChange={(e) => set({ effort: e.target.value as AiSettings['effort'] })}
          >
            {(['low', 'medium', 'high', 'xhigh', 'max'] as const).map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>
      )}
      {config?.tokenRequired && (
        <label className="field text">
          <span>Access token</span>
          <input
            aria-label="Access token"
            type="password"
            value={settings.accessToken}
            onChange={(e) => set({ accessToken: e.target.value })}
          />
        </label>
      )}
      <p className="muted small">
        Keys are kept in this browser only and sent to this app’s server for each request. A server key is only ever
        used with its own endpoint.
      </p>
    </fieldset>
  );
}
