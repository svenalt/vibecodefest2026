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
import { useReduceMotion } from '../hooks/useReduceMotion';
import { useSoundSession } from '../hooks/useSoundSession';
import { HAPTICS_SUPPORTED, playEventHaptic } from '../native/haptics';
import { vizModeFor, type VizMode } from '../viz/vizModel';
import { HapticCueGate } from './hapticCue';
import { SoundAnnouncer } from './soundAnnouncer';
import { usePreferences } from './PreferencesProvider';
import { HAPTIC_ALERTS_AVAILABLE } from './release';

interface SessionValue {
  session: SoundSession;
  snapshot: SessionSnapshot;
  getFeatures: () => AudioFeatures | null;
  /** True while a start/stop is in flight (including the permission prompt). */
  busy: boolean;
  /** Listening is on or being turned on, so the control offers Stop. */
  listeningOn: boolean;
  /** The user's intent, which stays on through a failure or interruption until they press Stop. */
  listeningDesired: boolean;
  toggleListening: () => void;
  /** Follows the device's Reduce Motion setting; there is no user-facing choice. */
  effectiveViz: VizMode;
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
  const effectiveViz = vizModeFor(useReduceMotion());

  const status = snapshot.capture.status;
  // A failed session is not listening, even while its capture is still being released.
  const listening = status === 'listening' && snapshot.error === null;
  const busy = intent.starting || intent.stopping || status === 'starting' || status === 'stopping';
  const listeningOn = listening || (intent.starting && intent.desired);
  const { current } = snapshot.tracker;

  const toggleListening = useCallback(() => {
    if (listeningOn) controller.requestStop();
    else controller.requestStart();
  }, [controller, listeningOn]);

  // Announce confirmed sound changes to screen readers, whichever screen is showing.
  const announcer = useRef(new SoundAnnouncer()).current;
  useEffect(() => {
    const text = announcer.observe(current, listening, Date.now());
    if (text) AccessibilityInfo.announceForAccessibility(text);
  }, [announcer, listening, current]);

  // Opt-in haptic cue for each new confirmed timeline event (already smoothed and cooled down).
  const hapticsAvailable = HAPTIC_ALERTS_AVAILABLE && HAPTICS_SUPPORTED;
  const hapticAlerts = hapticsAvailable && prefs.hapticAlerts;
  const hapticGate = useRef(new HapticCueGate()).current;
  const latestEventId = snapshot.tracker.events[0]?.id ?? null;
  useEffect(() => {
    if (hapticGate.observe(latestEventId, hapticAlerts && listening, Date.now())) playEventHaptic();
  }, [hapticGate, latestEventId, hapticAlerts, listening]);

  const setHapticAlerts = useCallback((on: boolean) => update({ hapticAlerts: on }), [update]);

  const value = useMemo<SessionValue>(
    () => ({
      session,
      snapshot,
      getFeatures,
      busy,
      listeningOn,
      listeningDesired: intent.desired,
      toggleListening,
      effectiveViz,
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
      intent.desired,
      toggleListening,
      effectiveViz,
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
