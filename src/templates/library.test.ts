import { describe, expect, it } from 'vitest';
import { CATEGORIES, TEMPLATES, defaultParams, getTemplate, searchTemplates } from '.';
import { HANDLE } from './hardware';
import { hardwareList, cutList } from '../lib/cutlist';
import { obj } from '../test/fixtures';
import type { Panel } from '../types';

const build = (id: string, p: Record<string, number> = {}) => {
  const t = getTemplate(id);
  return t.build({ ...defaultParams(t), ...p });
};
const motions = (ps: Panel[]) => new Set(ps.filter((p) => p.motion).map((p) => p.motion!.id));

describe('library organisation', () => {
  it('has a broad set of templates, each with a known category and a description', () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(20);
    for (const t of TEMPLATES) {
      expect(CATEGORIES.map((c) => c.id)).toContain(t.category);
      expect(t.description.length).toBeGreaterThan(10);
    }
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
  });

  it('every category has templates', () => {
    for (const c of CATEGORIES) expect(TEMPLATES.some((t) => t.category === c.id)).toBe(true);
  });
});

describe('searchTemplates', () => {
  it('matches names, descriptions and tags, case-insensitively, all words required', () => {
    expect(searchTemplates('SHOE').map((t) => t.id)).toEqual(expect.arrayContaining(['shoe-cabinet', 'shoe-shelf']));
    expect(searchTemplates('sliding door').map((t) => t.id)).toEqual(expect.arrayContaining(['sliding-door', 'sliding-wardrobe']));
    expect(searchTemplates('closet').length).toBeGreaterThan(0); // tag synonym
    expect(searchTemplates('zzz')).toEqual([]);
  });

  it('filters by category and returns everything for an empty query', () => {
    expect(searchTemplates('', null)).toHaveLength(TEMPLATES.length);
    const fronts = searchTemplates('', 'Fronts');
    expect(fronts.length).toBeGreaterThan(0);
    expect(fronts.every((t) => t.category === 'Fronts')).toBe(true);
    expect(searchTemplates('door', 'Interior')).toEqual([]);
  });
});

describe('new templates', () => {
  it('drawer unit: N independent drawers', () => {
    expect(motions(build('drawer-unit', { drawers: 5 })).size).toBe(5);
  });

  it('wardrobe: hanging rail under a top shelf, behind doors', () => {
    const ps = build('wardrobe');
    const rail = ps.find((p) => p.role === 'rail')!;
    const shelf = ps.find((p) => p.name === 'Top shelf')!;
    expect(rail.pos.y).toBeLessThan(shelf.pos.y);
    expect(ps.filter((p) => p.role === 'door')).toHaveLength(2);
  });

  it('sliding wardrobe: doors slide sideways on two tracks, never forward', () => {
    const ps = build('sliding-wardrobe');
    const doors = ps.filter((p) => p.role === 'door');
    expect(doors).toHaveLength(2);
    expect(new Set(doors.map((d) => d.pos.z)).size).toBe(2);
    for (const d of doors.filter((d) => d.motion)) {
      expect(d.motion).toMatchObject({ kind: 'slide', offset: { z: 0 } });
      expect(d.motion!.kind === 'slide' && Math.abs(d.motion!.offset.x)).toBeGreaterThan(300);
    }
  });

  it('sliding door: direction param flips the travel', () => {
    const l = build('sliding-door', { direction: 0 }).find((p) => p.role === 'door')!.motion!;
    const r = build('sliding-door', { direction: 1 }).find((p) => p.role === 'door')!.motion!;
    expect(l.kind === 'slide' && l.offset.x).toBeLessThan(0);
    expect(r.kind === 'slide' && r.offset.x).toBeGreaterThan(0);
  });

  it('corner unit: L-shaped, no parts in the open corner', () => {
    const p = { width: 1200, depth: 1200, armDepth: 500 };
    const ps = build('corner-unit', p);
    for (const pn of ps) {
      const inOpenCorner = pn.pos.x - pn.size.x / 2 > -600 + 500 + 1 && pn.pos.z - pn.size.z / 2 > -600 + 500 + 1;
      expect(inOpenCorner).toBe(false);
    }
  });

  it('interior drawers and pull-outs slide forward', () => {
    for (const id of ['inner-drawers', 'pull-out-basket', 'trouser-rack']) {
      const m = build(id).find((p) => p.motion)!.motion!;
      expect(m.kind === 'slide' && m.offset.z).toBeGreaterThan(100);
    }
  });

  it('baskets and runners are listed as hardware, not as boards', () => {
    const objs = [obj('pull-out-basket'), obj('trouser-rack')];
    expect(hardwareList(objs).map((h) => h.part)).toEqual(expect.arrayContaining([expect.stringMatching(/basket/i), expect.stringMatching(/runner/i)]));
    expect(cutList([obj('pull-out-basket')])).toEqual([]);
  });

  it('shoe cabinet and open shelving are pre-configured variants', () => {
    expect(defaultParams(getTemplate('shoe-cabinet'))).toMatchObject({ depth: 350 });
    expect(build('open-shelving').filter((p) => p.name === 'Shelf').length).toBeGreaterThanOrEqual(4);
    expect(build('top-cabinet', { handle: HANDLE.knob }).some((p) => p.role === 'handle')).toBe(true);
  });
});
