import { create } from 'zustand';
import { useApp } from '../app/store';
import { runAiTurn, type AiFinal } from './client';
import { loadSettings, saveSettings, type AiSettings } from './settings';

export interface ChatEntry {
  id: number;
  role: 'user' | 'assistant' | 'error';
  text: string;
  status?: string; // progress while running
  changes?: string[];
  tx?: { label: string; revision: number }; // the committed transaction (for "Undo this")
  undone?: boolean;
  note?: string; // e.g. "not applied"
}

const CONFLICT_NOTE =
  '(Note: the changes from your previous reply were NOT applied, because the design was edited while you were working. ' +
  'The design attached below is the current one.)';

interface ChatState {
  entries: ChatEntry[];
  history: unknown[]; // provider-native, append-only; echoed back to the server each turn
  historyProvider: AiSettings['provider'] | null;
  running: boolean;
  conflictNote: boolean;
  settings: AiSettings;
  abort: AbortController | null;
  setSettings(patch: Partial<AiSettings>): void;
  newChat(): void;
  send(text: string): Promise<void>;
  stop(): void;
  undoEntry(id: number): void;
}

let seq = 0;

/** The assistant conversation (docs/v2/08-ai.md#ui). One request = one transaction = one undo step. */
export const useChat = create<ChatState>()((set, get) => {
  const patch = (id: number, p: Partial<ChatEntry> | ((e: ChatEntry) => Partial<ChatEntry>)) =>
    set({ entries: get().entries.map((e) => (e.id === id ? { ...e, ...(typeof p === 'function' ? p(e) : p) } : e)) });

  const finish = (id: number, r: AiFinal) => {
    const s = get();
    set({ history: r.history, historyProvider: s.settings.provider });
    const reply = r.reply || (r.transaction.ops.length ? 'Done.' : 'No changes.');
    if (!r.transaction.ops.length) {
      patch(id, { text: reply, status: undefined });
      return;
    }
    const applied = useApp.getState().applyRemote(r.transaction, r.baseRevision);
    if (applied.ok) {
      patch(id, {
        text: reply,
        status: undefined,
        changes: r.changes,
        tx: { label: r.transaction.label, revision: applied.revision },
      });
      set({ conflictNote: false });
    } else {
      patch(id, {
        text: reply,
        status: undefined,
        note: applied.conflict
          ? 'Not applied: the design was changed while the assistant was working. Ask again; it will be told.'
          : `Not applied: ${applied.message ?? 'the changes no longer fit the design'}.`,
      });
      set({ conflictNote: true });
    }
  };

  return {
    entries: [],
    history: [],
    historyProvider: null,
    running: false,
    conflictNote: false,
    settings: loadSettings(),
    abort: null,

    setSettings(p) {
      if (get().running) return;
      const next = { ...get().settings, ...p };
      saveSettings(next);
      // Histories are provider-specific: switching provider starts a new chat.
      if (p.provider && p.provider !== get().settings.provider)
        set({ settings: next, entries: [], history: [], historyProvider: null, conflictNote: false });
      else set({ settings: next });
    },

    newChat() {
      if (get().running) return;
      set({ entries: [], history: [], historyProvider: null, conflictNote: false });
    },

    async send(text) {
      const s = get();
      if (s.running || !text.trim()) return;
      const app = useApp.getState();
      if (app.readOnly) return;
      const history = s.historyProvider && s.historyProvider !== s.settings.provider ? [] : s.history;
      const message = s.conflictNote ? `${CONFLICT_NOTE}\n\n${text.trim()}` : text.trim();
      const user: ChatEntry = { id: ++seq, role: 'user', text: text.trim() };
      const reply: ChatEntry = { id: ++seq, role: 'assistant', text: '', status: 'Thinking…' };
      const abort = new AbortController();
      set({ entries: [...s.entries, user, reply], running: true, abort });
      try {
        await runAiTurn(
          s.settings,
          { message, design: app.design, history },
          (e) => {
            if (e.type === 'text') patch(reply.id, (x) => ({ text: x.text + e.delta }));
            else if (e.type === 'progress') patch(reply.id, { status: e.text });
            else if (e.type === 'final') finish(reply.id, e.result);
            else patch(reply.id, { role: 'error', text: e.message, status: undefined });
          },
          abort.signal,
        );
      } catch (e) {
        patch(
          reply.id,
          abort.signal.aborted
            ? { status: undefined, note: 'Stopped.' }
            : { role: 'error', text: e instanceof Error ? e.message : String(e), status: undefined },
        );
      } finally {
        set({ running: false, abort: null });
      }
    },

    stop() {
      get().abort?.abort();
    },

    undoEntry(id) {
      const e = get().entries.find((x) => x.id === id);
      if (!e?.tx || e.undone) return;
      const app = useApp.getState();
      const last = app.history.past.at(-1);
      if (app.design.revision === e.tx.revision && last?.label === e.tx.label) {
        app.undo();
        patch(id, { undone: true, note: 'Undone.' });
      } else patch(id, { note: 'Later changes were made after this one — undo those first (Ctrl/⌘ Z).' });
    },
  };
});
