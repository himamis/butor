import { useCallback, useEffect, useState } from 'react';
import { importDesign, newId, type Design } from '../core';
import { catalog } from '../catalog';
import { parseDesignFile } from '../persistence/files';
import type { IndexEntry } from '../persistence/repository';
import { pickTextFile } from './download';
import { getRepository } from './repo';
import { navigate } from './router';
import { useUi } from './ui';

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

/** Saved designs with New, Open, Rename, Duplicate, Delete and Import (docs/v2/01-features.md#f1-designs). */
export function StartScreen() {
  const [entries, setEntries] = useState<IndexEntry[] | null>(null);
  const [persistent, setPersistent] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const repo = await getRepository();
    setPersistent(repo.persistent);
    setEntries(await repo.list());
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const load = async (id: string): Promise<Design | null> => {
    const r = importDesign(await (await getRepository()).get(id), catalog);
    if (!r.ok) setMessage(r.error);
    return r.ok ? r.design : null;
  };
  const stamp = (d: Design, patch: Partial<Design>): Design => {
    const now = new Date().toISOString();
    return { ...d, ...patch, meta: { ...d.meta, updatedAt: now, ...(patch.id ? { createdAt: now } : {}) } };
  };

  const rename = async (e: IndexEntry, name: string) => {
    setRenaming(null);
    const d = name.trim() && name.trim() !== e.name ? await load(e.id) : null;
    if (!d) return;
    await (await getRepository()).save(stamp(d, { name: name.trim().slice(0, 200) }));
    void refresh();
  };
  const duplicate = async (e: IndexEntry) => {
    const d = await load(e.id);
    if (!d) return;
    await (await getRepository()).save(stamp(d, { id: newId(), name: `${d.name} (copy)`.slice(0, 200) }), e.thumbnail);
    void refresh();
  };
  const remove = async (e: IndexEntry) => {
    if (!window.confirm(`Delete “${e.name}”? This cannot be undone.`)) return;
    await (await getRepository()).remove(e.id);
    void refresh();
  };
  const importFile = async () => {
    const text = await pickTextFile('.json,application/json');
    if (text === null) return;
    const r = parseDesignFile(text, catalog);
    if (!r.ok) {
      setMessage(r.error);
      return;
    }
    // Always a new design: importing never overwrites one you have.
    const d = stamp(r.design, { id: newId() });
    await (await getRepository()).save(d);
    if (r.warnings.length) useUi.getState().set({ notice: `Imported with warnings: ${r.warnings.join('; ')}` });
    navigate(`/design/${d.id}`);
  };

  return (
    <main className="start" aria-label="Designs">
      <header className="start-head">
        <h1>Butor</h1>
        <div className="row">
          <button type="button" className="primary" onClick={() => navigate('/new')}>
            New design
          </button>
          <button type="button" onClick={() => void importFile()}>
            Import file…
          </button>
          <button type="button" onClick={() => navigate('/help')}>
            Help
          </button>
        </div>
      </header>
      {!persistent && (
        <p className="notice" role="status">
          This browser is not letting Butor store designs (private window or blocked storage). You can still design, but
          export a file before you close the page.
        </p>
      )}
      {message && (
        <p className="notice" role="alert">
          {message}
        </p>
      )}
      {entries && !entries.length && <p className="muted">No designs yet. Start a new one, or import a file.</p>}
      <ul className="design-grid">
        {entries?.map((e) => (
          <li key={e.id} className="design-card" aria-label={e.name}>
            <button
              type="button"
              className="thumb"
              onClick={() => navigate(`/design/${e.id}`)}
              aria-label={`Open ${e.name}`}
            >
              {e.thumbnail ? <img src={e.thumbnail} alt="" /> : <span className="muted">No preview</span>}
            </button>
            {renaming === e.id ? (
              <input
                aria-label="New name"
                defaultValue={e.name}
                autoFocus
                onBlur={(ev) => void rename(e, ev.target.value)}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter') ev.currentTarget.blur();
                  if (ev.key === 'Escape') setRenaming(null);
                }}
              />
            ) : (
              <strong className="design-name">{e.name}</strong>
            )}
            <span className="muted small">{when(e.updatedAt)}</span>
            <div className="row">
              <button type="button" onClick={() => navigate(`/design/${e.id}`)}>
                Open
              </button>
              <button type="button" onClick={() => setRenaming(e.id)}>
                Rename
              </button>
              <button type="button" onClick={() => void duplicate(e)}>
                Duplicate
              </button>
              <button type="button" onClick={() => void remove(e)}>
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
