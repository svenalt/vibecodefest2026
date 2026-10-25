import { useEffect, useState } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';

/** The last value the device reported, so later mounts start with it instead of guessing. */
let lastKnown: boolean | null = null;

/**
 * Reads the device's Reduce Motion setting once before the first screen renders, so the
 * artwork starts in the right mode with no animated flash. Never throws or hangs: after
 * `timeoutMs` the hook falls back to animated and corrects itself when the read lands.
 */
export function primeReduceMotion(timeoutMs = 500): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        lastKnown = v;
      })
      .catch(() => {})
      .finally(() => {
        clearTimeout(timer);
        resolve();
      });
  });
}

/** Tracks the device's Reduce Motion preference, including changes made while AUVIONA was in the background. */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(() => lastKnown ?? false);
  useEffect(() => {
    let cancelled = false;
    const apply = (v: boolean) => {
      lastKnown = v;
      if (!cancelled) setReduce(v);
    };
    const refresh = () => {
      AccessibilityInfo.isReduceMotionEnabled().then(apply, () => {});
    };
    refresh();
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', apply);
    const app = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    return () => {
      cancelled = true;
      sub.remove();
      app.remove();
    };
  }, []);
  return reduce;
}
