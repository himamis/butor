import { describe, expect, it } from 'vitest';
import { TEMPLATES, defaultParams, getTemplate } from '.';
import { HANDLE } from './hardware';
import { applyMotion } from '../lib/motion';
import type { Panel } from '../types';

const build = (id: string, p: Record<string, number> = {}) => {
  const t = getTemplate(id);
  return t.build({ ...defaultParams(t), ...p });
};
const fronts = (ps: Panel[]) => ps.filter((p) => p.role === 'door');
const handles = (ps: Panel[]) => ps.filter((p) => p.role === 'handle');

describe('every template', () => {
  for (const t of TEMPLATES) {
    const handleVariants = t.params.some((p) => p.key === 'handle') ? [HANDLE.none, HANDLE.knob, HANDLE.bar, HANDLE.cutout] : [undefined];
    for (const h of handleVariants) {
      it(`${t.id}${h === undefined ? '' : ` handle=${h}`}: closed panels lie inside width × height × depth`, () => {
        const p: Record<string, number> = { ...defaultParams(t), ...(h === undefined ? {} : { handle: h }) };
        const panels = t.build(p);
        expect(panels.length).toBeGreaterThan(0);
        for (const pn of panels) {
          expect(pn.size.x > 0 && pn.size.y > 0 && pn.size.z > 0).toBe(true);
          if (pn.role === 'handle') continue; // hardware sticks out in front
          const tol = 0.01;
          expect(pn.pos.x - pn.size.x / 2).toBeGreaterThanOrEqual(-p.width / 2 - tol);
          expect(pn.pos.x + pn.size.x / 2).toBeLessThanOrEqual(p.width / 2 + tol);
          expect(pn.pos.y - pn.size.y / 2).toBeGreaterThanOrEqual(-tol);
          expect(pn.pos.y + pn.size.y / 2).toBeLessThanOrEqual(p.height + tol);
          expect(pn.pos.z - pn.size.z / 2).toBeGreaterThanOrEqual(-p.depth / 2 - tol);
          expect(pn.pos.z + pn.size.z / 2).toBeLessThanOrEqual(p.depth / 2 + tol);
        }
      });
    }
  }
});

describe('door', () => {
  it.each([
    [0, 1],
    [1, -1],
  ])('hinge=%i puts the handle on the opposite side', (hinge, sign) => {
    const [handle] = handles(build('door', { hinge, handle: HANDLE.knob }));
    expect(Math.sign(handle.pos.x)).toBe(sign);
  });

  it('handle sits on the front face and moves with the door', () => {
    const ps = build('door', { handle: HANDLE.bar });
    const [front] = fronts(ps);
    const [handle] = handles(ps);
    expect(handle.pos.z - handle.size.z / 2).toBeCloseTo(front.pos.z + front.size.z / 2);
    expect(handle.motion).toEqual(front.motion);
  });

  it.each([0, 1])('hinge=%i opens outward (+z) at the free edge', (hinge) => {
    const [front] = fronts(build('door', { hinge }));
    const freeX = hinge === 0 ? front.pos.x + front.size.x / 2 : front.pos.x - front.size.x / 2;
    const moved = applyMotion(front.motion!, 1, { x: freeX, y: 0, z: front.pos.z });
    expect(moved.z).toBeGreaterThan(front.pos.z + 100);
  });

  it('openAngle sets the full-open angle', () => {
    const [front] = fronts(build('door', { hinge: 1, openAngle: 110 }));
    expect(front.motion).toMatchObject({ kind: 'hinge', angle: 110 });
  });

  it('cutout handle makes a grip hole and adds no hardware', () => {
    const ps = build('door', { handle: HANDLE.cutout });
    expect(handles(ps)).toHaveLength(0);
    expect(fronts(ps)[0].cutout?.kind).toBe('hole');
  });

  it('handlePos top/middle/bottom moves the handle vertically', () => {
    const ys = [0, 1, 2].map((handlePos) => handles(build('door', { handlePos }))[0].pos.y);
    expect(ys[0]).toBeGreaterThan(ys[1]);
    expect(ys[1]).toBeGreaterThan(ys[2]);
  });
});

describe('drawer', () => {
  it('box, front and handle all share one slide motion', () => {
    const ps = build('drawer', { handle: HANDLE.knob });
    const ids = new Set(ps.map((p) => p.motion?.id));
    expect(ids.size).toBe(1);
    expect(ps[0].motion).toMatchObject({ kind: 'slide' });
    const m = ps[0].motion!;
    expect(m.kind === 'slide' && m.offset.z).toBeGreaterThan(0);
  });

  it('cutout handle is a notch in the top edge of the front', () => {
    const ps = build('drawer', { handle: HANDLE.cutout });
    expect(fronts(ps)[0].cutout?.kind).toBe('notch');
    expect(handles(ps)).toHaveLength(0);
  });

  it('bar handle is horizontal', () => {
    const [h] = handles(build('drawer', { handle: HANDLE.bar }));
    expect(h.size.x).toBeGreaterThan(h.size.y);
  });
});

describe('carcass with doors', () => {
  it('two doors hinge on the outer sides with handles at the middle', () => {
    const ps = build('carcass-doors', { doors: 2, handle: HANDLE.knob });
    const doors = fronts(ps).sort((a, b) => a.pos.x - b.pos.x);
    expect(doors).toHaveLength(2);
    const [l, r] = doors.map((d) => d.motion!);
    expect(l.kind === 'hinge' && l.pivot.x).toBeLessThan(0);
    expect(r.kind === 'hinge' && r.pivot.x).toBeGreaterThan(0);
    expect(l.id).not.toBe(r.id);
    const hs = handles(ps).sort((a, b) => a.pos.x - b.pos.x);
    expect(hs[0].pos.x).toBeLessThan(0);
    expect(hs[0].pos.x).toBeGreaterThan(doors[0].pos.x);
    expect(hs[1].pos.x).toBeLessThan(doors[1].pos.x);
  });

  it('one door spans the width', () => {
    const doors = fronts(build('carcass-doors', { doors: 1, width: 600 }));
    expect(doors).toHaveLength(1);
    expect(doors[0].size.x).toBeCloseTo(596);
  });

  it('carcass sits behind the doors', () => {
    const ps = build('carcass-doors');
    const doorBack = Math.min(...fronts(ps).map((d) => d.pos.z - d.size.z / 2));
    for (const p of ps.filter((p) => p.role === 'carcass' || p.role === 'back')) {
      expect(p.pos.z + p.size.z / 2).toBeLessThanOrEqual(doorBack + 0.01);
    }
  });
});
