import { memo, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import type { Motion, Panel, SceneObject, Vec3 } from '../types';
import { mm } from '../units';
import { objectSize, panelsOf } from '../lib/geometry';
import { partTransform } from '../lib/motion';
import { partExplodeOffset } from '../lib/explode';
import { frontOutline } from '../lib/cutoutShape';
import { useStore } from '../state/store';

const RAIL_COLOR = '#9aa0a6';
const HANDLE_COLOR = '#55595e';
const OPEN_SPEED = 7;
const EXPLODE_SPEED = 5;
const MAX_DT = 1 / 30; // with on-demand rendering the first frame after idle has a huge delta

const EDGE = new THREE.LineBasicMaterial({ color: '#8a8a8a' });
const EDGE_SELECTED = new THREE.LineBasicMaterial({ color: '#2f7cf6' });
const SELECTED_TINT = '#2f7cf6';

/** Outline geometry per panel shape, shared by every panel of the same size (cheap 1-px lines). */
const edgeCache = new Map<string, THREE.EdgesGeometry>();
function panelEdges(p: Panel): THREE.EdgesGeometry {
  const key = `${p.size.x}|${p.size.y}|${p.size.z}|${p.cutout ? JSON.stringify(p.cutout) : ''}`;
  let g = edgeCache.get(key);
  if (!g) {
    const base = p.cutout ? frontGeometry(p) : new THREE.BoxGeometry(mm(p.size.x), mm(p.size.y), mm(p.size.z));
    g = new THREE.EdgesGeometry(base, 20);
    base.dispose();
    if (edgeCache.size > 2000) edgeCache.clear(); // bounded; entries are rebuilt on demand
    edgeCache.set(key, g);
  }
  return g;
}

/** A front with a real cutout: its outline extruded to its thickness, centered like a box. */
function frontGeometry(p: Panel): THREE.ExtrudeGeometry {
  const { outline, holes } = frontOutline(p.size.x, p.size.y, p.cutout);
  const shape = new THREE.Shape(outline.map((q) => new THREE.Vector2(mm(q.x), mm(q.y))));
  shape.holes = holes.map((h) => new THREE.Path(h.map((q) => new THREE.Vector2(mm(q.x), mm(q.y)))));
  const g = new THREE.ExtrudeGeometry(shape, { depth: mm(p.size.z), bevelEnabled: false });
  g.translate(0, 0, -mm(p.size.z) / 2);
  return g;
}

interface Props {
  obj: SceneObject;
  selected: boolean;
  overlapping: boolean;
  doorsHidden: boolean;
  open: boolean;
  explode: number; // 0 = assembled
  spread: Vec3; // whole-object explode offset (mm) at the current explode amount
}

/** Panels that move together: one entry per motion group, one per static panel. */
type Part = { key: string; panels: Panel[]; motion?: Motion };

function partsOf(panels: Panel[]): Part[] {
  const parts: Part[] = [];
  const byMotion = new Map<string, Part>();
  panels.forEach((p, i) => {
    if (!p.motion) return parts.push({ key: `p${i}`, panels: [p] });
    let part = byMotion.get(p.motion.id);
    if (!part) {
      part = { key: `m-${p.motion.id}`, panels: [], motion: p.motion };
      byMotion.set(p.motion.id, part);
      parts.push(part);
    }
    part.panels.push(p);
  });
  return parts;
}

function PanelGeometry({ p }: { p: Panel }) {
  const extruded = useMemo(() => (p.cutout ? frontGeometry(p) : null), [p.cutout, p.size.x, p.size.y, p.size.z]);
  useEffect(() => () => extruded?.dispose(), [extruded]);

  if (extruded) return <primitive object={extruded} attach="geometry" />;
  if (p.shape === 'cylinder' || p.shape === 'knob') {
    const r = mm(p.shape === 'knob' ? Math.min(p.size.x, p.size.y) : Math.min(p.size.y, p.size.z)) / 2;
    const len = mm(p.shape === 'knob' ? p.size.z : p.size.x);
    return <cylinderGeometry args={[r, r, len, 24]} />;
  }
  return <boxGeometry args={[mm(p.size.x), mm(p.size.y), mm(p.size.z)]} />;
}

function PanelMesh({ p, obj, selected, overlapping }: { p: Panel; obj: SceneObject; selected: boolean; overlapping: boolean }) {
  const metal = p.role === 'rail' || p.role === 'handle' || p.role === 'hardware';
  const color = p.role === 'rail' || p.role === 'hardware' ? RAIL_COLOR : p.role === 'handle' ? HANDLE_COLOR : p.role === 'door' && obj.doorColor ? obj.doorColor : obj.color;
  const rotation: [number, number, number] =
    p.shape === 'cylinder' ? [0, 0, Math.PI / 2] : p.shape === 'knob' ? [Math.PI / 2, 0, 0] : [0, 0, 0];
  return (
    <mesh position={[mm(p.pos.x), mm(p.pos.y), mm(p.pos.z)]} rotation={rotation} castShadow receiveShadow userData={{ measurable: true }}>
      <PanelGeometry p={p} />
      <meshStandardMaterial
        color={color}
        roughness={metal ? 0.3 : 0.7}
        metalness={metal ? 0.8 : 0}
        emissive={overlapping ? '#e53935' : selected ? SELECTED_TINT : '#000000'}
        emissiveIntensity={overlapping ? 0.55 : selected ? 0.12 : 0}
      />
      {!metal && <lineSegments geometry={panelEdges(p)} material={selected ? EDGE_SELECTED : EDGE} />}
    </mesh>
  );
}

/** A static panel or a moving group, animated toward its open / exploded target. */
function AnimatedPart({ part, size, open, explode, children }: { part: Part; size: Vec3; open: boolean; explode: number; children: React.ReactNode }) {
  const outer = useRef<THREE.Group>(null!);
  const inner = useRef<THREE.Group>(null!);
  const st = useRef({ t: 0, e: 0 });
  const anchor = part.panels[0].pos; // the front for doors/drawers
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => invalidate(), [open, explode, invalidate]); // start animating towards the new target

  useFrame((state, delta) => {
    const s = st.current;
    const dt = Math.min(delta, MAX_DT);
    s.t = THREE.MathUtils.damp(s.t, open ? 1 : 0, OPEN_SPEED, dt);
    s.e = THREE.MathUtils.damp(s.e, explode, EXPLODE_SPEED, dt);
    if (Math.abs(s.t - (open ? 1 : 0)) < 1e-4) s.t = open ? 1 : 0;
    if (Math.abs(s.e - explode) < 1e-4) s.e = explode;
    if (s.t !== (open ? 1 : 0) || s.e !== explode) {
      state.invalidate(); // keep frames coming until settled
      state.gl.shadowMap.needsUpdate = true;
    }
    const tr = partTransform(part.motion, s.t, partExplodeOffset(anchor, size, s.e));
    outer.current.position.set(mm(tr.outer.x), mm(tr.outer.y), mm(tr.outer.z));
    outer.current.rotation.y = tr.rotationY;
    inner.current.position.set(mm(tr.inner.x), mm(tr.inner.y), mm(tr.inner.z));
  });

  return (
    <group ref={outer}>
      <group ref={inner}>{children}</group>
    </group>
  );
}

