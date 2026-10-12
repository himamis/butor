import { useEffect, useState } from 'react';
import { useStore } from './state/store';
import { writeAutosave } from './lib/persistence';
import { Toolbar } from './components/Toolbar';
import { Library } from './components/Library';
import { Viewport } from './components/Viewport';
import { Properties } from './components/Properties';
import { StatusBar } from './components/StatusBar';
import { CutListDialog } from './components/CutListDialog';
import { ShareDialog } from './components/ShareDialog';
import { ChatPanel } from './components/ChatPanel';
import { BrokenShareLink, ViewerApp } from './components/ViewerApp';
import { decodeShare, shareHashOf } from './lib/share';
import { ErrorBoundary } from './components/ErrorBoundary';

/** Resolved once at startup: a #view= link opens the read-only viewer. */
const shared = shareHashOf(location.hash) !== null ? decodeShare(location.hash) : undefined;
if (shared) useStore.getState().enterViewer(shared);

function useAutosave() {
  useEffect(() => {
    let timer: number | undefined;
    const unsub = useStore.subscribe((s, prev) => {
      if (s.design === prev.design || s.readOnly) return;
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
      else if (mod && k === 'c') {
        if (window.getSelection()?.toString()) return; // let the browser copy selected text
        s.copySelected();
      }
      else if (mod && k === 'v') { e.preventDefault(); s.paste(); }
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
  if (shared === null) return <BrokenShareLink />;
  return <ErrorBoundary area="app">{shared ? <ViewerApp /> : <Editor />}</ErrorBoundary>;
}

function Editor() {
  const [cutList, setCutList] = useState(false);
  const [share, setShare] = useState(false);
  const [chat, setChat] = useState(false);
  useAutosave();
  useShortcuts();

  return (
    <div className="app">
      <Toolbar onCutList={() => setCutList(true)} onShare={() => setShare(true)} onChat={() => setChat(!chat)} chatOpen={chat} />
      <Library />
      <div className="viewport-slot"><ErrorBoundary area="3D view"><Viewport /></ErrorBoundary></div>
      {/* The chat stays mounted while hidden so the conversation survives toggling. */}
      <ChatPanel hidden={!chat} />
      {!chat && <div className="props-slot"><ErrorBoundary area="properties panel"><Properties /></ErrorBoundary></div>}
      <div className="status-slot"><ErrorBoundary area="status bar"><StatusBar /></ErrorBoundary></div>
      {cutList && <ErrorBoundary area="cut list"><CutListDialog onClose={() => setCutList(false)} /></ErrorBoundary>}
      {share && <ShareDialog onClose={() => setShare(false)} />}
    </div>
  );
}
