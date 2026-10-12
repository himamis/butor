import { useEffect, useRef, useState } from 'react';
import { CATEGORIES, LIBRARY, searchLibrary, type LibraryEntry } from '../catalog';
import type { Category } from '../core';
import { useUi } from './ui';

const COLLAPSED = 'butor:library-collapsed';
const KIND_HINT: Record<LibraryEntry['kind'], string> = {
  preset: 'Drag into the room',
  unit: 'Drag into the room',
  part: 'Drag into the room',
  item: 'Drag into a unit column',
  front: 'Drag onto a unit',
};

function loadCollapsed(): Category[] {
  try {
    return JSON.parse(localStorage.getItem(COLLAPSED) ?? '[]') as Category[];
  } catch {
    return [];
  }
}

/** Library panel: search (/), category chips with counts, collapsible sections, draggable cards. */
export function Library() {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<Category | null>(null);
  const [collapsed, setCollapsed] = useState<Category[]>(loadCollapsed);
  const search = useRef<HTMLInputElement>(null);
  const setUi = useUi((s) => s.set);

  useEffect(() => {
    const focus = () => search.current?.focus();
    window.addEventListener('butor:search', focus);
    return () => {
      window.removeEventListener('butor:search', focus);
    };
  }, []);

  const toggle = (c: Category) => {
    const next = collapsed.includes(c) ? collapsed.filter((x) => x !== c) : [...collapsed, c];
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED, JSON.stringify(next));
    } catch {
      // a convenience only
    }
  };

  const shown = searchLibrary(q, category);
  const searching = q.trim() !== '' || category !== null;

  return (
    <aside className="library" aria-label="Library">
      <input
        ref={search}
        type="search"
        placeholder="Search…  ( / )"
        aria-label="Search the library"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setQ('');
            e.currentTarget.blur();
          }
        }}
      />
      <div className="chips" role="group" aria-label="Categories">
        <button type="button" aria-pressed={category === null} onClick={() => setCategory(null)}>
          All <span>{searchLibrary(q).length}</span>
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            title={c.hint}
            aria-pressed={category === c.id}
            onClick={() => setCategory(category === c.id ? null : c.id)}
          >
            {c.id} <span>{searchLibrary(q, c.id).length}</span>
          </button>
        ))}
      </div>
      {CATEGORIES.filter((c) => shown.some((e) => e.category === c.id)).map((c) => {
        const open = searching || !collapsed.includes(c.id);
        const entries = shown.filter((e) => e.category === c.id);
        return (
          <section key={c.id} aria-label={c.id}>
            <h3>
              <button
                type="button"
                className="section-toggle"
                aria-expanded={open}
                onClick={() => toggle(c.id)}
                title={c.hint}
              >
                {open ? '▾' : '▸'} {c.id} <span className="count">{entries.length}</span>
              </button>
            </h3>
            {open &&
              entries.map((entry) => (
                <div
                  key={entry.id}
                  className="card"
                  draggable
                  data-testid={`card-${entry.id}`}
                  title={`${entry.description}\n${KIND_HINT[entry.kind]}`}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/x-butor', entry.id);
                    e.dataTransfer.effectAllowed = 'copy';
                    setUi({ dragEntry: { kind: entry.kind, id: entry.id, name: entry.name } });
                  }}
                  onDragEnd={() => setUi({ dragEntry: null })}
                >
                  <span className="card-name">{entry.name}</span>
                  <small>{entry.description}</small>
                </div>
              ))}
          </section>
        );
      })}
      {!shown.length && <p className="muted">No matches for “{q}”.</p>}
      <p className="muted small">{LIBRARY.length} entries · drag to place</p>
    </aside>
  );
}
