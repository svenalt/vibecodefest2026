import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AccessibilityInfo } from 'react-native';

import type { SessionSnapshot, SoundSession } from '../core/soundSession';
import type { AudioFeatures } from '../core/types';
import { CATEGORY_DISPLAY } from '../core/yamnet/taxonomy';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { useSoundSession } from '../hooks/useSoundSession';

export type VizChoice = 'animated' | 'reduced' | 'off';

interface SessionValue {
  session: SoundSession;
  snapshot: SessionSnapshot;
  getFeatures: () => AudioFeatures | null;
  /** True while a start/stop command is in flight (including the permission prompt). */
  busy: boolean;
  toggleListening: () => void;
  vizChoice: VizChoice | null;
  setVizChoice: (v: VizChoice) => void;
  effectiveViz: VizChoice;
  deviceReducesMotion: boolean;
}

const SessionContext = createContext<SessionValue | null>(null);

/** The single app-level owner of the sound session; lives above every tab. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const { session, snapshot, getFeatures } = useSoundSession();
  const deviceReducesMotion = useReduceMotion();
  const [vizChoice, setVizChoice] = useState<VizChoice | null>(null); // null = follow the device
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);

  const status = snapshot.capture.status;
  const listening = status === 'listening';
  const busy = pending || status === 'starting' || status === 'stopping';
  const { current } = snapshot.tracker;

  const toggleListening = useCallback(() => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    const run = session.getSnapshot().capture.status === 'listening' ? session.stop() : session.start();
    void run.finally(() => {
      pendingRef.current = false;
      setPending(false);
    });
  }, [session]);

  // Announce confirmed sound changes to screen readers, whichever tab is showing.
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

  const effectiveViz: VizChoice = vizChoice ?? (deviceReducesMotion ? 'reduced' : 'animated');

  const value = useMemo<SessionValue>(
    () => ({
      session,
      snapshot,
      getFeatures,
      busy,
      toggleListening,
      vizChoice,
      setVizChoice,
      effectiveViz,
      deviceReducesMotion,
    }),
    [session, snapshot, getFeatures, busy, toggleListening, vizChoice, effectiveViz, deviceReducesMotion],
  );
  return createElement(SessionContext.Provider, { value }, children);
}

export function useSession(): SessionValue {
  const v = useContext(SessionContext);
  if (!v) throw new Error('useSession must be used inside SessionProvider');
  return v;
}
