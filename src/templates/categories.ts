import type { Category, TemplateDef } from '../types';

/** Library categories, in display order. */
export const CATEGORIES: { id: Category; hint: string }[] = [
  { id: 'Wardrobes', hint: 'Complete wardrobes with hanging space' },
  { id: 'Cabinets', hint: 'Carcasses, drawer units and storage cabinets' },
  { id: 'Fronts', hint: 'Doors, drawers and sliding doors' },
  { id: 'Interior', hint: 'Rails, shelves and pull-outs that go inside' },
  { id: 'Panels', hint: 'Single boards' },
  { id: 'Base & trim', hint: 'Plinths, cornices and finishing pieces' },
];

/** Same template with other defaults (e.g. a shallow carcass as a shoe cabinet). */
export function variant(base: TemplateDef, o: Omit<Partial<TemplateDef>, 'params' | 'build'> & { id: string; name: string; description: string; defaults: Record<string, number> }): TemplateDef {
  const { defaults, ...meta } = o;
  return {
    ...base,
    ...meta,
    params: base.params.map((p) => (p.key in defaults ? { ...p, default: Math.min(p.max, Math.max(p.min, defaults[p.key])) } : p)),
  };
}

const words = (s: string) => s.toLowerCase().split(/\s+/).filter(Boolean);

/** Every query word must appear in the name, id, category, description or tags. */
export function matchesQuery(t: TemplateDef, query: string): boolean {
  const hay = [t.name, t.id, t.category, t.description, ...(t.tags ?? [])].join(' ').toLowerCase();
  return words(query).every((w) => hay.includes(w));
}