export const ObjectMesh = memo(function ObjectMesh({ obj, selected, overlapping, doorsHidden, open, explode, spread }: Props) {
  const parts = useMemo(() => partsOf(panelsOf(obj)), [obj.templateId, obj.params]);
  const size = objectSize(obj);
  const root = useRef<THREE.Group>(null!);
  const cur = useRef({ x: 0, z: 0 });
  const select = useStore((s) => s.select);
  const toggleOpen = useStore((s) => s.toggleOpen);
  const movable = parts.some((p) => p.motion);

  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => invalidate(), [spread, invalidate]);

  useFrame((state, delta) => {
    const c = cur.current;
    const dt = Math.min(delta, MAX_DT);
    c.x = THREE.MathUtils.damp(c.x, spread.x, EXPLODE_SPEED, dt);
    c.z = THREE.MathUtils.damp(c.z, spread.z, EXPLODE_SPEED, dt);
    if (Math.abs(c.x - spread.x) < 0.01 && Math.abs(c.z - spread.z) < 0.01) {
      c.x = spread.x; // settle exactly, so leaving explode restores the original position
      c.z = spread.z;
    } else {
      state.invalidate();
      state.gl.shadowMap.needsUpdate = true;
    }
    root.current.position.set(mm(obj.position.x + c.x), mm(obj.position.y), mm(obj.position.z + c.z));
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4 || useStore.getState().tool === 'measure') return; // orbit drag, or measuring
    e.stopPropagation();
    select(obj.id, e.shiftKey);
  };
  const onDoubleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (useStore.getState().tool === 'measure') return;
    if (movable) toggleOpen(obj.id);
  };

  return (
    <group
      ref={root}
      position={[mm(obj.position.x), mm(obj.position.y), mm(obj.position.z)]}
      rotation-y={(obj.rotationY * Math.PI) / 180}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      {parts.map((part) => {
        const hasFront = part.panels.some((p) => p.role === 'door');
        const visible = part.panels.filter((p) => !(doorsHidden && hasFront && (p.role === 'door' || p.role === 'handle')));
        if (!visible.length) return null;
        return (
          <AnimatedPart key={part.key} part={part} size={size} open={open} explode={explode}>
            {visible.map((p, i) => (
              <PanelMesh key={i} p={p} obj={obj} selected={selected} overlapping={overlapping} />
            ))}
          </AnimatedPart>
        );
      })}
    </group>
  );
});
