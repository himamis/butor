import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import { importDesign, type CatalogRegistry, type Design, type ImportResult } from '../core';

/** Share links (docs/v2/09-persistence.md#share-links): `{origin}/view#d=<base64url(deflate-raw(JSON))>&v=1`. */
export const SHARE_VERSION = 1;
export const SHARE_LIMIT = 60_000; // characters; above this the Share dialog offers a file instead

function toBase64Url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

/** Pure JS deflate (raw) so links are identical in every browser and work without secure-context APIs. */
export function encodeShare(design: Design): string {
  return `d=${toBase64Url(deflateSync(strToU8(JSON.stringify(design)), { level: 9 }))}&v=${SHARE_VERSION}`;
}

export function shareUrl(origin: string, design: Design): string {
  return `${origin}/view#${encodeShare(design)}`;
}

const DAMAGED = 'This link is damaged or incomplete. Ask for a new link, or for the design as a file.';

/** Decodes a share fragment (with or without the leading #) through the same pipeline as a file import. */
export function decodeShare(fragment: string, catalog: CatalogRegistry): ImportResult {
  const params = new URLSearchParams(fragment.replace(/^#/, ''));
  const d = params.get('d');
  const v = Number(params.get('v') ?? SHARE_VERSION);
  if (!d) return { ok: false, error: DAMAGED };
  if (v !== SHARE_VERSION) return { ok: false, error: 'This link was made with a different version of Butor.' };
  let raw: unknown;
  try {
    raw = JSON.parse(strFromU8(inflateSync(fromBase64Url(d))));
  } catch {
    return { ok: false, error: DAMAGED };
  }
  const r = importDesign(raw, catalog);
  return r.ok ? r : { ok: false, error: `${DAMAGED} (${r.error})` };
}
