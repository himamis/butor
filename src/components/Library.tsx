import { useState } from 'react';
import { TEMPLATES } from '../templates';

export function Library() {
  const [q, setQ] = useState('');
  const shown = TEMPLATES.filter((t) => t.name.toLowerCase().includes(q.trim().toLowerCase()));
  const categories = [...new Set(shown.map((t) => t.category))];

  return (
    <aside className="library">
      <input type="text" placeholder="Search templates…" value={q} onChange={(e) => setQ(e.target.value)} />
      {categories.map((c) => (
        <div key={c}>
          <h3 style={{ marginTop: 14 }}>{c}</h3>
          {shown
            .filter((t) => t.category === c)
            .map((t) => {
              const p = Object.fromEntries(t.params.map((d) => [d.key, d.default]));
              return (
                <div
                  key={t.id}
                  className="card"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('template', t.id);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                >
                  {t.name}
                  <small>{p.width} × {p.height} × {p.depth} mm</small>
                </div>
              );
            })}
        </div>
      ))}
      {!shown.length && <p style={{ color: 'var(--muted)' }}>No templates match.</p>}
    </aside>
  );
}
