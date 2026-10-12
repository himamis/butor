import { useEffect, useMemo, useRef, useState } from 'react';
import { newId } from '../core';
import { instantiatePreset, PRESETS } from '../catalog';
import { InputController } from '../interaction/controller';
import { faceHandles } from '../interaction/handles';
import { SelectTool } from '../interaction/tools/select';
import { PlaceTool, type EntityFactory } from '../interaction/tools/place';
import { roomHandles, RoomTool } from '../interaction/tools/room';
import { MeasureTool } from '../interaction/tools/measure';
import { ViewTool } from '../interaction/tools/view';
import { MeasureLabels } from './MeasureLabels';
import { Renderer } from '../render/Renderer';
import { editorPort } from './editorPort';
import { registerFramer } from './frame';
import { registerThumbnail } from './thumbnail';
import { useApp, visibleDesign } from './store';
import { registerRenderer } from './testHooks';
import { useUi } from './ui';

const factory: EntityFactory = (entry, position) => {
  if (entry.kind === 'preset') {
    const p = PRESETS.find((x) => x.id === entry.id);
    return p ? instantiatePreset(p, newId, position) : null;
  }
  if (entry.kind === 'unit') return { kind: 'unit', template: { id: entry.id }, position };
  if (entry.kind === 'part') return { kind: 'part', template: { id: entry.id }, position };
  return null;
};

/** Mounts the renderer and the input controller, and keeps them in sync with the app state. */
export function Viewport({ readOnly = false }: { readOnly?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const renderer = useRef<Renderer | null>(null);
  const controller = useRef<InputController | null>(null);
  const placing = useRef<PlaceTool | null>(null);
  const design = useApp(visibleDesign);
  const scene = useApp((s) => s.scene);
  const view = useApp((s) => s.view);
  const selection = useApp((s) => s.selection);
  const hover = useApp((s) => s.hover);
  const checks = useApp((s) => s.checks);
  const previewing = useApp((s) => !!s.previewDoc);
  const marquee = useUi((s) => s.marquee);
  const status = useUi((s) => s.status);
  const tool = useUi((s) => s.tool);
  const measurePreview = useUi((s) => s.measurePreview);
  const [mounted, setMounted] = useState<Renderer | null>(null);
  const problems = useMemo(
    () => new Set(checks.filter((c) => c.severity === 'error').flatMap((c) => c.entities)),
    [checks],
  );
  const selected = useMemo(() => new Set(selection.entities), [selection]);
  const tints = useMemo(
    () => ({ selected, problems, hover, hideFronts: view.hideFronts }),
    [selected, problems, hover, view.hideFronts],
  );

  useEffect(() => {
    const r = new Renderer(host.current!);
    renderer.current = r;
    registerRenderer(r);
    setMounted(r);
    registerFramer((min, max) => r.frameBounds(min, max));
    registerThumbnail(() => r.thumbnail());
    controller.current = new InputController(host.current!, r, new ViewTool(editorPort)); // the tool effect sets the real one
    return () => {
      controller.current?.dispose();
      registerRenderer(null);
      registerFramer(null);
      registerThumbnail(null);
      r.dispose();
      renderer.current = null;
      setMounted(null);
    };
  }, []);

  useEffect(() => {
    const r = renderer.current;
    if (!r || !controller.current) return;
    controller.current.setTool(
      tool === 'measure'
        ? new MeasureTool(editorPort, r)
        : readOnly
          ? new ViewTool(editorPort)
          : tool === 'room'
            ? new RoomTool(editorPort, r)
            : new SelectTool(editorPort, r),
    );
  }, [tool, readOnly]);

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

  useEffect(() => {
    const all = measurePreview ? [...view.measurements, measurePreview] : view.measurements;
    renderer.current?.setMeasures(all.map((m) => ({ from: m.a, to: m.b })));
  }, [view.measurements, measurePreview]);

  // Resize handles on a single selected unit; a rotate ring under any selection (hidden while dragging).
  useEffect(() => {
    const r = renderer.current;
    if (!r) return;
    if (tool === 'measure' || readOnly) {
      r.setHandles([], null);
      return;
    }
    if (tool === 'room') {
      r.setHandles(roomHandles(design.room), null); // follows the preview while dragging
      return;
    }
    const d = useApp.getState().design;
    const ids = selection.entities;
    const locked = ids.some((id) => d.entities[id]?.locked);
    if (!ids.length || locked || view.exploded || controller.current?.dragging || previewing) {
      r.setHandles([], null);
      return;
    }
    const boxes = ids.map((id) => scene.entities.get(id)?.bounds).filter((b) => !!b);
    const single = ids.length === 1 && d.entities[ids[0]!]?.kind === 'unit' && !selection.inner ? boxes[0] : undefined;
    const minX = Math.min(...boxes.map((b) => b.center.x - Math.max(b.half.x, b.half.z)));
    const maxX = Math.max(...boxes.map((b) => b.center.x + Math.max(b.half.x, b.half.z)));
    const minZ = Math.min(...boxes.map((b) => b.center.z - Math.max(b.half.x, b.half.z)));
    const maxZ = Math.max(...boxes.map((b) => b.center.z + Math.max(b.half.x, b.half.z)));
    const center = { x: (minX + maxX) / 2, y: 0, z: (minZ + maxZ) / 2 };
    r.setHandles(single ? faceHandles(single) : [], { center, radius: Math.max(maxX - minX, maxZ - minZ) / 2 + 150 });
  }, [selection, scene, view.exploded, previewing, tool, design.room, readOnly]);

  const entryFromDrag = () => useUi.getState().dragEntry;

  return (
    <div
      ref={host}
      className="canvas-host"
      data-testid="canvas-host"
      onDragOver={(e) => {
        const entry = entryFromDrag();
        if (!entry || !renderer.current || tool !== 'select' || readOnly) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        if (!placing.current) placing.current = new PlaceTool(editorPort, renderer.current, entry, factory);
        placing.current.move(e.clientX, e.clientY, e.altKey);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        placing.current?.cancel();
        placing.current = null;
      }}
      onDrop={(e) => {
        e.preventDefault();
        placing.current?.move(e.clientX, e.clientY, e.altKey);
        placing.current?.drop();
        placing.current = null;
        useUi.getState().set({ dragEntry: null });
      }}
    >
      {marquee && (
        <div
          className="marquee"
          style={{
            left: marquee.x0 - (host.current?.getBoundingClientRect().left ?? 0),
            top: marquee.y0 - (host.current?.getBoundingClientRect().top ?? 0),
            width: marquee.x1 - marquee.x0,
            height: marquee.y1 - marquee.y0,
          }}
        />
      )}
      <MeasureLabels renderer={mounted} host={host.current} />
      {status && (
        <div className="status-pill" role="status">
          {status}
        </div>
      )}
    </div>
  );
}
