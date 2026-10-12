import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import type { Design } from '../types';
import { parseDesign } from './persistence';

const PREFIX = '#view=';

/** The compressed payload of a view link, or null if the hash is not a view link. */
export function shareHashOf(hash: string): string | null {
  return hash.startsWith(PREFIX) ? hash.slice(PREFIX.length) : null;
}

export function encodeShare(d: Design): string {
  return PREFIX + compressToEncodedURIComponent(JSON.stringify(d));
}

/** Decodes and validates a view link. Null for anything that is not a usable design. */
export function decodeShare(hash: string): Design | null {
  const data = shareHashOf(hash);
  if (!data) return null;
  try {
    const json = decompressFromEncodedURIComponent(data);
    return json ? parseDesign(JSON.parse(json)) : null;
  } catch {
    return null;
  }
}
