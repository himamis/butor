const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';

/**
 * 21-character url-safe random id. Uses crypto.getRandomValues, which — unlike crypto.randomUUID —
 * exists in insecure contexts (the app is served over plain http on LANs).
 */
export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(21));
  let id = '';
  for (const b of bytes) id += ALPHABET[b & 63];
  return id;
}

/** Deterministic ids (`prefix1`, `prefix2`, …) for tests and reproducible server runs. */
export function createIdGenerator(prefix: string): () => string {
  let n = 0;
  return () => `${prefix}${++n}`;
}
