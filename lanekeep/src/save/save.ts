import type { MetaRanks } from '../meta/meta';
import type { Progress } from '../game/progress';

export const SAVE_KEY = 'lanekeep.save';
export const SAVE_BACKUP_KEY = 'lanekeep.save.corrupt';
export const SAVE_VERSION = 2;

export interface SaveData {
  version: number;
  progress: Progress;
  meta: MetaRanks;
  settings: { muted: boolean };
}

/** The part of localStorage the game uses, so tests can pass an in-memory store. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const defaultSave = (): SaveData => ({ version: SAVE_VERSION, progress: { stars: {} }, meta: {}, settings: { muted: false } });

/**
 * One step per old version, each lifting a save from version N to N + 1.
 * v1 stored stars only; v2 adds the meta-progression ranks and settings.
 */
const MIGRATIONS: Record<number, (s: Record<string, unknown>) => Record<string, unknown>> = {
  1: (s) => ({ ...s, version: 2, meta: {}, settings: { muted: false } }),
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const cleanCounts = (v: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (isObj(v)) for (const [k, n] of Object.entries(v)) if (typeof n === 'number' && Number.isInteger(n) && n >= 0) out[k] = n;
  return out;
};

/** Brings any known older save up to the current version and drops malformed fields. Throws on unusable input. */
export function migrate(raw: unknown): SaveData {
  if (!isObj(raw) || typeof raw.version !== 'number' || !Number.isInteger(raw.version)) throw new Error('Save has no version');
  if (raw.version > SAVE_VERSION) throw new Error(`Save version ${raw.version} is newer than this game (${SAVE_VERSION})`);
  let s: Record<string, unknown> = raw;
  while ((s.version as number) < SAVE_VERSION) {
    const step = MIGRATIONS[s.version as number];
    if (!step) throw new Error(`No migration from save version ${String(s.version)}`);
    s = step(s);
  }
  const progress = isObj(s.progress) ? s.progress : {};
  const settings = isObj(s.settings) ? s.settings : {};
  return {
    version: SAVE_VERSION,
    progress: { stars: cleanCounts(progress.stars) },
    meta: cleanCounts(s.meta),
    settings: { muted: settings.muted === true },
  };
}

export type LoadResult = { save: SaveData; status: 'fresh' | 'loaded' | 'migrated' | 'recovered' };

/** Never throws: a missing save starts fresh; an unreadable one is kept under a backup key and replaced by a fresh one. */
export function loadSave(store: KeyValueStore): LoadResult {
  let text: string | null = null;
  try {
    text = store.getItem(SAVE_KEY);
  } catch {
    return { save: defaultSave(), status: 'fresh' };
  }
  if (text === null) return { save: defaultSave(), status: 'fresh' };
  try {
    const raw = JSON.parse(text) as unknown;
    const from = isObj(raw) ? raw.version : undefined;
    return { save: migrate(raw), status: from === SAVE_VERSION ? 'loaded' : 'migrated' };
  } catch {
    try {
      store.setItem(SAVE_BACKUP_KEY, text);
    } catch {
      /* storage full or blocked: nothing more to do */
    }
    return { save: defaultSave(), status: 'recovered' };
  }
}

/** Returns false when storage refuses the write (private mode, quota). */
export function writeSave(store: KeyValueStore, save: SaveData): boolean {
  try {
    store.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function resetSave(store: KeyValueStore): void {
  try {
    store.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

export class MemoryStore implements KeyValueStore {
  private readonly m = new Map<string, string>();
  getItem(k: string): string | null { return this.m.get(k) ?? null; }
  setItem(k: string, v: string): void { this.m.set(k, v); }
  removeItem(k: string): void { this.m.delete(k); }
}
