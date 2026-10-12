import { useEffect, useRef, useState } from 'react';
import { CATEGORIES, TEMPLATES, defaultParams, searchTemplates } from '../templates';
import type { Category, TemplateDef } from '../types';

const COLLAPSED_KEY = 'wardrobe-designer:library-collapsed';

function loadCollapsed(): Category[] {
  try {
    return JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function Card({ t }: { t: TemplateDef }) {
  const p = defaultParams(t);
  return (
    <div
      className="card"
      draggable
      title={`${t.description}\nDrag into the room.`}
      onDragStart={(e) => {
        e.dataTransfer.setData('template', t.id);
        e.dataTransfer.effectAllowed = 'copy';
      }}
    >
      <span className="card-name">{t.name}</span>
      <small className="card-desc">{t.description}</small>
      <small>{p.width} × {p.height} × {p.depth} mm</small>
    </div>
  );
}

export function Library() {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<Category | null>(null);
  const [collapsed, setCollapsed] = useState<Category[]>(loadCollapsed);
  const search = useRef<HTMLInputElement>(null);

  // "/" jumps to the search box from anywhere outside an input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !(e.target as HTMLElement).closest('input, textarea, select')) {
        e.preventDefault();
        search.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggle = (c: Category) => {
    const next = collapsed.includes(c) ? collapsed.filter((x) => x !== c) : [...collapsed, c];
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next));
    } catch {
      // only a convenience
    }
  };

  const shown = searchTemplates(q, category);
  const searching = q.trim() !== '';
  const countIn = (c: Category) => searchTemplates(q, c).length;

  return (
    <aside className="library">
      <div className="search">
        <input
          ref={search}
          type="search"
          placeholder="Search templates…  ( / )"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && (setQ(''), (e.target as HTMLInputElement).blur())}
        />
      </div>
      <div className="chips">
        <button className={category === null ? 'chip active' : 'chip'} onClick={() => setCategory(null)}>
          All <span>{searchTemplates(q).length}</span>
        </button>
        {CATEGORIES.map((c) => (
          <button key={c.id} className={category === c.id ? 'chip active' : 'chip'} title={c.hint} onClick={() => setCategory(category === c.id ? null : c.id)}>
            {c.id} <span>{countIn(c.id)}</span>
          </button>
        ))}
      </div>

      {CATEGORIES.filter((c) => shown.some((t) => t.category === c.id)).map((c) => {
        // While searching or filtering, show matches even in collapsed sections.
        const open = searching || category !== null || !collapsed.includes(c.id);
        return (
          <section key={c.id}>
            <h3 className="cat-head" onClick={() => toggle(c.id)} title={c.hint}>
              <span>{open ? '▾' : '▸'} {c.id}</span>
              <span className="count">{shown.filter((t) => t.category === c.id).length}</span>
            </h3>
            {open && shown.filter((t) => t.category === c.id).map((t) => <Card key={t.id} t={t} />)}
          </section>
        );
      })}

      {!shown.length && (
        <p style={{ color: 'var(--muted)' }}>
          No templates match “{q}”{category ? ` in ${category}` : ''}.{' '}
          {category && <a href="#" onClick={(e) => (e.preventDefault(), setCategory(null))}>Search all categories</a>}
        </p>
      )}
      <p className="lib-foot">{TEMPLATES.length} templates · ask for more any time</p>
    </aside>
  );
}
