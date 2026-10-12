import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { parseDesign } from '../lib/persistence';

type Provider = 'anthropic' | 'openai-compatible';
interface Settings {
  provider: Provider;
  model: string;
  baseUrl: string;
  apiKey: string;
  effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
}
interface Msg {
  role: 'user' | 'assistant' | 'error';
  text: string;
  changes?: string[];
}
interface ServerConfig {
  anthropicKey: boolean;
  llmKey: boolean;
  llmBaseUrl: string;
  llmModel: string;
}

const KEY = 'wardrobe-designer:ai-settings';
const DEFAULTS: Settings = { provider: 'anthropic', model: '', baseUrl: '', apiKey: '', effort: 'medium' };

function loadSettings(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return DEFAULTS;
  }
}
function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // settings just won't persist
  }
}

function SettingsForm({ s, set, server }: { s: Settings; set: (s: Settings) => void; server: ServerConfig | null }) {
  const field = (k: keyof Settings) => ({ value: s[k], onChange: (e: { target: { value: string } }) => set({ ...s, [k]: e.target.value }) });
  const anthropic = s.provider === 'anthropic';
  const serverKey = anthropic ? server?.anthropicKey : server?.llmKey;
  return (
    <div className="chat-settings">
      <div className="row">
        <label>Provider</label>
        <select {...field('provider')}>
          <option value="anthropic">Anthropic (Claude)</option>
          <option value="openai-compatible">OpenAI-compatible</option>
        </select>
      </div>
      <div className="row">
        <label>Model</label>
        <input type="text" placeholder={anthropic ? 'claude-opus-5-5' : server?.llmModel || 'e.g. qwen3'} {...field('model')} />
      </div>
      <div className="row">
        <label>Base URL</label>
        <input type="text" placeholder={anthropic ? 'default' : server?.llmBaseUrl || 'http://localhost:11434/v1'} {...field('baseUrl')} />
      </div>
      <div className="row">
        <label>API key</label>
        <input type="password" placeholder={serverKey ? 'using the server’s key' : anthropic ? 'or set ANTHROPIC_API_KEY' : 'optional'} {...field('apiKey')} />
      </div>
      {anthropic && (
        <div className="row">
          <label>Effort</label>
          <select {...field('effort')}>
            {['low', 'medium', 'high', 'xhigh', 'max'].map((e) => <option key={e}>{e}</option>)}
          </select>
        </div>
      )}
      <small style={{ color: 'var(--muted)' }}>
        Requests go through this app’s server, which holds any environment keys. A key typed here is stored in this browser only.
      </small>
    </div>
  );
}

export function ChatPanel({ hidden }: { hidden: boolean }) {
  const [settings, setSettingsState] = useState(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [server, setServer] = useState<ServerConfig | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const history = useRef<unknown[]>([]); // provider-native, append-only
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/chat/config')
      .then((r) => (r.ok ? r.json() : null))
      .then(setServer)
      .catch(() => setServer(null));
  }, []);
  useEffect(() => {
    // Braces matter: newer browsers return a Promise from scrollTo, which React must not receive.
    log.current?.scrollTo(0, log.current.scrollHeight);
  }, [msgs, busy]);

  const setSettings = (s: Settings) => {
    if (s.provider !== settings.provider) {
      history.current = []; // histories are provider-specific
      setMsgs((m) => (m.length ? [...m, { role: 'assistant', text: 'Switched provider — starting a new conversation.' }] : m));
    }
    setSettingsState(s);
    saveSettings(s);
  };

  const newChat = () => {
    history.current = [];
    setMsgs([]);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setMsgs((m) => [...m, { role: 'user', text }]);
    setBusy(true);
    const sent = useStore.getState().design;
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings, history: history.current, message: text, design: sent }),
      });
      if (res.status === 404) throw new Error('The AI chat needs the app’s server — run it with npm run dev or npm run preview.');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Server error ${res.status}`);

      history.current = data.history;
      const next = parseDesign(data.design);
      const changed = next && JSON.stringify(next) !== JSON.stringify(sent);
      if (changed && useStore.getState().design !== sent) {
        setMsgs((m) => [...m, { role: 'assistant', text: data.reply }, { role: 'error', text: 'You edited the design while the AI was working, so its changes were not applied. Ask again to redo them on the current design.' }]);
        return;
      }
      if (changed) useStore.getState().commit(() => next); // one undo step for the whole request
      setMsgs((m) => [...m, { role: 'assistant', text: data.reply, changes: data.changes }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: 'error', text: e instanceof Error ? e.message : String(e) }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="chat" hidden={hidden}>
      <div className="chat-head">
        <b>AI assistant</b>
        <span className="buttons" style={{ margin: 0 }}>
          <button onClick={newChat} disabled={busy || !msgs.length}>New chat</button>
          <button className={showSettings ? 'active' : ''} onClick={() => setShowSettings(!showSettings)}>Settings</button>
        </span>
      </div>
      {showSettings && <SettingsForm s={settings} set={setSettings} server={server} />}
      <div className="chat-log" ref={log}>
        {!msgs.length && (
          <p style={{ color: 'var(--muted)' }}>
            Describe a change, e.g. “Add a 1000 mm wide carcass with two doors against the back wall, next to the existing one” or “Make all fronts walnut”. Each request is one undo step.
          </p>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.text}
            {m.changes && m.changes.length > 0 && (
              <div className="changes">
                {m.changes.map((c, j) => <div key={j}>• {c}</div>)}
              </div>
            )}
          </div>
        ))}
        {busy && <div className="msg assistant">Working…</div>}
      </div>
      <div className="chat-input">
        <textarea
          value={input}
          placeholder="Ask for a change… (Enter to send, Shift+Enter for a new line)"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button onClick={send} disabled={busy || !input.trim()}>Send</button>
      </div>
    </aside>
  );
}
