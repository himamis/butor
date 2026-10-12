import { describe, expect, it } from 'vitest';
import { Animation } from './animation';

describe('Animation', () => {
  it('moves open fractions and explode towards their targets and settles exactly', () => {
    const a = new Animation();
    a.setOpen('door-1', true);
    a.setExplode(0.6);
    expect(a.active()).toBe(true);
    let steps = 0;
    while (a.step(1 / 60) && steps < 1000) steps++;
    expect(steps).toBeGreaterThan(5);
    expect(a.open('door-1')).toBe(1);
    expect(a.explode()).toBe(0.6);
    expect(a.active()).toBe(false);
  });

  it('a long pause between frames does not make it jump (dt is capped)', () => {
    const a = new Animation();
    a.setOpen('d', true);
    a.step(5); // e.g. the first frame after idle
    expect(a.open('d')).toBeLessThan(0.5);
  });

  it('closing returns to exactly 0 and unknown motions are closed', () => {
    const a = new Animation();
    a.setOpen('d', true);
    while (a.step(1 / 60));
    a.setOpen('d', false);
    while (a.step(1 / 60));
    expect(a.open('d')).toBe(0);
    expect(a.open('nope')).toBe(0);
  });

  it('jump() sets values immediately (for tests and print views)', () => {
    const a = new Animation();
    a.setOpen('d', true);
    a.setExplode(1);
    a.jump();
    expect(a.open('d')).toBe(1);
    expect(a.explode()).toBe(1);
    expect(a.active()).toBe(false);
  });
});
