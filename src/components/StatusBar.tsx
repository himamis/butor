import { useMemo } from 'react';
import { useStore } from '../state/store';
import { boundsOf, findOverlaps } from '../lib/geometry';

export function StatusBar() {
  const objects = useStore((s) => s.design.objects);
  const showOverall = useStore((s) => s.showOverall);
  const setUi = useStore((s) => s.setUi);
  const b = useMemo(() => boundsOf(objects), [objects]);
  const overlaps = useMemo(() => findOverlaps(objects).size, [objects]);
  const r = Math.round;

  return (
    <footer className="status">
      <span>
        Overall: {b ? `${r(b.max.x - b.min.x)} × ${r(b.max.y - b.min.y)} × ${r(b.max.z - b.min.z)} mm (W × H × D)` : '—'}
      </span>
      <span>{objects.length} object{objects.length === 1 ? '' : 's'}</span>
      {overlaps > 0 && <span className="warn">⚠ {overlaps} overlapping</span>}
      <label>
        <input type="checkbox" checked={showOverall} onChange={(e) => setUi({ showOverall: e.target.checked })} />
        Show overall dimensions
      </label>
    </footer>
  );
}
