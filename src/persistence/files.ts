import { importDesign, type CatalogRegistry, type Design, type ImportResult } from '../core';

export const FILE_FORMAT = 'butor-design';
export const FILE_EXTENSION = '.butor.json';

/** The design as a `.butor.json` file: the document unchanged (opaque entities included) plus a format tag. */
export function serializeDesign(design: Design): string {
  return JSON.stringify({ format: FILE_FORMAT, ...design }, null, 2);
}

/**
 * Reads a design file: format check, then the shared import pipeline (migrations, validation, opaque entities).
 * `legacy` converts files of the previous app (v1) and returns null for anything else.
 */
export function parseDesignFile(
  text: string,
  catalog: CatalogRegistry,
  legacy?: (raw: unknown) => ImportResult | null,
): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This file is not a Butor design (it is not valid JSON).' };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
    return { ok: false, error: 'This file is not a Butor design.' };
  const old = legacy?.(raw);
  if (old) return old;
  const { format, ...doc } = raw as Record<string, unknown>;
  if (format !== undefined && format !== FILE_FORMAT) return { ok: false, error: 'This file is not a Butor design.' };
  return importDesign(doc, catalog);
}

/** A safe file name for a design. */
export function fileNameFor(design: Design): string {
  const base =
    design.name
      .replace(/[^\p{L}\p{N} _-]+/gu, '')
      .trim()
      .replace(/\s+/g, '-') || 'design';
  return `${base.slice(0, 80)}${FILE_EXTENSION}`;
}
