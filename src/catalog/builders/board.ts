import type { Axis, Banding, Motion, PartDraft, PartRole } from '../../core';

/** A box part from its extents (min/max per axis, entity-local mm). */
export function boardPart(o: {
  key: string;
  label: string;
  role: PartRole;
  material: string;
  thickness?: number;
  x: [number, number];
  y: [number, number];
  z: [number, number];
  grain?: Axis;
  banding?: Banding;
  motion?: Motion | undefined;
  hardware?: { name: string; count?: number };
}): PartDraft {
  return {
    key: o.key,
    label: o.label,
    role: o.role,
    shape: { kind: 'box' },
    center: { x: (o.x[0] + o.x[1]) / 2, y: (o.y[0] + o.y[1]) / 2, z: (o.z[0] + o.z[1]) / 2 },
    size: { x: o.x[1] - o.x[0], y: o.y[1] - o.y[0], z: o.z[1] - o.z[0] },
    material: o.thickness === undefined ? { id: o.material } : { id: o.material, thickness: o.thickness },
    ...(o.grain ? { grainAlong: o.grain } : {}),
    ...(o.banding ? { banding: o.banding } : {}),
    ...(o.motion ? { motion: o.motion } : {}),
    ...(o.hardware ? { hardware: o.hardware } : {}),
  };
}

/** Attaches a motion to every part (parts that move together). */
export const moving = (parts: PartDraft[], motion: Motion | undefined): PartDraft[] =>
  motion ? parts.map((p) => ({ ...p, motion })) : parts;
