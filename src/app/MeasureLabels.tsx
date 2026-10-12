import { useEffect, useState } from 'react';
import type { Renderer } from '../render/Renderer';
import { useApp } from './store';
import { useUi } from './ui';

/** Distance labels at the middle of each measurement; they follow the camera. */
export function MeasureLabels({ renderer, host }: { renderer: Renderer | null; host: HTMLElement | null }) {
  const measurements = useApp((s) => s.view.measurements);
  const preview = useUi((s) => s.measurePreview);
  const [, tick] = useState(0);
  const all = preview ? [...measurements, preview] : measurements;

  useEffect(() => {
    if (!renderer || !all.length) return;
    return renderer.onRender(() => tick((n) => n + 1));
  }, [renderer, all.length]);

  if (!renderer || !host) return null;
  return (
    <>
      {all.map((m, i) => {
        const p = renderer.toScreen({ x: (m.a.x + m.b.x) / 2, y: (m.a.y + m.b.y) / 2, z: (m.a.z + m.b.z) / 2 });
        return (
          <div
            key={i}
            className={`measure-label${m === preview ? ' preview' : ''}`}
            style={{ left: p.x, top: p.y }}
            data-testid="measure-label"
          >
            {Math.round(m.distance * 10) / 10} mm
          </div>
        );
      })}
    </>
  );
}
