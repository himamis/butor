import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { TransformControls } from '@react-three/drei';
import type { SceneObject } from '../types';
import { mm, toMm } from '../units';
import { boundsOf, columnBoxes, objectBox, type Box } from '../lib/geometry';
import { snapMove } from '../lib/snapping';
import { normDeg, rotateAround, useStore } from '../state/store';

/** Last time the gizmo was pressed or released; the viewport ignores "click on empty space" right after. */
export const gizmoActivity = { at: 0 };

interface DragState {
  start: Map<string, SceneObject>;
  p0: THREE.Vector3;
  box: Box;
  others: Box[];
}

/** Move / rotate gizmo acting on the whole selection around its bottom-center. */
export function SelectionGizmo() {
  const selection = useStore((s) => s.selection);
  const objects = useStore((s) => s.design.objects);
  const mode = useStore((s) => s.mode);
  const exploded = useStore((s) => s.exploded);
  const pivot = useRef<THREE.Group>(null!);
  const drag = useRef<DragState | null>(null);

  const sel = objects.filter((o) => selection.includes(o.id));
  const locked = sel.some((o) => o.locked);

  const syncPivot = () => {
    const s = useStore.getState();
    const b = boundsOf(s.design.objects.filter((o) => s.selection.includes(o.id)));
    if (!b || !pivot.current) return;
    pivot.current.position.set(mm((b.min.x + b.max.x) / 2), mm(b.min.y), mm((b.min.z + b.max.z) / 2));
    pivot.current.rotation.set(0, 0, 0);
  };

  useLayoutEffect(() => {
    if (!drag.current) syncPivot();
  });

  const onMouseDown = () => {
    gizmoActivity.at = performance.now();
    const s = useStore.getState();
    const chosen = s.design.objects.filter((o) => s.selection.includes(o.id));
    const box = boundsOf(chosen);
    if (!box) return;
    s.beginDrag();
    drag.current = {
      start: new Map(chosen.map((o) => [o.id, o])),
      p0: pivot.current.position.clone(),
      box,
      others: [...s.design.objects.filter((o) => !s.selection.includes(o.id)).map(objectBox), ...columnBoxes(s.design.room)],
    };
  };

  const onObjectChange = () => {
    const d = drag.current;
    if (!d) return;
    const s = useStore.getState();
    const ids = [...d.start.keys()];
    if (s.mode === 'translate') {
      const p = pivot.current.position;
      const raw = { x: toMm(p.x - d.p0.x), y: toMm(p.y - d.p0.y), z: toMm(p.z - d.p0.z) };
      const delta = snapMove(d.box, raw, d.others, s.design.room, s.grid);
      s.updateObjectsLive(ids, (o) => {
        const st = d.start.get(o.id)!;
        return { ...o, position: { x: st.position.x + delta.x, y: st.position.y + delta.y, z: st.position.z + delta.z } };
      });
    } else {
      // Read yaw in YXZ order: the default XYZ order limits rotation.y to ±90°.
      const yaw = new THREE.Euler().setFromQuaternion(pivot.current.quaternion, 'YXZ').y;
      const deg = Math.round((yaw * 180) / Math.PI);
      const cx = toMm(d.p0.x);
      const cz = toMm(d.p0.z);
      s.updateObjectsLive(ids, (o) => {
        const st = d.start.get(o.id)!;
        return { ...o, position: rotateAround(st.position, cx, cz, deg), rotationY: normDeg(st.rotationY + deg) };
      });
    }
  };

  const onMouseUp = () => {
    gizmoActivity.at = performance.now();
    if (!drag.current) return;
    drag.current = null;
    useStore.getState().endDrag();
    syncPivot();
  };

  return (
    <>
      <group ref={pivot} />
      {sel.length > 0 && !locked && !exploded && (
        <TransformControls
          object={pivot}
          mode={mode}
          showX={mode === 'translate'}
          showZ={mode === 'translate'}
          showY
          rotationSnap={Math.PI / 2}
          size={0.8}
          onMouseDown={onMouseDown}
          onMouseUp={onMouseUp}
          onObjectChange={onObjectChange}
        />
      )}
    </>
  );
}
