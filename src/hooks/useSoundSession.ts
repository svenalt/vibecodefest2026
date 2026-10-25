import { useEffect, useRef, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { isForegroundAppState, ListeningController } from '../core/listeningController';
import { SoundSession } from '../core/soundSession';
import type { AudioFeatures } from '../core/types';
import { createSoundInput } from '../native/createSoundInput';

/**
 * Owns the single SoundSession for the app and ties capture to the foreground. Listening
 * resumes on launch or return only while the user's persisted intent is on (REQ-008 P0-C).
 */
export function useSoundSession(initialListening: boolean, persistListening: (on: boolean) => void) {
  const sessionRef = useRef<SoundSession | null>(null);
  if (sessionRef.current === null) sessionRef.current = new SoundSession(createSoundInput());
  const session = sessionRef.current;

  const persistRef = useRef(persistListening);
  persistRef.current = persistListening;
  const controllerRef = useRef<ListeningController | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = new ListeningController(session, {
      desired: initialListening,
      persist: (on) => persistRef.current(on),
    });
  }
  const controller = controllerRef.current;

  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const intent = useSyncExternalStore(controller.subscribe, controller.getState);

  // Latest features for the visualization. A ref, so 20 Hz updates never re-render React.
  const featuresRef = useRef<AudioFeatures | null>(null);
  const getFeatures = useRef(() => featuresRef.current).current;

  useEffect(() => session.onFeatures((f) => (featuresRef.current = f)), [session]);

  const listening = snapshot.capture.status === 'listening' && snapshot.error === null;
  useEffect(() => {
    if (!listening) featuresRef.current = null;
  }, [listening]);

  // Foreground-only: leaving the app (or an inactive system sheet) and unmounting release the
  // microphone without touching the user's intent. Only `active` counts, at launch too.
  useEffect(() => {
    controller.setForeground(isForegroundAppState(AppState.currentState));
    const sub = AppState.addEventListener('change', (state) => controller.setForeground(isForegroundAppState(state)));
    return () => {
      sub.remove();
      controller.setForeground(false);
    };
  }, [controller]);

  return { session, controller, snapshot, intent, getFeatures };
}
