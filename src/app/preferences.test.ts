import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PREFERENCES,
  parsePreferences,
  PREFERENCES_KEY,
  PreferencesStore,
  serializePreferences,
  type KeyValueStore,
} from './preferences';

function memoryKv(initial?: string): KeyValueStore & { data: Map<string, string>; writes: string[] } {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(PREFERENCES_KEY, initial);
  const writes: string[] = [];
  return {
    data,
    writes,
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => {
      writes.push(v);
      data.set(k, v);
    },
  };
}

describe('parsePreferences', () => {
  it('a clean first install gets Dark, follow-device motion, auto-listen and haptics off', () => {
    expect(parsePreferences(null)).toEqual({ prefs: DEFAULT_PREFERENCES, source: 'fresh' });
    expect(DEFAULT_PREFERENCES).toEqual({ theme: 'dark', viz: null, listening: true, hapticAlerts: false });
  });

  it('round-trips every field', () => {
    const prefs = { theme: 'light', viz: 'off', listening: false, hapticAlerts: true } as const;
    expect(parsePreferences(serializePreferences(prefs))).toEqual({ prefs, source: 'stored' });
  });

  it('keeps viz = null (follow the device) instead of an effective value', () => {
    const prefs = { ...DEFAULT_PREFERENCES, viz: null };
    expect(parsePreferences(serializePreferences(prefs)).prefs.viz).toBeNull();
  });

  it.each(['{not json', '"text"', '42', 'null', '[]', '{"v":2,"listening":true}', '{"listening":true}'])(
    'unreadable %s recovers with listening off',
    (raw) => {
      const { prefs, source } = parsePreferences(raw);
      expect(source).toBe('recovered');
      expect(prefs.listening).toBe(false);
      expect(prefs.theme).toBe('dark');
    },
  );

  it('falls back per field, and an invalid listening value means off', () => {
    const { prefs, source } = parsePreferences(
      JSON.stringify({ v: 1, theme: 'sepia', viz: 'wild', listening: 'yes', hapticAlerts: 1 }),
    );
    expect(source).toBe('recovered');
    expect(prefs).toEqual({ theme: 'dark', viz: null, listening: false, hapticAlerts: false });
  });

  it('keeps valid fields next to an invalid one', () => {
    const { prefs } = parsePreferences(JSON.stringify({ v: 1, theme: 'light', viz: 'reduced', listening: true }));
    expect(prefs).toEqual({ theme: 'light', viz: 'reduced', listening: true, hapticAlerts: false });
  });
});

describe('PreferencesStore', () => {
  it('Theme and Motion survive two successive restarts', async () => {
    const kv = memoryKv();
    const s1 = new PreferencesStore(kv);
    expect(await s1.hydrate()).toBe('fresh');
    s1.update({ theme: 'light' });
    s1.update({ viz: 'off' });
    await s1.flush();

    const s2 = new PreferencesStore(kv);
    expect(await s2.hydrate()).toBe('stored');
    expect(s2.get()).toMatchObject({ theme: 'light', viz: 'off' });
    s2.update({ viz: null });
    await s2.flush();

    const s3 = new PreferencesStore(kv);
    await s3.hydrate();
    expect(s3.get()).toEqual({ ...DEFAULT_PREFERENCES, theme: 'light', viz: null });
  });

  it('applies changes in memory at once and writes them in order', async () => {
    const kv = memoryKv();
    const store = new PreferencesStore(kv);
    await store.hydrate();
    store.update({ listening: false });
    expect(store.get().listening).toBe(false);
    store.update({ theme: 'light' });
    await store.flush();
    expect(kv.writes).toHaveLength(2);
    expect(parsePreferences(kv.data.get(PREFERENCES_KEY)!).prefs).toMatchObject({ listening: false, theme: 'light' });
  });

  it('notifies subscribers on hydrate and update', async () => {
    const store = new PreferencesStore(memoryKv());
    let calls = 0;
    store.subscribe(() => calls++);
    await store.hydrate();
    store.update({ hapticAlerts: true });
    expect(calls).toBe(2);
  });

  it('a failed write keeps the in-memory value and later writes still run', async () => {
    const kv = memoryKv();
    let fail = true;
    const flaky: KeyValueStore = {
      getItem: kv.getItem,
      setItem: async (k, v) => {
        if (fail) throw new Error('disk full');
        return kv.setItem(k, v);
      },
    };
    const store = new PreferencesStore(flaky);
    await store.hydrate();
    store.update({ listening: false });
    await store.flush();
    expect(store.get().listening).toBe(false);
    fail = false;
    store.update({ theme: 'light' });
    await store.flush();
    expect(parsePreferences(kv.data.get(PREFERENCES_KEY)!).prefs).toMatchObject({ listening: false, theme: 'light' });
  });

  it('a storage read error recovers with listening off', async () => {
    const store = new PreferencesStore({
      getItem: async () => {
        throw new Error('storage unavailable');
      },
      setItem: async () => {},
    });
    expect(await store.hydrate()).toBe('recovered');
    expect(store.get().listening).toBe(false);
  });

  it('a hung read times out and recovers with listening off', async () => {
    const store = new PreferencesStore({ getItem: () => new Promise(() => {}), setItem: async () => {} });
    expect(await store.hydrate(10)).toBe('recovered');
    expect(store.get().listening).toBe(false);
  });

  it('corrupt stored data does not auto-start after a persisted Stop', async () => {
    const store = new PreferencesStore(memoryKv('{"v":1,"listening":fal'));
    expect(await store.hydrate()).toBe('recovered');
    expect(store.get().listening).toBe(false);
  });
});
