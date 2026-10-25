import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { AccessibilityInfo } from 'react-native';

import type { SessionSnapshot, SoundSession } from '../core/soundSession';
import type { AudioFeatures } from '../core/types';
import { CATEGORY_DISPLAY } from '../core/yamnet/taxonomy';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { useSoundSession } from '../hooks/useSoundSession';
import { HAPTICS_SUPPORTED, playEventHaptic } from '../native/haptics';
import { HapticCueGate } from './hapticCue';
import type { VizChoice } from './preferences';
import { usePreferences } from './PreferencesProvider';
import { HAPTIC_ALERTS_AVAILABLE } from './release';

export type { VizChoice } from './preferences';

interface SessionValue {
  session: SoundSession;
  snapshot: SessionSnapshot;
  getFeatures: () => AudioFeatures | null;
  /** True while a start/stop is in flight (including the permission prompt). */
  busy: boolean;
  /** Listening is on or being turned on, so the control offers Stop. */
  listeningOn: boolean;
  toggleListening: () => void;
  vizChoice: VizChoice | null;
  setVizChoice: (v: VizChoice) => void;
  effectiveViz: VizChoice;
  deviceReducesMotion: boolean;
  /** Whether this build offers the opt-in haptic cue at all. */
  hapticsAvailable: boolean;
  hapticAlerts: boolean;
  setHapticAlerts: (on: boolean) => void;
}

const SessionContext = createContext<SessionValue | null>(null);

/** The single app-level owner of the sound session; lives above every screen. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const { prefs, update } = usePreferences();
  const persistListening = useCallback((listening: boolean) => update({ listening }), [update]);
  const { session, controller, snapshot, intent, getFeatures } = useSoundSession(prefs.listening, persistListening);
  const deviceReducesMotion = useReduceMotion();
  const vizChoice = prefs.viz; // null = follow the device

  const status = snapshot.capture.status;
  const listening = status === 'listening';
  const busy = intent.starting || status === 'starting' || status === 'stopping';
  const listeningOn = listening || (intent.starting && intent.desired);
  const { current } = snapshot.tracker;

  const toggleListening = useCallback(() => {
    if (listeningOn) controller.requestStop();
    else controller.requestStart();
  }, [controller, listeningOn]);

  // Announce confirmed sound changes to screen readers, whichever screen is showing.
  const announced = useRef<string>('');
  useEffect(() => {
    if (!listening) {
      announced.current = '';
      return;
    }
    const key = current.kind === 'event' ? current.category : current.kind;
    if (key === announced.current) return;
    announced.current = key;
    if (current.kind === 'event') {
      AccessibilityInfo.announceForAccessibility(`Sound detected: ${CATEGORY_DISPLAY[current.category]}`);
    }
  }, [listening, current]);

  // Opt-in haptic cue for each new confirmed timeline event (already smoothed and cooled down).
  const hapticsAvailable = HAPTIC_ALERTS_AVAILABLE && HAPTICS_SUPPORTED;
  const hapticAlerts = hapticsAvailable && prefs.hapticAlerts;
  const hapticGate = useRef(new HapticCueGate()).current;
  const latestEventId = snapshot.tracker.events[0]?.id ?? null;
  useEffect(() => {
    if (hapticGate.observe(latestEventId, hapticAlerts && listening, Date.now())) playEventHaptic();
  }, [hapticGate, latestEventId, hapticAlerts, listening]);

  const effectiveViz: VizChoice = vizChoice ?? (deviceReducesMotion ? 'reduced' : 'animated');
  const setVizChoice = useCallback((viz: VizChoice) => update({ viz }), [update]);
  const setHapticAlerts = useCallback((on: boolean) => update({ hapticAlerts: on }), [update]);

  const value = useMemo<SessionValue>(
    () => ({
      session,
      snapshot,
      getFeatures,
      busy,
      listeningOn,
      toggleListening,
      vizChoice,
      setVizChoice,
      effectiveViz,
      deviceReducesMotion,
      hapticsAvailable,
      hapticAlerts,
      setHapticAlerts,
    }),
    [
      session,
      snapshot,
      getFeatures,
      busy,
      listeningOn,
      toggleListening,
      vizChoice,
      setVizChoice,
      effectiveViz,
      deviceReducesMotion,
      hapticsAvailable,
      hapticAlerts,
      setHapticAlerts,
    ],
  );
  return createElement(SessionContext.Provider, { value }, children);
}

export function useSession(): SessionValue {
  const v = useContext(SessionContext);
  if (!v) throw new Error('useSession must be used inside SessionProvider');
  return v;
}
