import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import type { Room } from '../types';
import { mm, toMm } from '../units';
import { useStore, type View } from '../state/store';
import { TEMPLATES, hasTemplate } from '../templates';
import { boundsOf, findOverlaps, objectBox } from '../lib/geometry';
import { objectExplodeOffset } from '../lib/explode';
import { RoomMesh } from './RoomMesh';
import { ObjectMesh } from './ObjectMesh';
import { SelectionGizmo, gizmoActivity } from './SelectionGizmo';
import { ResizeHandles } from './ResizeHandles';
import { BoxDimensions } from './Dimensions';

type ThreeHandle = { camera: THREE.Camera; gl: THREE.WebGLRenderer };

function Bridge({ handle }: { handle: React.MutableRefObject<ThreeHandle | null> }) {
  const { camera, gl } = useThree();
  handle.current = { camera, gl };
  if (import.meta.env.DEV) Object.assign(window, { __three: handle.current, __store: useStore, __templates: TEMPLATES });
  return null;
}

function roomFrame(room: Room) {
  const xs = room.points.map((p) => p.x);
  const zs = room.points.map((p) => p.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  return { cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, w: maxX - minX, d: maxZ - minZ };
}

function Cameras({ view, room }: { view: View; room: Room }) {
  const size = useThree((s) => s.size);
  const f = roomFrame(room);
  const span = mm(Math.max(f.w, f.d, 1000));
  const cx = mm(f.cx), cz = mm(f.cz), h = mm(room.height);

  if (view === '3d') {
    return (
      <>
        <PerspectiveCamera makeDefault position={[cx + span * 0.5, h * 1.1, cz + span * 1.3]} fov={45} near={0.05} far={200} />
        <OrbitControls makeDefault target={[cx, h * 0.4, cz]} maxPolarAngle={Math.PI / 2 - 0.01} />
      </>
    );
  }
  const far = 50;
  const pos: [number, number, number] =
    view === 'front' ? [cx, h / 2, cz + far] : view === 'top' ? [cx, far, cz] : [cx + far, h / 2, cz];
  const target: [number, number, number] = view === 'top' ? [cx, 0, cz] : [cx, h / 2, cz];
  const extent = view === 'top' ? span : Math.max(span, h);
  const zoom = (Math.min(size.width, size.height) * 0.85) / extent;
  return (
    <>
      <OrthographicCamera makeDefault position={pos} up={view === 'top' ? [0, 0, -1] : [0, 1, 0]} zoom={zoom} near={0.1} far={200} />
      <OrbitControls makeDefault enableRotate={false} target={target} />
    </>
  );
}

export function Viewport() {
  const objects = useStore((s) => s.design.objects);
  const room = useStore((s) => s.design.room);
  const selection = useStore((s) => s.selection);
  const view = useStore((s) => s.view);
  const showOverall = useStore((s) => s.showOverall);
  const doorsHidden = useStore((s) => s.doorsHidden);
  const openIds = useStore((s) => s.openIds);
  const explode = useStore((s) => (s.exploded ? s.explodeAmount : 0));
  const handle = useRef<ThreeHandle | null>(null);

  const overlaps = useMemo(() => findOverlaps(objects, room), [objects, room]);
  const selBox = useMemo(() => boundsOf(objects.filter((o) => selection.includes(o.id))), [objects, selection]);
  const allBox = useMemo(() => boundsOf(objects), [objects]);
  const spreads = useMemo(() => {
    const zero = { x: 0, y: 0, z: 0 };
    if (!allBox || explode === 0) return new Map(objects.map((o) => [o.id, zero]));
    const mid = (b: typeof allBox) => ({ x: (b.min.x + b.max.x) / 2, y: 0, z: (b.min.z + b.max.z) / 2 });
    return new Map(objects.map((o) => [o.id, objectExplodeOffset(mid(objectBox(o)), mid(allBox), explode)]));
  }, [objects, allBox, explode]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('template');
    const t = handle.current;
    if (useStore.getState().readOnly) return;
    if (!hasTemplate(id) || !t) return;
    const f = roomFrame(room);
    const rect = t.gl.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, t.camera);
    const plane =
      view === 'front' ? new THREE.Plane(new THREE.Vector3(0, 0, 1), -mm(f.cz))
      : view === 'side' ? new THREE.Plane(new THREE.Vector3(1, 0, 0), -mm(f.cx))
      : new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    const pos = ray.ray.intersectPlane(plane, hit)
      ? { x: toMm(hit.x), y: view === 'front' || view === 'side' ? Math.max(0, toMm(hit.y)) : 0, z: toMm(hit.z) }
      : { x: f.cx, y: 0, z: f.cz };
    const g = useStore.getState().grid;
    const snap = (v: number) => Math.round(v / g) * g;
    useStore.getState().addObject(id, { x: snap(pos.x), y: snap(pos.y), z: snap(pos.z) });
  };

  const onPointerMissed = () => {
    if (performance.now() - gizmoActivity.at < 300) return;
    useStore.getState().select(null, false);
  };

  return (
    <div className="viewport" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <Canvas shadows dpr={[1, 2]} onPointerMissed={onPointerMissed}>
        <Bridge handle={handle} />
        <color attach="background" args={['#f6f5f2']} />
        <hemisphereLight args={['#ffffff', '#c9c2b5', 0.9]} />
        <directionalLight
          position={[mm(roomFrame(room).cx) + 3, 6, mm(roomFrame(room).cz) + 4]}
          intensity={1.4}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-8}
          shadow-camera-right={8}
          shadow-camera-top={8}
          shadow-camera-bottom={-8}
          shadow-bias={-0.0005}
        />
        <Cameras key={view} view={view} room={room} />
        <RoomMesh room={room} showWalls={view !== 'top'} faded={explode > 0} />
        {objects.map((o) => (
          <ObjectMesh
            key={o.id}
            obj={o}
            selected={selection.includes(o.id)}
            overlapping={overlaps.has(o.id)}
            doorsHidden={doorsHidden}
            open={openIds.includes(o.id)}
            explode={explode}
            spread={spreads.get(o.id)!}
          />
        ))}
        <SelectionGizmo />
        <ResizeHandles />
        {/* Dimensions describe the assembled design, so they are hidden while exploded. */}
        {selBox && explode === 0 && <BoxDimensions box={selBox} offset={60} color="#2f7cf6" />}
        {showOverall && explode === 0 && objects.length > 1 && allBox && <BoxDimensions box={allBox} offset={160} color="#e07a1f" />}
      </Canvas>
    </div>
  );
}
