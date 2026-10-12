import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import type { Vec3 } from '../types';
import { mm, toMm } from '../units';
import { measureBetween } from '../lib/measure';
import { useStore } from '../state/store';

const COLOR = '#8e24aa';
const v = (p: Vec3): [number, number, number] => [mm(p.x), mm(p.y), mm(p.z)];

interface Hit {
  p: Vec3; // mm
  n: Vec3; // world face normal
}

/** First visible measurable surface under the pointer (floor, walls, columns, furniture panels). */
function pick(e: PointerEvent, camera: THREE.Camera, scene: THREE.Scene, el: HTMLElement): Hit | null {
  const r = el.getBoundingClientRect();
  const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, camera);
  const visible = (o: THREE.Object3D | null): boolean => !o || (o.visible && visible(o.parent));
  const hit = ray.intersectObjects(scene.children, true).find((h) => h.object.userData.measurable && h.face && visible(h.object));
  if (!hit || !hit.face) return null;
  const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
  // Face normals point out of the surface; if we see the back of it, flip so it faces the viewer.
  if (n.dot(ray.ray.direction) > 0) n.negate();
  return { p: { x: toMm(hit.point.x), y: toMm(hit.point.y), z: toMm(hit.point.z) }, n: { x: n.x, y: n.y, z: n.z } };
}

function Marker({ p }: { p: Vec3 }) {
  return (
    <mesh position={v(p)} renderOrder={30}>
      <sphereGeometry args={[0.015, 12, 12]} />
      <meshBasicMaterial color={COLOR} depthTest={false} />
    </mesh>
  );
}

function MeasureLine({ a, end, b, distance, preview }: { a: Vec3; end: Vec3; b: Vec3; distance: number; preview?: boolean }) {
  const mid = { x: (a.x + end.x) / 2, y: (a.y + end.y) / 2, z: (a.z + end.z) / 2 };
  const off = Math.hypot(end.x - b.x, end.y - b.y, end.z - b.z) > 1;
  return (
    <group>
      <Marker p={a} />
      {!preview && <Marker p={b} />}
      <Line points={[v(a), v(end)]} color={COLOR} lineWidth={2} depthTest={false} dashed={preview} dashSize={0.03} gapSize={0.02} />
      {off && <Line points={[v(end), v(b)]} color={COLOR} lineWidth={1} depthTest={false} dashed dashSize={0.02} gapSize={0.02} transparent opacity={0.6} />}
      <Html position={v(mid)} center zIndexRange={[6, 0]}>
        <div className="dim-label measure-label">{Math.round(distance)} mm</div>
      </Html>
    </group>
  );
}

/** Measure mode: click a surface (sets the direction), click a second point, read the distance. */
export function MeasureTool() {
  const tool = useStore((s) => s.tool);
  const measures = useStore((s) => s.measures);
  const start = useStore((s) => s.measureStart);
  const { camera, scene, gl } = useThree();
  const [hover, setHover] = useState<Hit | null>(null);

  // M toggles the tool, Esc cancels the current measurement or leaves the tool (editor and viewer).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select') || e.ctrlKey || e.metaKey) return;
      const s = useStore.getState();
      if (e.key === 'm' || e.key === 'M') s.setUi({ tool: s.tool === 'measure' ? 'select' : 'measure' });
      else if (e.key === 'Escape' && s.tool === 'measure') {
        if (s.measureStart) s.cancelMeasure();
        else s.setUi({ tool: 'select' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Listeners stay attached and check the tool on each event, so a click right after pressing M is never lost.
  useEffect(() => {
    const el = gl.domElement;
    const measuring = () => useStore.getState().tool === 'measure';
    let downAt: { x: number; y: number } | null = null;
    let frame = 0;
    const onDown = (e: PointerEvent) => (downAt = { x: e.clientX, y: e.clientY });
    const onUp = (e: PointerEvent) => {
      // A click, not an orbit drag.
      if (!measuring() || !downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 4) return;
      const hit = pick(e, camera, scene, el);
      if (hit) useStore.getState().measureClick(hit.p, hit.n);
    };
    const onMove = (e: PointerEvent) => {
      if (!measuring()) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setHover(pick(e, camera, scene, el)));
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointermove', onMove);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointermove', onMove);
    };
  }, [camera, scene, gl]);

  useEffect(() => {
    gl.domElement.style.cursor = tool === 'measure' ? 'crosshair' : '';
    if (tool !== 'measure') setHover(null);
  }, [tool, gl]);

  const preview = tool === 'measure' && start && hover ? measureBetween(start.p, start.n, hover.p) : null;

  return (
    <group>
      {measures.map((m, i) => <MeasureLine key={i} {...m} />)}
      {start && <Marker p={start.p} />}
      {start && preview && hover && <MeasureLine a={start.p} end={preview.end} b={hover.p} distance={preview.distance} preview />}
      {tool === 'measure' && !start && hover && <Marker p={hover.p} />}
    </group>
  );
}
