import { Html, Line } from '@react-three/drei';
import type { Vec3 } from '../types';
import type { Box } from '../lib/geometry';
import { mm } from '../units';

const v = (p: Vec3): [number, number, number] => [mm(p.x), mm(p.y), mm(p.z)];
const TICK = 40; // mm

/** A measurement line between a and b (mm) with end ticks along `tick` and a centered label. */
function DimLine({ a, b, tick, color }: { a: Vec3; b: Vec3; tick: Vec3; color: string }) {
  const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  if (len < 1) return null;
  const t = (p: Vec3, s: number): Vec3 => ({ x: p.x + tick.x * s, y: p.y + tick.y * s, z: p.z + tick.z * s });
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
  return (
    <group>
      <Line points={[v(a), v(b)]} color={color} lineWidth={1.5} depthTest={false} />
      <Line points={[v(t(a, -TICK)), v(t(a, TICK))]} color={color} lineWidth={1.5} depthTest={false} />
      <Line points={[v(t(b, -TICK)), v(t(b, TICK))]} color={color} lineWidth={1.5} depthTest={false} />
      <Html position={v(mid)} center zIndexRange={[5, 0]}>
        <div className="dim-label" style={{ color }}>{Math.round(len)} mm</div>
      </Html>
    </group>
  );
}

/** Width (front-bottom), height (front-left) and depth (top-right) lines around a box. */
export function BoxDimensions({ box, offset, color }: { box: Box; offset: number; color: string }) {
  const { min, max } = box;
  return (
    <group renderOrder={10}>
      <DimLine
        a={{ x: min.x, y: min.y, z: max.z + offset }}
        b={{ x: max.x, y: min.y, z: max.z + offset }}
        tick={{ x: 0, y: 0, z: 1 }}
        color={color}
      />
      <DimLine
        a={{ x: min.x - offset, y: min.y, z: max.z }}
        b={{ x: min.x - offset, y: max.y, z: max.z }}
        tick={{ x: 1, y: 0, z: 0 }}
        color={color}
      />
      <DimLine
        a={{ x: max.x + offset, y: max.y, z: min.z }}
        b={{ x: max.x + offset, y: max.y, z: max.z }}
        tick={{ x: 1, y: 0, z: 0 }}
        color={color}
      />
    </group>
  );
}
