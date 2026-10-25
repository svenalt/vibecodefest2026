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
import { View } from 'react-native';

import { deviceKeyValueStore } from '../native/keyValueStore';
import { PreferencesStore, type Preferences } from './preferences';

interface PreferencesValue {
  prefs: Preferences;
  update: (patch: Partial<Preferences>) => void;
}

const PreferencesContext = createContext<PreferencesValue | null>(null);

/** Matches the Dark theme background, shown for the few ms before preferences are read. */
const HYDRATING_BG = '#0B1120';

/**
 * Reads the stored preferences once, before anything else renders, so there is no wrong-theme
 * flash, no animation burst and no auto-start before the user's listening choice is known.
 */
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<PreferencesStore | null>(null);
  if (storeRef.current === null) storeRef.current = new PreferencesStore(deviceKeyValueStore);
  const store = storeRef.current;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void store.hydrate().then(() => !cancelled && setReady(true));
    return () => {
      cancelled = true;
    };
  }, [store]);

  const prefs = useSyncExternalStore(store.subscribe, store.get);
  const value = useMemo<PreferencesValue>(() => ({ prefs, update: (patch) => store.update(patch) }), [prefs, store]);

  if (!ready) return <View style={{ flex: 1, backgroundColor: HYDRATING_BG }} />;
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesValue {
  const v = useContext(PreferencesContext);
  if (!v) throw new Error('usePreferences must be used inside PreferencesProvider');
  return v;
}
