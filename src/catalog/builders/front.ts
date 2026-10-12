import type { Motion, PartDraft } from '../../core';
import { frontOutline, type Cutout } from './cutout';

/** A front panel (door, flap, drawer front) — a box, or an extrusion when it has a grip cutout. */
export function frontPanel(o: {
  key: string;
  label: string;
  rect: { x0: number; x1: number; y0: number; y1: number };
  z0: number; // back face
  thickness: number;
  material: string;
  grain: 'x' | 'y';
  motion?: Motion | undefined;
  cutout?: Cutout | undefined;
  hardware?: { name: string; count?: number };
}): PartDraft {
  const w = o.rect.x1 - o.rect.x0;
  const h = o.rect.y1 - o.rect.y0;
  const shape: PartDraft['shape'] = o.cutout ? { kind: 'extrusion', ...frontOutline(w, h, o.cutout) } : { kind: 'box' };
  return {
    key: o.key,
    label: o.cutout ? `${o.label} (${o.cutout.kind === 'hole' ? 'grip hole' : 'grip notch'})` : o.label,
    role: 'front',
    shape,
    center: { x: o.rect.x0 + w / 2, y: o.rect.y0 + h / 2, z: o.z0 + o.thickness / 2 },
    size: { x: w, y: h, z: o.thickness },
    material: { id: o.material, thickness: o.thickness },
    grainAlong: o.grain,
    banding: { left: true, right: true, top: true, bottom: true },
    ...(o.motion ? { motion: o.motion } : {}),
    ...(o.hardware ? { hardware: o.hardware } : {}),
  };
}
