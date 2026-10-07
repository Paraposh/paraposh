import { describe, expect, it } from 'vitest';
import { defaultSave, loadSave, MemoryStore, migrate, resetSave, SAVE_BACKUP_KEY, SAVE_KEY, SAVE_VERSION, writeSave, type KeyValueStore } from '../../src/save/save';

describe('save round trip', () => {
  it('starts fresh when nothing is stored', () => {
    const r = loadSave(new MemoryStore());
    expect(r.status).toBe('fresh');
    expect(r.save).toEqual(defaultSave());
  });
  it('writes and reads back identical data', () => {
    const store = new MemoryStore();
    const save = defaultSave();
    save.progress.stars['level-01'] = 3;
    save.meta.war_chest = 2;
    save.settings.muted = true;
    expect(writeSave(store, save)).toBe(true);
    const r = loadSave(store);
    expect(r.status).toBe('loaded');
    expect(r.save).toEqual(save);
  });
  it('reset removes the save', () => {
    const store = new MemoryStore();
    writeSave(store, defaultSave());
    resetSave(store);
    expect(loadSave(store).status).toBe('fresh');
  });
});

describe('migrations', () => {
  it('lifts a v1 save (stars only) to the current version without losing stars', () => {
    const store = new MemoryStore();
    store.setItem(SAVE_KEY, JSON.stringify({ version: 1, progress: { stars: { 'level-01': 2 } } }));
    const r = loadSave(store);
    expect(r.status).toBe('migrated');
    expect(r.save.version).toBe(SAVE_VERSION);
    expect(r.save.progress.stars['level-01']).toBe(2);
    expect(r.save.meta).toEqual({});
    expect(r.save.settings.muted).toBe(false);
  });
  it('rejects saves from the future and unknown versions', () => {
    expect(() => migrate({ version: SAVE_VERSION + 1 })).toThrow(/newer/);
    expect(() => migrate({ version: 0 })).toThrow(/No migration/);
    expect(() => migrate({})).toThrow(/no version/);
    expect(() => migrate([])).toThrow(/no version/);
  });
  it('drops malformed fields instead of trusting them', () => {
    const s = migrate({ version: SAVE_VERSION, progress: { stars: { a: 3, b: -1, c: 'x', d: 1.5 } }, meta: { m: 2, n: null }, settings: { muted: 'yes' } });
    expect(s.progress.stars).toEqual({ a: 3 });
    expect(s.meta).toEqual({ m: 2 });
    expect(s.settings.muted).toBe(false);
  });
});

describe('corrupt and broken storage', () => {
  it('keeps unreadable saves under a backup key and starts fresh', () => {
    const store = new MemoryStore();
    store.setItem(SAVE_KEY, '{not json');
    const r = loadSave(store);
    expect(r.status).toBe('recovered');
    expect(store.getItem(SAVE_BACKUP_KEY)).toBe('{not json');
  });
  it('treats a future-version save as recoverable too, keeping the original', () => {
    const store = new MemoryStore();
    const text = JSON.stringify({ version: 99 });
    store.setItem(SAVE_KEY, text);
    expect(loadSave(store).status).toBe('recovered');
    expect(store.getItem(SAVE_BACKUP_KEY)).toBe(text);
  });
  it('survives storage that throws', () => {
    const broken: KeyValueStore = {
      getItem() { throw new Error('blocked'); },
      setItem() { throw new Error('quota'); },
      removeItem() { throw new Error('blocked'); },
    };
    expect(loadSave(broken).status).toBe('fresh');
    expect(writeSave(broken, defaultSave())).toBe(false);
    expect(() => resetSave(broken)).not.toThrow();
  });
});
