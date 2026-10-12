import { describe, expect, it } from 'vitest';
import { matchShortcut, SHORTCUTS } from './shortcuts';

const key = (
  k: string,
  o: Partial<{ ctrl: boolean; meta: boolean; shift: boolean; alt: boolean; target: string }> = {},
) => ({
  key: k,
  ctrlKey: !!o.ctrl,
  metaKey: !!o.meta,
  shiftKey: !!o.shift,
  altKey: !!o.alt,
  target: { tagName: o.target ?? 'BODY', isContentEditable: false },
});

describe('shortcuts', () => {
  it('maps keys to actions, with Ctrl or Cmd as the modifier', () => {
    expect(matchShortcut(key('z', { ctrl: true }), 'editor')).toBe('undo');
    expect(matchShortcut(key('z', { meta: true }), 'editor')).toBe('undo');
    expect(matchShortcut(key('Z', { meta: true, shift: true }), 'editor')).toBe('redo');
    expect(matchShortcut(key('Delete'), 'editor')).toBe('delete');
    expect(matchShortcut(key('r'), 'editor')).toBe('rotate-cw');
    expect(matchShortcut(key('R', { shift: true }), 'editor')).toBe('rotate-ccw');
  });

  it('respects scopes: the viewer has no editing shortcuts', () => {
    expect(matchShortcut(key('Delete'), 'viewer')).toBeNull();
    expect(matchShortcut(key('2'), 'viewer')).toBe('view-front');
    expect(matchShortcut(key('m'), 'viewer')).toBe('measure');
  });

  it('ignores keys typed into text fields', () => {
    expect(matchShortcut(key('Delete', { target: 'INPUT' }), 'editor')).toBeNull();
    expect(matchShortcut(key('z', { ctrl: true, target: 'TEXTAREA' }), 'editor')).toBeNull();
  });

  it('every shortcut has a label and a unique combination per scope', () => {
    const seen = new Set<string>();
    for (const s of SHORTCUTS) {
      expect(s.label.length).toBeGreaterThan(3);
      const id = `${s.key.toLowerCase()}|${!!s.mod}|${!!s.shift}|${s.scope}`;
      expect(seen.has(id), id).toBe(false);
      seen.add(id);
    }
  });
});
