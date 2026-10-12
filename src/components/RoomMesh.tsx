import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Edges } from '@react-three/drei';
import * as THREE from 'three';
import type { Room } from '../types';
import { mm } from '../units';
import { floorTexture } from '../lib/textures';

function signedArea(pts: Room['points']): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.z - q.x * p.z;
  }
  return a / 2;
}

/** One wall box per polygon edge, placed outside the floor polygon. */
function wallsOf(room: Room) {
  const pts = room.points;
  const n = pts.length;
  const sign = signedArea(pts) > 0 ? 1 : -1;
  const t = room.wallThickness;
  const dirs = pts.map((a, i) => {
    const b = pts[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { x: (b.x - a.x) / len, z: (b.z - a.z) / len, len };
  });
  // A corner is convex if the turn direction matches the polygon winding.
  const convex = (i: number) => {
    const din = dirs[(i - 1 + n) % n];
    const dout = dirs[i];
    return (din.x * dout.z - din.z * dout.x) * sign > 0;
  };
  return pts.map((a, i) => {
    const d = dirs[i];
    const nx = sign * d.z;
    const nz = -sign * d.x;
    const extStart = convex(i) ? t : 0;
    const extEnd = convex((i + 1) % n) ? t : 0;
    const len = d.len + extStart + extEnd;
    const along = (d.len + extEnd - extStart) / 2;
    return {
      key: i,
      len,
      x: a.x + d.x * along + (nx * t) / 2,
      z: a.z + d.z * along + (nz * t) / 2,
      rot: Math.atan2(-d.z, d.x),
      nx,
      nz,
    };
  });
}

const FADED_OPACITY = 0.12;

/**
 * Walls whose outer side faces the camera are hidden so they never block the view.
 * `faded` (exploded view) fades walls and columns out so they never cover separated parts.
 */
export function RoomMesh({ room, showWalls, faded }: { room: Room; showWalls: boolean; faded: boolean }) {
  const wallRefs = useRef<(THREE.Mesh | null)[]>([]);
  const fade = useRef(1);
  // One shared material for walls and columns, so a single opacity animates all of them.
  const solid = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.95 }), []);
  useEffect(() => () => solid.dispose(), [solid]);
  solid.color.set(room.wallColor);
  const floorGeom = useMemo(() => {
    const shape = new THREE.Shape(room.points.map((p) => new THREE.Vector2(mm(p.x), -mm(p.z))));
    return new THREE.ShapeGeometry(shape);
  }, [room.points]);

  const map = room.floorKind === 'color' ? null : floorTexture(room.floorKind, room.floorColor);
  const walls = useMemo(() => wallsOf(room), [room]);

  useFrame(({ camera }, dt) => {
    fade.current = THREE.MathUtils.damp(fade.current, faded ? FADED_OPACITY : 1, 6, dt);
    if (Math.abs(fade.current - (faded ? FADED_OPACITY : 1)) < 1e-3) fade.current = faded ? FADED_OPACITY : 1;
    const translucent = fade.current < 0.999;
    if (solid.transparent !== translucent) {
      solid.transparent = translucent;
      solid.depthWrite = !translucent;
      solid.needsUpdate = true;
    }
    solid.opacity = fade.current;

    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    walls.forEach((w, i) => {
      const m = wallRefs.current[i];
      if (!m) return;
      const toCam = (camera as THREE.OrthographicCamera).isOrthographicCamera
        ? { x: -dir.x, z: -dir.z }
        : { x: camera.position.x - mm(w.x), z: camera.position.z - mm(w.z) };
      m.visible = w.nx * toCam.x + w.nz * toCam.z <= 1e-6;
    });
  });

  return (
    <group>
      <mesh geometry={floorGeom} rotation-x={-Math.PI / 2} receiveShadow userData={{ measurable: true }}>
        <meshStandardMaterial key={map?.uuid ?? 'plain'} color={map ? '#ffffff' : room.floorColor} map={map} roughness={0.85} />
      </mesh>
      {showWalls &&
        walls.map((w) => (
          <mesh key={w.key} ref={(m) => (wallRefs.current[w.key] = m)} receiveShadow position={[mm(w.x), mm(room.height) / 2, mm(w.z)]} rotation-y={w.rot} material={solid} userData={{ measurable: true }}>
            <boxGeometry args={[mm(w.len), mm(room.height), mm(room.wallThickness)]} />
          </mesh>
        ))}
      {room.columns.map((c) => (
        <mesh key={c.id} position={[mm(c.x), mm(room.height) / 2, mm(c.z)]} material={solid} castShadow receiveShadow userData={{ measurable: true }}>
          <boxGeometry args={[mm(c.w), mm(room.height), mm(c.d)]} />
          {!faded && <Edges color="#9a978f" />}
        </mesh>
      ))}
    </group>
  );
}
