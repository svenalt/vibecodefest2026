import { StyleSheet, Text, View } from 'react-native';

import type { SessionSnapshot } from '../core/soundSession';
import { usePalette } from './theme';

export function micLabel(snapshot: SessionSnapshot, busy: boolean): string {
  const { status } = snapshot.capture;
  if (status === 'listening') return 'Microphone ON';
  if (status === 'error' || snapshot.error !== null) return 'Microphone error';
  if (snapshot.permission === 'denied') return 'Microphone blocked';
  if (status === 'stopping') return 'Microphone stopping…';
  if (status === 'starting' || busy) return 'Microphone starting…';
  return 'Microphone OFF';
}

/** Always-readable microphone state: text and glyph, never colour alone. */
export function MicStatus({ snapshot, busy }: { snapshot: SessionSnapshot; busy: boolean }) {
  const c = usePalette();
  const label = micLabel(snapshot, busy);
  const on = snapshot.capture.status === 'listening';
  const bad = label === 'Microphone error' || label === 'Microphone blocked';
  const color = on ? c.live : bad ? c.errorText : c.subtext;
  return (
    <View
      style={[styles.pill, { borderColor: color, backgroundColor: c.card }]}
      accessible
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
      accessibilityLabel={label}
    >
      <Text style={[styles.text, { color }]}>
        {on ? '●' : bad ? '▲' : '○'} {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  text: { fontSize: 15, fontWeight: '700' },
});
