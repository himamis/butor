import { z } from 'zod';
import { Hex } from '../schema/primitives';

/**
 * Template parameter helpers (docs/v2/04-catalog.md). Each returns a zod schema and records UI
 * metadata for it, so validation, forms, the AI tool schema and defaults all come from one definition.
 * Enumerations are always strings.
 */
export type ParamMeta =
  | { kind: 'mm'; label: string; min: number; max: number; default: number; step?: number }
  | { kind: 'count'; label: string; min: number; max: number; default: number }
  | { kind: 'choice'; label: string; options: Record<string, string>; default: string }
  | { kind: 'toggle'; label: string; default: boolean }
  | { kind: 'color'; label: string; default: string };

const metaOf = new WeakMap<z.ZodType, ParamMeta>();

function register<T extends z.ZodType>(schema: T, meta: ParamMeta): T {
  metaOf.set(schema, meta);
  return schema;
}

export const mm = (o: { label: string; min: number; max: number; default: number; step?: number }) =>
  register(z.number().min(o.min).max(o.max).default(o.default), { kind: 'mm', ...o });

export const count = (o: { label: string; min: number; max: number; default: number }) =>
  register(z.number().int().min(o.min).max(o.max).default(o.default), { kind: 'count', ...o });

export const choice = <K extends string>(o: { label: string; options: Record<K, string>; default: NoInfer<K> }) =>
  register(z.enum(Object.keys(o.options) as [K, ...K[]]).default(o.default as never), { kind: 'choice', ...o });

export const toggle = (o: { label: string; default: boolean }) =>
  register(z.boolean().default(o.default), { kind: 'toggle', ...o });

export const color = (o: { label: string; default: string }) =>
  register(Hex.default(o.default), { kind: 'color', ...o });

export type ParamsSchema = z.ZodObject<Record<string, z.ZodType>>;

export type ParamDescription = ParamMeta & { key: string };

export function describeParams(schema: ParamsSchema): ParamDescription[] {
  return Object.entries(schema.shape).flatMap(([key, s]) => {
    const meta = metaOf.get(s);
    return meta ? [{ key, ...meta }] : [];
  });
}

export function defaultsOf(schema: ParamsSchema): Record<string, unknown> {
  return Object.fromEntries(describeParams(schema).map((d) => [d.key, d.default]));
}

export type ParseResult =
  | { ok: true; value: Record<string, unknown>; notes: string[] }
  | { ok: false; error: string; notes: string[] };

/**
 * Validates `patch` merged over `base` (or over defaults when there is no base).
 * Numbers are clamped to their limits (with a note) instead of rejected; counts are rounded;
 * unknown keys are dropped with a note listing the allowed keys.
 */
export function parseParams(
  schema: ParamsSchema,
  patch: unknown,
  base: Record<string, unknown> | undefined,
): ParseResult {
  const notes: string[] = [];
  if (patch !== undefined && (typeof patch !== 'object' || patch === null || Array.isArray(patch))) {
    return { ok: false, error: 'params must be an object', notes };
  }
  const known = describeParams(schema);
  const keys = new Set(known.map((d) => d.key));
  const merged: Record<string, unknown> = { ...(base ?? defaultsOf(schema)) };
  for (const [key, value] of Object.entries((patch ?? {}) as Record<string, unknown>)) {
    if (!keys.has(key)) {
      notes.push(`ignored unknown param "${key}" (allowed: ${[...keys].join(', ')})`);
      continue;
    }
    merged[key] = value;
  }
  for (const d of known) {
    const v = merged[d.key];
    if ((d.kind === 'mm' || d.kind === 'count') && typeof v === 'number' && Number.isFinite(v)) {
      let c = Math.min(d.max, Math.max(d.min, d.kind === 'count' ? Math.round(v) : v));
      if (d.kind === 'count') c = Math.round(c);
      if (c !== v)
        notes.push(
          `${d.key} ${d.kind === 'count' && Math.round(v) === c ? 'rounded' : 'clamped'} to ${c} (${d.min}–${d.max})`,
        );
      merged[d.key] = c;
    }
  }
  const r = schema.safeParse(merged);
  if (!r.success) {
    const error = r.error.issues.map((i) => `${i.path.join('.') || 'params'}: ${i.message}`).join('; ');
    return { ok: false, error, notes };
  }
  return { ok: true, value: r.data, notes };
}
