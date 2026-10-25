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
  it('a clean first install gets Dark, auto-listen and haptics off, and no motion choice', () => {
    expect(parsePreferences(null)).toEqual({ prefs: DEFAULT_PREFERENCES, source: 'fresh' });
    expect(DEFAULT_PREFERENCES).toEqual({ theme: 'dark', listening: true, hapticAlerts: false });
  });

  it('round-trips every field', () => {
    const prefs = { theme: 'light', listening: false, hapticAlerts: true } as const;
    expect(parsePreferences(serializePreferences(prefs))).toEqual({ prefs, source: 'stored' });
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
      JSON.stringify({ v: 1, theme: 'sepia', listening: 'yes', hapticAlerts: 1 }),
    );
    expect(source).toBe('recovered');
    expect(prefs).toEqual({ theme: 'dark', listening: false, hapticAlerts: false });
  });

  it('keeps valid fields next to an invalid one', () => {
    const { prefs } = parsePreferences(JSON.stringify({ v: 1, theme: 'light', listening: true }));
    expect(prefs).toEqual({ theme: 'light', listening: true, hapticAlerts: false });
  });
});

/** REQ-010: preferences saved by REQ-004..008 builds still carry the retired Motion choice. */
describe('legacy viz preference', () => {
  const legacy = (viz: unknown, rest: Record<string, unknown> = {}) =>
    JSON.stringify({ v: 1, theme: 'light', viz, listening: false, hapticAlerts: true, ...rest });

  it.each(['off', 'animated', 'reduced', null, 'wild', 7])('viz = %j is ignored and keeps every other choice', (viz) => {
    const { prefs, source } = parsePreferences(legacy(viz));
    expect(source).toBe('stored');
    expect(prefs).toEqual({ theme: 'light', listening: false, hapticAlerts: true });
    expect(prefs).not.toHaveProperty('viz');
  });

  it('a deliberate Stop saved next to viz = off stays stopped', () => {
    expect(parsePreferences(legacy('off')).prefs.listening).toBe(false);
    expect(parsePreferences(legacy('off', { listening: true })).prefs.listening).toBe(true);
  });

  it('is dropped on the next write without touching listening, theme or haptics', async () => {
    const kv = memoryKv(legacy('off'));
    const s1 = new PreferencesStore(kv);
    expect(await s1.hydrate()).toBe('stored');
    expect(kv.writes).toHaveLength(0); // hydrating alone never rewrites storage
    s1.update({ theme: 'dark' });
    await s1.flush();
    const written = JSON.parse(kv.data.get(PREFERENCES_KEY)!);
    expect(written).toEqual({ v: 1, theme: 'dark', listening: false, hapticAlerts: true });

    const s2 = new PreferencesStore(kv);
    expect(await s2.hydrate()).toBe('stored');
    expect(s2.get()).toEqual({ theme: 'dark', listening: false, hapticAlerts: true });
  });
});

describe('PreferencesStore', () => {
  it('Theme and listening intent survive two successive restarts', async () => {
    const kv = memoryKv();
    const s1 = new PreferencesStore(kv);
    expect(await s1.hydrate()).toBe('fresh');
    s1.update({ theme: 'light' });
    s1.update({ listening: false });
    await s1.flush();

    const s2 = new PreferencesStore(kv);
    expect(await s2.hydrate()).toBe('stored');
    expect(s2.get()).toMatchObject({ theme: 'light', listening: false });
    s2.update({ hapticAlerts: true });
    await s2.flush();

    const s3 = new PreferencesStore(kv);
    await s3.hydrate();
    expect(s3.get()).toEqual({ theme: 'light', listening: false, hapticAlerts: true });
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
