import type { Design } from '../core';
import type { Repository } from '../persistence/repository';
import { useApp } from './store';
import { takeThumbnail } from './thumbnail';
import { useUi } from './ui';

const DEBOUNCE = 500; // ms after the last committed change
const RETRY = 3000; // ms after a failed write
const THUMB_EVERY = 10_000; // ms between thumbnails while editing

/**
 * Saves the committed design after each change (debounced) and when the page is hidden or closed
 * (docs/v2/09-persistence.md). A failed write shows a non-blocking warning and is retried.
 */
export function startAutosave(repo: Repository): () => void {
  let saved: Design = useApp.getState().design;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastThumb = 0;
  let stopped = false;

  const save = async (withThumb: boolean) => {
    timer = null;
    const d = useApp.getState().design;
    if (d === saved) return;
    const now = Date.now();
    const thumb = withThumb || now - lastThumb > THUMB_EVERY ? takeThumbnail() : undefined;
    if (thumb) lastThumb = now;
    try {
      await repo.save(d, thumb);
      saved = d;
      if (useUi.getState().saveError) useUi.getState().set({ saveError: null });
    } catch (e) {
      useUi.getState().set({ saveError: e instanceof Error ? e.message : String(e) });
      if (!stopped) schedule(RETRY);
    }
  };
  const schedule = (ms: number) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void save(false), ms);
  };
  const flush = () => {
    if (timer) clearTimeout(timer);
    void save(true);
  };
  const onHide = () => {
    if (document.visibilityState === 'hidden') flush();
  };

  const unsub = useApp.subscribe((s, prev) => {
    if (s.design !== prev.design) schedule(DEBOUNCE);
  });
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', flush);
  return () => {
    stopped = true;
    unsub();
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', flush);
    flush();
  };
}
