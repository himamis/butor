import { useRef, useState } from 'react';
import * as THREE from 'three';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import type { SceneObject } from '../types';
import { mm, toMm } from '../units';
import { columnBoxes, objectBox, objectSize, toWorld } from '../lib/geometry';
import { handleWorldDir, resizeObject, type Handle } from '../lib/resize';
import { useStore } from '../state/store';
import { gizmoActivity } from './SelectionGizmo';

const HANDLES: Handle[] = [
  { axis: 'x', sign: 1 }, { axis: 'x', sign: -1 },
  { axis: 'z', sign: 1 }, { axis: 'z', sign: -1 },
  { axis: 'y', sign: 1 },
];
const OUT = 45; // mm the handle floats outside its face
const SIZE = 0.05; // m

interface Drag {
  handle: Handle;
  start: SceneObject;
  p0: THREE.Vector3;
  dir: THREE.Vector3;
  plane: THREE.Plane;
}

/** Local position of a handle: the center of its face, pushed slightly outward. */
function handleLocal(o: SceneObject, h: Handle) {
  const s = objectSize(o);
  if (h.axis === 'y') return { x: 0, y: s.y + OUT, z: 0 };
  return h.axis === 'x' ? { x: h.sign * (s.x / 2 + OUT), y: s.y / 2, z: 0 } : { x: 0, y: s.y / 2, z: h.sign * (s.z / 2 + OUT) };
}

/** Drag handles on the faces of the single selected object; each drag moves one face (one undo step). */
export function ResizeHandles() {
  const selection = useStore((s) => s.selection);
  const objects = useStore((s) => s.design.objects);
  const exploded = useStore((s) => s.exploded);
  const controls = useThree((s) => s.controls) as unknown as { enabled: boolean } | null;
  const drag = useRef<Drag | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const o = selection.length === 1 ? objects.find((x) => x.id === selection[0]) : undefined;
  if (!o || o.locked || exploded) return null;

  const down = (h: Handle) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    (e.target as unknown as Element).setPointerCapture(e.pointerId);
    gizmoActivity.at = performance.now();
    const p = toWorld(o, handleLocal(o, h));
    const p0 = new THREE.Vector3(mm(p.x), mm(p.y), mm(p.z));
    const d = handleWorldDir(o, h);
    const dir = new THREE.Vector3(d.x, d.y, d.z);
    // Drag on a plane that contains the handle's axis and faces the camera as much as possible.
    const view = e.camera.getWorldDirection(new THREE.Vector3());
    const normal = view.clone().sub(dir.clone().multiplyScalar(view.dot(dir)));
    if (normal.lengthSq() < 1e-6) normal.copy(e.camera.up); // looking straight along the axis
    drag.current = { handle: h, start: o, p0, dir, plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal.normalize(), p0) };
    useStore.getState().beginDrag();
    if (controls) controls.enabled = false;
  };

  const move = (e: ThreeEvent<PointerEvent>) => {
    const d = drag.current;
    if (!d) return;
    const hit = e.ray.intersectPlane(d.plane, new THREE.Vector3());
    if (!hit) return;
    const grow = toMm(hit.sub(d.p0).dot(d.dir));
    const s = useStore.getState();
    const others = [...s.design.objects.filter((x) => x.id !== d.start.id).map(objectBox), ...columnBoxes(s.design.room)];
    const next = resizeObject(d.start, d.handle, grow, { grid: s.grid, others, room: s.design.room });
    s.updateObjectsLive([d.start.id], () => next);
  };

  const up = (e: ThreeEvent<PointerEvent>) => {
    if (!drag.current) return;
    (e.target as unknown as Element).releasePointerCapture(e.pointerId);
    drag.current = null;
    gizmoActivity.at = performance.now();
    useStore.getState().endDrag();
    if (controls) controls.enabled = true;
  };

  return (
    <group>
      {HANDLES.map((h) => {
        const key = `${h.axis}${h.sign}`;
        const p = toWorld(o, handleLocal(o, h));
        const active = hover === key || drag.current?.handle === h;
        return (
          <mesh
            key={key}
            position={[mm(p.x), mm(p.y), mm(p.z)]}
            rotation-y={(o.rotationY * Math.PI) / 180}
            renderOrder={20}
            onPointerDown={down(h)}
            onPointerMove={move}
            onPointerUp={up}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHover(key);
              document.body.style.cursor = h.axis === 'y' ? 'ns-resize' : 'ew-resize';
            }}
            onPointerOut={() => {
              setHover(null);
              document.body.style.cursor = '';
            }}
          >
            <boxGeometry args={[SIZE, SIZE, SIZE]} />
            <meshBasicMaterial color={active ? '#ff8a00' : '#2f7cf6'} depthTest={false} transparent opacity={0.9} />
          </mesh>
        );
      })}
    </group>
  );
}
