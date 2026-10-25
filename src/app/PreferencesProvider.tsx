import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { AppState, View } from 'react-native';

import { primeReduceMotion } from '../hooks/useReduceMotion';
import { deviceKeyValueStore } from '../native/keyValueStore';
import { PreferencesStore, type Preferences, type SaveState } from './preferences';

interface PreferencesValue {
  prefs: Preferences;
  update: (patch: Partial<Preferences>) => void;
  /** Whether `prefs` are stored for the next launch (REQ-011 P1-C). */
  save: SaveState;
  /** The listening intent the next launch would read from storage. */
  launchListening: boolean;
  retrySave: () => void;
}

const PreferencesContext = createContext<PreferencesValue | null>(null);

/** Matches the Dark theme background, shown for the few ms before preferences are read. */
const HYDRATING_BG = '#0B1120';

/**
 * Reads the stored preferences (and the device's Reduce Motion setting) once, before anything
 * else renders, so there is no wrong-theme flash, no animation burst and no auto-start before
 * the user's listening choice is known.
 */
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<PreferencesStore | null>(null);
  if (storeRef.current === null) storeRef.current = new PreferencesStore(deviceKeyValueStore);
  const store = storeRef.current;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([store.hydrate(), primeReduceMotion()]).then(() => !cancelled && setReady(true));
    return () => {
      cancelled = true;
    };
  }, [store]);

  // Leaving the app is the last good moment to store a choice that could not be saved yet.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' && store.getSaveState() === 'failed') store.retrySave();
    });
    return () => sub.remove();
  }, [store]);

  const prefs = useSyncExternalStore(store.subscribe, store.get);
  const save = useSyncExternalStore(store.subscribe, store.getSaveState);
  const launchListening = useSyncExternalStore(store.subscribe, store.getLaunchListening);
  const value = useMemo<PreferencesValue>(
    () => ({
      prefs,
      update: (patch) => store.update(patch),
      save,
      launchListening,
      retrySave: () => store.retrySave(),
    }),
    [prefs, save, launchListening, store],
  );

  if (!ready) return <View style={{ flex: 1, backgroundColor: HYDRATING_BG }} />;
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesValue {
  const v = useContext(PreferencesContext);
  if (!v) throw new Error('usePreferences must be used inside PreferencesProvider');
  return v;
}
