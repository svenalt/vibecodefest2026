import { useEffect, useRef, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { SoundSession } from '../core/soundSession';
import type { AudioFeatures } from '../core/types';
import { createSoundInput } from '../native/createSoundInput';

/** Owns the single SoundSession for the app and ties capture to the foreground. */
export function useSoundSession() {
  const sessionRef = useRef<SoundSession | null>(null);
  if (sessionRef.current === null) sessionRef.current = new SoundSession(createSoundInput());
  const session = sessionRef.current;

  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);

  // Latest features for the visualization. A ref, so 20 Hz updates never re-render React.
  const featuresRef = useRef<AudioFeatures | null>(null);
  const getFeatures = useRef(() => featuresRef.current).current;

  useEffect(() => session.onFeatures((f) => (featuresRef.current = f)), [session]);

  const listening = snapshot.capture.status === 'listening';
  useEffect(() => {
    if (!listening) featuresRef.current = null;
  }, [listening]);

  useEffect(() => {
    void session.refreshPermission();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void session.refreshPermission();
      else void session.stop(); // foreground-only: release the microphone when leaving the app
    });
    return () => {
      sub.remove();
      void session.stop(); // unmount releases capture
    };
  }, [session]);

  return { session, snapshot, getFeatures };
}
