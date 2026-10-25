import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/** expo-haptics has no web implementation; elsewhere the OS may still mute it (system setting, Low Power). */
export const HAPTICS_SUPPORTED = Platform.OS === 'ios' || Platform.OS === 'android';

/** One brief, modest tap for a confirmed sound event. Failures are ignored: text stays the primary channel. */
export function playEventHaptic(): void {
  if (!HAPTICS_SUPPORTED) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}
