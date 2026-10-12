import { useEffect, useMemo, useRef } from 'react';
import { Renderer } from '../render/Renderer';
import { useApp } from './store';
import { registerRenderer } from './testHooks';

/** Mounts the imperative renderer and keeps it in sync with the app state. */
export function Viewport() {
  const host = useRef<HTMLDivElement>(null);
  const renderer = useRef<Renderer | null>(null);
  const design = useApp((s) => s.design);
  const scene = useApp((s) => s.scene);
  const view = useApp((s) => s.view);
  const selection = useApp((s) => s.selection);
  const hover = useApp((s) => s.hover);
  const checks = useApp((s) => s.checks);
  const problems = useMemo(
    () => new Set(checks.filter((c) => c.severity === 'error').flatMap((c) => c.entities)),
    [checks],
  );
  const tints = useMemo(
    () => ({ selected: selection, problems, hover, hideFronts: view.hideFronts }),
    [selection, problems, hover, view.hideFronts],
  );

  useEffect(() => {
    const r = new Renderer(host.current!);
    renderer.current = r;
    registerRenderer(r);
    return () => {
      registerRenderer(null);
      r.dispose();
      renderer.current = null;
    };
  }, []);

  useEffect(() => {
    renderer.current?.setDesign(design, scene);
  }, [design, scene]);

  useEffect(() => {
    renderer.current?.setView({
      mode: view.mode,
      elevationWall: view.elevationWall,
      explode: view.exploded ? view.explodeAmount : 0,
      open: view.open,
      tints,
    });
  }, [view, tints]);

  return <div ref={host} className="canvas-host" data-testid="canvas-host" />;
}
