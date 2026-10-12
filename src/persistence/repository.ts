import { openDB } from 'idb';
import type { Design } from '../core';

/** One row of the start screen. */
export interface IndexEntry {
  id: string;
  name: string;
  updatedAt: string;
  thumbnail?: string; // small PNG data URL
}

/** View state worth keeping per design (docs/v2/09-persistence.md). */
export interface StoredView {
  mode?: string;
  explodeAmount?: number;
  hideFronts?: boolean;
}

type StoreName = 'designs' | 'index' | 'view' | 'settings';

/** The storage underneath the repository: IndexedDB, or memory when that is unavailable. */
export interface Backend {
  readonly persistent: boolean;
  get(store: StoreName, key: string): Promise<unknown>;
  put(store: StoreName, key: string, value: unknown): Promise<void>;
  delete(store: StoreName, key: string): Promise<void>;
  all(store: StoreName): Promise<unknown[]>;
}

export interface Repository {
  /** False when designs only live in memory (private mode, storage blocked). */
  readonly persistent: boolean;
  list(): Promise<IndexEntry[]>;
  /** The stored document, untrusted: run it through `importDesign` before use. */
  get(id: string): Promise<unknown>;
  save(design: Design, thumbnail?: string): Promise<void>;
  remove(id: string): Promise<void>;
  getView(id: string): Promise<StoredView | undefined>;
  putView(id: string, view: StoredView): Promise<void>;
  getSetting<T>(key: string): Promise<T | undefined>;
  putSetting(key: string, value: unknown): Promise<void>;
}

export function memoryBackend(): Backend {
  const stores = new Map<StoreName, Map<string, unknown>>();
  const s = (n: StoreName) => stores.get(n) ?? stores.set(n, new Map()).get(n)!;
  const clone = <T>(v: T): T => (v === undefined ? v : structuredClone(v));
  return {
    persistent: false,
    get: async (n, k) => clone(s(n).get(k)),
    put: async (n, k, v) => void s(n).set(k, clone(v)),
    delete: async (n, k) => void s(n).delete(k),
    all: async (n) => [...s(n).values()].map(clone),
  };
}

export async function indexedDbBackend(): Promise<Backend> {
  const db = await openDB('butor', 1, {
    upgrade(d) {
      d.createObjectStore('designs');
      d.createObjectStore('index');
      d.createObjectStore('view');
      d.createObjectStore('settings');
    },
  });
  return {
    persistent: true,
    get: (n, k) => db.get(n, k),
    put: async (n, k, v) => void (await db.put(n, v, k)),
    delete: (n, k) => db.delete(n, k),
    all: (n) => db.getAll(n),
  };
}

export function createRepository(backend: Backend): Repository {
  // Writes to one design are serialised so an older save can never land after a newer one.
  const queues = new Map<string, Promise<unknown>>();
  const serial = <T>(id: string, task: () => Promise<T>): Promise<T> => {
    const run = (queues.get(id) ?? Promise.resolve()).catch(() => undefined).then(task);
    queues.set(id, run);
    return run;
  };
  return {
    persistent: backend.persistent,
    async list() {
      const rows = (await backend.all('index')) as IndexEntry[];
      return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    get: (id) => backend.get('designs', id),
    save: (design, thumbnail) =>
      serial(design.id, async () => {
        const old = (await backend.get('index', design.id)) as IndexEntry | undefined;
        await backend.put('designs', design.id, design);
        const thumb = thumbnail ?? old?.thumbnail;
        const entry: IndexEntry = {
          id: design.id,
          name: design.name,
          updatedAt: design.meta.updatedAt,
          ...(thumb ? { thumbnail: thumb } : {}),
        };
        await backend.put('index', design.id, entry);
      }),
    remove: (id) =>
      serial(id, async () => {
        await backend.delete('designs', id);
        await backend.delete('index', id);
        await backend.delete('view', id);
      }),
    getView: async (id) => (await backend.get('view', id)) as StoredView | undefined,
    putView: (id, view) => backend.put('view', id, view),
    getSetting: async <T>(key: string) => (await backend.get('settings', key)) as T | undefined,
    putSetting: (key, value) => backend.put('settings', key, value),
  };
}

/** IndexedDB when it opens, otherwise memory (the app says so). */
export async function openRepository(): Promise<Repository> {
  try {
    if (typeof indexedDB === 'undefined') throw new Error('no IndexedDB');
    return createRepository(await indexedDbBackend());
  } catch {
    return createRepository(memoryBackend());
  }
}
