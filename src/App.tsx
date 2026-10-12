import { useEffect, useState } from 'react';
import { useStore } from './state/store';
import { writeAutosave } from './lib/persistence';
import { Toolbar } from './components/Toolbar';
import { Library } from './components/Library';
import { Viewport } from './components/Viewport';
import { Properties } from './components/Properties';
import { StatusBar } from './components/StatusBar';
import { CutListDialog } from './components/CutListDialog';

function useAutosave() {
  useEffect(() => {
    let timer: number | undefined;
    const unsub = useStore.subscribe((s, prev) => {
      if (s.design === prev.design) return;
      clearTimeout(timer);
      timer = window.setTimeout(() => writeAutosave(useStore.getState().design), 500);
    });
    return () => {
      clearTimeout(timer);
      unsub();
    };
  }, []);
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, select, textarea')) return;
      const s = useStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) s.redo(); else s.undo(); }
      else if (mod && k === 'y') { e.preventDefault(); s.redo(); }
      else if (mod && k === 'd') { e.preventDefault(); s.duplicateSelected(); }
      else if (mod && k === 'g') { e.preventDefault(); if (e.shiftKey) s.ungroupSelected(); else s.groupSelected(); }
      else if (mod) return;
      else if (k === 'delete' || k === 'backspace') { e.preventDefault(); s.deleteSelected(); }
      else if (k === 'escape') s.select(null, false);
      else if (k === 'r') s.rotateSelected(e.shiftKey ? -90 : 90);
      else if (k === 'g') s.setUi({ mode: 'translate' });
      else if (k === 't') s.setUi({ mode: 'rotate' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export default function App() {
  const [cutList, setCutList] = useState(false);
  useAutosave();
  useShortcuts();

  return (
    <div className="app">
      <Toolbar onCutList={() => setCutList(true)} />
      <Library />
      <Viewport />
      <Properties />
      <StatusBar />
      {cutList && <CutListDialog onClose={() => setCutList(false)} />}
    </div>
  );
}
