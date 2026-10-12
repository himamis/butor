import type { ParamDef, TemplateDef } from '../types';
import { sidePanel } from './sidePanel';
import { horizontalPanel } from './horizontalPanel';
import { backPanel } from './backPanel';
import { rail } from './rail';
import { door } from './door';
import { drawer } from './drawer';
import { carcass } from './carcass';

/** Template library. To add a template: create a file in this folder and list it here. */
export const TEMPLATES: TemplateDef[] = [carcass, sidePanel, horizontalPanel, backPanel, door, drawer, rail];

const byId = new Map(TEMPLATES.map((t) => [t.id, t]));

export function hasTemplate(id: string): boolean {
  return byId.has(id);
}

export function getTemplate(id: string): TemplateDef {
  const t = byId.get(id);
  if (!t) throw new Error(`Unknown template: ${id}`);
  return t;
}

export function defaultParams(t: TemplateDef): Record<string, number> {
  return Object.fromEntries(t.params.map((p) => [p.key, p.default]));
}

/** NaN → default, then clamp to [min, max]. */
export function clampParam(def: ParamDef, v: number): number {
  if (!Number.isFinite(v)) return def.default;
  return Math.min(def.max, Math.max(def.min, v));
}
