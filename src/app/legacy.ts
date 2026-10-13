import { newId, type ImportResult } from '../core';
import { importV1, isV1Design } from '../catalog/v1import';

/** Files from the previous version of the app (v1) are converted on import. */
export const legacyImport = (raw: unknown): ImportResult | null =>
  isV1Design(raw) ? importV1(raw, newId, new Date().toISOString()) : null;
