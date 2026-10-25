import type { Unsubscribe } from '../core/types';
import type { ThemeMode } from '../ui/theme';

export type VizChoice = 'animated' | 'reduced' | 'off';

/** Everything AUVIONA remembers between launches. No audio, sound labels or history. */
export interface Preferences {
  theme: ThemeMode;
  /** null = follow the device's Reduce Motion setting until the user picks a mode. */
  viz: VizChoice | null;
  /** The user's listening intent (REQ-008 P0-C), not whether the microphone is on right now. */
  listening: boolean;
  hapticAlerts: boolean;
}

/** A clean first install: Dark, follow Reduce Motion, listen automatically, haptics off. */
export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'dark',
  viz: null,
  listening: true,
  hapticAlerts: false,
};

/**
 * Used whenever stored preferences exist but cannot be read or trusted. Listening is off, so
 * recovering from a persisted Stop can never auto-start the microphone; Start still works.
 */
export const RECOVERED_PREFERENCES: Preferences = { ...DEFAULT_PREFERENCES, listening: false };

export const PREFERENCES_KEY = 'auviona.preferences';
const VERSION = 1;
const THEMES: readonly ThemeMode[] = ['dark', 'light'];
const VIZ: readonly VizChoice[] = ['animated', 'reduced', 'off'];

/** fresh = nothing stored; stored = read cleanly; recovered = unreadable, fell back to RECOVERED_PREFERENCES rules. */
export type PreferencesSource = 'fresh' | 'stored' | 'recovered';

export function serializePreferences(p: Preferences): string {
  return JSON.stringify({ v: VERSION, ...p });
}

/**
 * Deterministic and total: never throws. Only a missing key counts as a first install.
 * A field with an invalid value falls back to its default, except `listening`, which falls
 * back to off.
 */
export function parsePreferences(raw: string | null): { prefs: Preferences; source: PreferencesSource } {
  if (raw === null) return { prefs: DEFAULT_PREFERENCES, source: 'fresh' };

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { prefs: RECOVERED_PREFERENCES, source: 'recovered' };
  }
  if (typeof data !== 'object' || data === null || (data as { v?: unknown }).v !== VERSION) {
    return { prefs: RECOVERED_PREFERENCES, source: 'recovered' };
  }

  const d = data as Record<string, unknown>;
  const prefs: Preferences = {
    theme: THEMES.includes(d.theme as ThemeMode) ? (d.theme as ThemeMode) : DEFAULT_PREFERENCES.theme,
    viz: d.viz === null || VIZ.includes(d.viz as VizChoice) ? (d.viz as VizChoice | null) : DEFAULT_PREFERENCES.viz,
    listening: d.listening === true,
    hapticAlerts: d.hapticAlerts === true,
  };
  const clean =
    prefs.theme === d.theme &&
    prefs.viz === d.viz &&
    typeof d.listening === 'boolean' &&
    typeof d.hapticAlerts === 'boolean';
  return { prefs, source: clean ? 'stored' : 'recovered' };
}

/** The one local storage facility (AsyncStorage in the app, a Map in tests). */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

/** Give up on a hung read after this long and treat storage as unreadable. */
export const HYDRATE_TIMEOUT_MS = 1500;

/**
 * In-memory preferences backed by one JSON entry. Reads come from memory; every change is
 * written in order (last write wins). A failed write keeps the in-memory value for this run.
 */
export class PreferencesStore {
  private readonly kv: KeyValueStore;
  private readonly listeners = new Set<() => void>();
  private prefs: Preferences = DEFAULT_PREFERENCES;
  private writes: Promise<void> = Promise.resolve();

  constructor(kv: KeyValueStore) {
    this.kv = kv;
  }

  async hydrate(timeoutMs = HYDRATE_TIMEOUT_MS): Promise<PreferencesSource> {
    let raw: string | null;
    try {
      raw = await withTimeout(this.kv.getItem(PREFERENCES_KEY), timeoutMs);
    } catch {
      this.set(RECOVERED_PREFERENCES);
      return 'recovered';
    }
    const { prefs, source } = parsePreferences(raw);
    this.set(prefs);
    return source;
  }

  get = (): Preferences => this.prefs;

  subscribe = (listener: () => void): Unsubscribe => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  update(patch: Partial<Preferences>): void {
    this.set({ ...this.prefs, ...patch });
    const json = serializePreferences(this.prefs);
    this.writes = this.writes.then(() => this.kv.setItem(PREFERENCES_KEY, json)).catch(() => {});
  }

  /** Resolves once every write issued so far has finished (or failed). */
  flush(): Promise<void> {
    return this.writes;
  }

  private set(prefs: Preferences): void {
    this.prefs = prefs;
    for (const listener of this.listeners) listener();
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Preferences read timed out')), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
