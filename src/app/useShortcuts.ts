import { useEffect } from 'react';
import { matchShortcut } from '../interaction/shortcuts';
import { useApp } from './store';
import { frameEntities } from './frame';
import { setTool, useUi } from './ui';

/** Keyboard shortcuts for the editor (one table: src/interaction/shortcuts.ts). */
export function useShortcuts(scope: 'editor' | 'viewer') {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = matchShortcut(e, scope);
      if (!action) return;
      const s = useApp.getState();
      const sel = s.selection.entities;
      const run: Record<string, () => void> = {
        undo: s.undo,
        redo: s.redo,
        copy: s.copy,
        paste: s.paste,
        duplicate: s.duplicate,
        group: s.groupSelection,
        ungroup: s.ungroupSelection,
        'select-all': () => s.select(s.design.order),
        delete: s.removeSelection,
        'rotate-cw': () => sel.length && s.apply([{ type: 'entity.rotate', ids: sel, degrees: -90 }], 'Rotate'),
        'rotate-ccw': () => sel.length && s.apply([{ type: 'entity.rotate', ids: sel, degrees: 90 }], 'Rotate'),
        open: () => (sel.length ? sel.forEach((id) => s.toggleOpen(id)) : s.setOpenAll(s.view.open.size === 0)),
        explode: () => s.setView({ exploded: !s.view.exploded }),
        'view-3d': () => s.setView({ mode: '3d' }),
        'view-front': () => s.setView({ mode: 'front' }),
        'view-top': () => s.setView({ mode: 'top' }),
        'view-side': () => s.setView({ mode: 'side' }),
        'view-elevation': () =>
          s.setView({
            mode: 'elevation',
            elevationWall: s.view.elevationWall ?? Object.keys(s.design.room.walls)[0] ?? null,
          }),
        frame: () => frameEntities(sel),
        search: () => window.dispatchEvent(new Event('butor:search')),
        measure: () => setTool(useUi.getState().tool === 'measure' ? 'select' : 'measure'),
        'room-edit': () => setTool(useUi.getState().tool === 'room' ? 'select' : 'room'),
        escape: () =>
          useUi.getState().help
            ? useUi.getState().set({ help: false })
            : useUi.getState().tool !== 'select'
              ? setTool('select')
              : s.selection.inner
                ? s.selectInner(null)
                : s.select([]),
        help: () => useUi.getState().set({ help: !useUi.getState().help }),
      };
      const fn = run[action];
      if (!fn) return;
      e.preventDefault();
      fn();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [scope]);
}
