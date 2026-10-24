import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** Tracks the device's Reduce Motion preference. */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => !cancelled && setReduce(v));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);
  return reduce;
}
