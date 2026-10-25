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
    expect(calls).toBe(1);
    store.update({ hapticAlerts: true });
    expect(calls).toBeGreaterThan(1);
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
    const store = new PreferencesStore(flaky, { retryDelaysMs: [] });
    await store.hydrate();
    store.update({ listening: false });
    await store.flush();
    expect(store.get().listening).toBe(false);
    expect(store.getSaveState()).toBe('failed');
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

/** REQ-011 P1-C: whether a Stop really reached storage must be observable, and never claimed early. */
describe('PreferencesStore save state', () => {
  const STOP_NOT_SAVED = { retryDelaysMs: [1, 1] };

  /** Storage whose writes can be made to fail, hang or answer late; it records what landed. */
  function controllableKv(initial?: string) {
    const kv = memoryKv(initial);
    let mode: 'ok' | 'fail' | 'hang' = 'ok';
    const attempts: string[] = [];
    const held: Array<() => void> = [];
    const store: KeyValueStore = {
      getItem: kv.getItem,
      setItem: (k, v) => {
        attempts.push(v);
        if (mode === 'fail') return Promise.reject(new Error('disk full'));
        if (mode === 'hang') return new Promise(() => {});
        return new Promise<void>((resolve) => held.push(() => void kv.setItem(k, v).then(resolve)));
      },
    };
    const listeningOnDisk = () => parsePreferences(kv.data.get(PREFERENCES_KEY) ?? null).prefs.listening;
    /** Lets every write that reaches storage complete, in order, until no more arrive. */
    const release = async () => {
      for (let idle = 0; idle < 3; idle++) {
        if (held.length) {
          idle = -1;
          held.shift()!();
        }
        await new Promise((r) => setTimeout(r, 0));
      }
    };
    return { kv, store, attempts, setMode: (m: typeof mode) => (mode = m), listeningOnDisk, release };
  }

  const stored = (listening: boolean) => serializePreferences({ ...DEFAULT_PREFERENCES, listening });

  it('reports saving until the write completes, then saved', async () => {
    const c = controllableKv(stored(true));
    const store = new PreferencesStore(c.store);
    await store.hydrate();
    expect(store.getSaveState()).toBe('saved');
    store.update({ listening: false });
    expect(store.get().listening).toBe(false);
    expect(store.getSaveState()).toBe('saving'); // not claimed before storage answers
    await c.release();
    await store.flush();
    expect(store.getSaveState()).toBe('saved');
    expect(c.listeningOnDisk()).toBe(false);
  });

  it('a failing Stop is retried a bounded number of times, then reported, never undone', async () => {
    const c = controllableKv(stored(true));
    c.setMode('fail');
    const store = new PreferencesStore(c.store, STOP_NOT_SAVED);
    await store.hydrate();
    store.update({ listening: false });
    await store.flush();
    expect(c.attempts).toHaveLength(3);
    expect(store.getSaveState()).toBe('failed');
    expect(store.get().listening).toBe(false);
    expect(store.getLaunchListening()).toBe(true);

    // Honest limitation: a restart now still sees the old stored value.
    const restarted = new PreferencesStore(c.kv);
    await restarted.hydrate();
    expect(restarted.get().listening).toBe(true);
  });

  it('Retry after a failure stores the Stop, and the next launch stays stopped', async () => {
    const c = controllableKv(stored(true));
    c.setMode('fail');
    const store = new PreferencesStore(c.store, STOP_NOT_SAVED);
    await store.hydrate();
    store.update({ listening: false });
    await store.flush();
    expect(store.getSaveState()).toBe('failed');

    c.setMode('ok');
    store.retrySave();
    expect(store.getSaveState()).toBe('saving');
    await c.release();
    await store.flush();
    expect(store.getSaveState()).toBe('saved'); // no stale error
    expect(store.getLaunchListening()).toBe(false);

    const restarted = new PreferencesStore(c.kv);
    expect(await restarted.hydrate()).toBe('stored');
    expect(restarted.get().listening).toBe(false);
  });

  it('a hung write is reported as failed and not raced by a second write', async () => {
    const c = controllableKv(stored(true));
    c.setMode('hang');
    const store = new PreferencesStore(c.store, { writeTimeoutMs: 5 });
    await store.hydrate();
    store.update({ listening: false });
    expect(store.getSaveState()).toBe('saving');
    await new Promise((r) => setTimeout(r, 20));
    expect(store.getSaveState()).toBe('failed');
    store.retrySave();
    store.update({ theme: 'light' });
    expect(c.attempts).toHaveLength(1);
    expect(store.get()).toMatchObject({ listening: false, theme: 'light' });
  });

  it('a write that answers after the timeout still ends as saved', async () => {
    const c = controllableKv(stored(true));
    const store = new PreferencesStore(c.store, { writeTimeoutMs: 5 });
    await store.hydrate();
    store.update({ listening: false });
    await new Promise((r) => setTimeout(r, 20));
    expect(store.getSaveState()).toBe('failed');
    await c.release();
    await store.flush();
    expect(store.getSaveState()).toBe('saved');
    expect(c.listeningOnDisk()).toBe(false);
  });

  it('several quick changes are written in order and end with the final Stop', async () => {
    const c = controllableKv(stored(false));
    const store = new PreferencesStore(c.store);
    await store.hydrate();
    store.update({ listening: true });
    store.update({ theme: 'light' });
    store.update({ listening: false });
    store.update({ listening: true });
    store.update({ listening: false });
    await c.release();
    await store.flush();
    // The first write was already with storage; everything queued behind it collapses to the latest.
    expect(c.attempts.map((v) => JSON.parse(v).listening)).toEqual([true, false]);
    expect(c.listeningOnDisk()).toBe(false);
    expect(store.getSaveState()).toBe('saved');
  });

  it('an old write that fails cannot leave a newer Stop unsaved', async () => {
    const c = controllableKv(stored(true));
    c.setMode('fail');
    const store = new PreferencesStore(c.store, { retryDelaysMs: [] });
    await store.hydrate();
    store.update({ theme: 'light' });
    c.setMode('ok');
    store.update({ listening: false });
    await c.release();
    await store.flush();
    expect(c.listeningOnDisk()).toBe(false);
    expect(store.getSaveState()).toBe('saved');
  });

  it('a new change after a failure starts a fresh bounded attempt', async () => {
    const c = controllableKv(stored(true));
    c.setMode('fail');
    const store = new PreferencesStore(c.store, { retryDelaysMs: [] });
    await store.hydrate();
    store.update({ listening: false });
    await store.flush();
    expect(store.getSaveState()).toBe('failed');
    c.setMode('ok');
    store.update({ theme: 'light' });
    await c.release();
    await store.flush();
    expect(store.getSaveState()).toBe('saved');
    expect(c.listeningOnDisk()).toBe(false);
  });

  it('unreadable stored data still starts with listening off and needs no write', async () => {
    const c = controllableKv('{"v":1,"listening":tr');
    const store = new PreferencesStore(c.store);
    expect(await store.hydrate()).toBe('recovered');
    expect(store.get().listening).toBe(false);
    expect(store.getSaveState()).toBe('saved');
    expect(c.attempts).toHaveLength(0);
  });
});

