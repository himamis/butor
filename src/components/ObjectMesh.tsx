import { memo, useMemo } from 'react';
import { Edges } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import type { SceneObject } from '../types';
import { mm } from '../units';
import { panelsOf } from '../lib/geometry';
import { useStore } from '../state/store';

const RAIL_COLOR = '#9aa0a6';

interface Props {
  obj: SceneObject;
  selected: boolean;
  overlapping: boolean;
  doorsHidden: boolean;
}

export const ObjectMesh = memo(function ObjectMesh({ obj, selected, overlapping, doorsHidden }: Props) {
  const panels = useMemo(() => panelsOf(obj), [obj.templateId, obj.params]);
  const select = useStore((s) => s.select);

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4) return; // orbit drag, not a click
    e.stopPropagation();
    select(obj.id, e.shiftKey);
  };

  return (
    <group position={[mm(obj.position.x), mm(obj.position.y), mm(obj.position.z)]} rotation-y={(obj.rotationY * Math.PI) / 180} onClick={onClick}>
      {panels.map((p, i) => {
        if (doorsHidden && p.role === 'door') return null;
        const isRail = p.role === 'rail';
        const color = isRail ? RAIL_COLOR : p.role === 'door' && obj.doorColor ? obj.doorColor : obj.color;
        return (
          <mesh key={i} position={[mm(p.pos.x), mm(p.pos.y), mm(p.pos.z)]} rotation-z={p.shape === 'cylinder' ? Math.PI / 2 : 0} castShadow receiveShadow>
            {p.shape === 'cylinder' ? (
              <cylinderGeometry args={[mm(Math.min(p.size.y, p.size.z)) / 2, mm(Math.min(p.size.y, p.size.z)) / 2, mm(p.size.x), 20]} />
            ) : (
              <boxGeometry args={[mm(p.size.x), mm(p.size.y), mm(p.size.z)]} />
            )}
            <meshStandardMaterial
              color={color}
              roughness={isRail ? 0.3 : 0.7}
              metalness={isRail ? 0.8 : 0}
              emissive={overlapping ? '#e53935' : '#000000'}
              emissiveIntensity={overlapping ? 0.55 : 0}
            />
            <Edges color={selected ? '#2f7cf6' : '#8a8a8a'} lineWidth={selected ? 2 : 1} />
          </mesh>
        );
      })}
    </group>
  );
});
