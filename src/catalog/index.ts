import { createRegistry, type AnyTemplate, type Category, type TemplateKind } from '../core';
import { cornerUnit } from './units/corner';
import { standardUnit } from './units/standard';
import { ITEMS } from './items';
import { FRONTS } from './fronts';
import { PARTS } from './parts';
import { PRESETS, type Preset } from './presets';

export { PRESETS, instantiatePreset, type Preset } from './presets';
export { DEFAULT_MATERIALS, DEFAULT_ROLES } from './materials';
export { hingesFor, runnerLength } from './builders/hardware';

/** Every template, registered once. To add a template: write it and add it to the matching list. */
export const TEMPLATES: AnyTemplate[] = [standardUnit, cornerUnit, ...ITEMS, ...FRONTS, ...PARTS];
export const catalog = createRegistry(TEMPLATES);

export const CATEGORIES: { id: Category; hint: string }[] = [
  { id: 'Wardrobes', hint: 'Complete wardrobes with hanging space' },
  { id: 'Cabinets', hint: 'Units, drawer units and storage cabinets' },
  { id: 'Fronts', hint: 'Doors, flaps, sliding doors and drawer fronts — drop onto a unit' },
  { id: 'Interior', hint: 'Shelves, rails, drawers and pull-outs — drop into a unit column' },
  { id: 'Panels', hint: 'Single boards' },
  { id: 'Base & trim', hint: 'Plinths, cornices, lights and finishing pieces' },
];

/** What the library shows: presets and templates. */
export interface LibraryEntry {
  id: string;
  kind: 'preset' | TemplateKind;
  name: string;
  category: Category;
  description: string;
  tags: string[];
}

export const LIBRARY: LibraryEntry[] = [
  ...PRESETS.map(
    (p: Preset): LibraryEntry => ({
      id: p.id,
      kind: 'preset',
      name: p.name,
      category: p.category,
      description: p.description,
      tags: p.tags,
    }),
  ),
  ...TEMPLATES.map(
    (t): LibraryEntry => ({
      id: t.id,
      kind: t.kind,
      name: t.name,
      category: t.category,
      description: t.description,
      tags: t.tags,
    }),
  ),
];

/** Every query word must appear in the name, id, category, description or tags (case-insensitive). */
export function searchLibrary(query: string, category: Category | null = null): LibraryEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return LIBRARY.filter((e) => {
    if (category && e.category !== category) return false;
    const hay = [e.name, e.id, e.category, e.description, ...e.tags].join(' ').toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
export { HARDWARE_PRICES } from './prices';
