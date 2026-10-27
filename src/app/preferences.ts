import type { Unsubscribe } from '../core/types';
import type { ThemeMode } from '../ui/theme';

/**
 * Everything AUVIONA remembers between launches. No audio, sound labels or history.
 * Motion is not a preference: it always follows the device's Reduce Motion setting.
 */
export interface Preferences {
  theme: ThemeMode;
  /** The user's listening intent, not whether the microphone is on right now. */
  listening: boolean;
  hapticAlerts: boolean;
}

/** A clean first install: Dark, listen automatically, haptics off. */
export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'dark',
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

/** fresh = nothing stored; stored = read cleanly; recovered = unreadable, fell back to RECOVERED_PREFERENCES rules. */
export type PreferencesSource = 'fresh' | 'stored' | 'recovered';

export function serializePreferences(p: Preferences): string {
  return JSON.stringify({ v: VERSION, ...p });
}

/**
 * Deterministic and total: never throws. Only a missing key counts as a first install.
 * A field with an invalid value falls back to its default, except `listening`, which falls
 * back to off. The obsolete `viz` field (REQ-004..008 Motion setting) is ignored, whatever its
 * value, and dropped on the next write; the version stays 1 so no other choice is lost.
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
    listening: d.listening === true,
    hapticAlerts: d.hapticAlerts === true,
  };
  const clean =
    prefs.theme === d.theme &&
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
 * Whether the in-memory preferences are durably stored. `saving`: a write is in flight or will be
 * retried; `failed`: the latest preferences are not stored and no attempt is pending (or the
 * storage stopped answering). Only `saved` means the next launch will see them.
 */
export type SaveState = 'saved' | 'saving' | 'failed';

export interface SaveOptions {
  /** Waits before the 2nd, 3rd, ... attempt of the latest preferences; its length bounds the retries. */
  retryDelaysMs?: readonly number[];
  /** A write that has not answered after this long is reported as failed (it is not abandoned). */
  writeTimeoutMs?: number;
}

export const SAVE_RETRY_DELAYS_MS: readonly number[] = [400, 1600];
export const WRITE_TIMEOUT_MS = 3000;

/**
 * In-memory preferences backed by one JSON entry. Reads come from memory and a change applies
 * there at once, whatever storage does. Writes are serialized and always carry the latest
 * preferences: a write still waiting never runs once a newer change exists, so an old value can
 * never overwrite a newer Stop. A failed write is retried a bounded number of times; after that
 * `saveState` is `failed` until the next change or retrySave().
 *
 * Restart rule: the next launch trusts only what is stored. A stored Stop is
 * authoritative; unreadable or partially written data recovers with listening off. If every write
 * fails, the next launch still sees the last stored value, which the UI says plainly.
 */
export class PreferencesStore {
  private readonly kv: KeyValueStore;
  private readonly retryDelaysMs: readonly number[];
  private readonly writeTimeoutMs: number;
  private readonly listeners = new Set<() => void>();
  private prefs: Preferences = DEFAULT_PREFERENCES;
  private saveState: SaveState = 'saved';
  /** The listening intent the next launch will read, as far as storage last confirmed. */
  private launchListening = DEFAULT_PREFERENCES.listening;
  /** Bumped by every change; `stored` is the newest revision known to be on disk. */
  private revision = 0;
  private stored = 0;
  private writing = false;
  private failures = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private idleWaiters: Array<() => void> = [];

  constructor(kv: KeyValueStore, options: SaveOptions = {}) {
    this.kv = kv;
    this.retryDelaysMs = options.retryDelaysMs ?? SAVE_RETRY_DELAYS_MS;
    this.writeTimeoutMs = options.writeTimeoutMs ?? WRITE_TIMEOUT_MS;
  }

  async hydrate(timeoutMs = HYDRATE_TIMEOUT_MS): Promise<PreferencesSource> {
    let raw: string | null;
    try {
      raw = await withTimeout(this.kv.getItem(PREFERENCES_KEY), timeoutMs);
    } catch {
      this.launchListening = RECOVERED_PREFERENCES.listening;
      this.set(RECOVERED_PREFERENCES);
      return 'recovered';
    }
    const { prefs, source } = parsePreferences(raw);
    this.launchListening = prefs.listening;
    this.set(prefs);
    return source;
  }

  get = (): Preferences => this.prefs;

  getSaveState = (): SaveState => this.saveState;

  /** Whether the next launch would start listening, given what storage has confirmed so far. */
  getLaunchListening = (): boolean => this.launchListening;

  subscribe = (listener: () => void): Unsubscribe => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  update(patch: Partial<Preferences>): void {
    this.revision++;
    this.failures = 0;
    this.set({ ...this.prefs, ...patch });
    this.pump();
  }

  /** Tries again to store the latest preferences. A write storage has not answered yet is waited for. */
  retrySave(): void {
    if (this.stored === this.revision) return;
    this.failures = 0;
    this.pump();
  }

  /** Resolves once no write is in flight or scheduled (the latest is stored, or saving gave up). */
  flush(): Promise<void> {
    if (!this.busy()) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  private busy(): boolean {
    return this.writing || this.retryTimer !== null;
  }

  private pump(): void {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.writing) return; // the write in flight is followed by the latest one
    if (this.stored === this.revision) {
      this.setSaveState('saved');
      this.notifyIdle();
      return;
    }

    const revision = this.revision;
    const { listening } = this.prefs;
    const json = serializePreferences(this.prefs);
    this.writing = true;
    this.setSaveState('saving');
    // A hung write is reported, but never raced by a second one: storage applies writes in order.
    const timer = setTimeout(() => this.setSaveState('failed'), this.writeTimeoutMs);

    let write: Promise<void>;
    try {
      write = this.kv.setItem(PREFERENCES_KEY, json);
    } catch (e) {
      write = Promise.reject(e);
    }
    write.then(
      () => this.written(timer, revision, listening),
      () => this.written(timer, revision, null),
    );
  }

  /** `listening` is the stored intent after a successful write, null after a failed one. */
  private written(timer: ReturnType<typeof setTimeout>, revision: number, listening: boolean | null): void {
    clearTimeout(timer);
    this.writing = false;
    if (listening !== null) {
      this.stored = Math.max(this.stored, revision);
      this.launchListening = listening;
      this.failures = 0;
      return this.pump(); // writes a newer change if one is waiting, otherwise reports saved
    }
    // A newer change arrived meanwhile: that is a first attempt of its own, not a retry.
    if (revision < this.revision) return this.pump();

    this.failures++;
    const delay = this.retryDelaysMs[this.failures - 1];
    if (delay === undefined) {
      this.setSaveState('failed');
      this.notifyIdle();
      return;
    }
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.pump();
    }, delay);
  }

  private notifyIdle(): void {
    if (this.busy()) return;
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    for (const resolve of waiters) resolve();
  }

  private setSaveState(state: SaveState): void {
    if (state === this.saveState) return;
    this.saveState = state;
    for (const listener of this.listeners) listener();
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
