import { StyleSheet, Text, View } from 'react-native';

import type { SessionSnapshot } from '../core/soundSession';
import { Icon } from './Icon';
import type { IconName } from './icons';
import { micState, type MicKind } from './status';
import { RADIUS, SPACE, TYPE, usePalette } from './theme';

export const MIC_ICON: Record<MicKind, IconName> = {
  on: 'mic',
  starting: 'mic',
  stopping: 'micOff',
  off: 'micOff',
  blocked: 'alert',
  error: 'alert',
};

/**
 * Always-readable microphone state: text plus a distinct icon shape, never colour alone.
 * `overlay` draws it on an opaque scrim so it stays legible over the artwork.
 */
export function MicStatus({
  snapshot,
  busy,
  variant = 'default',
}: {
  snapshot: SessionSnapshot;
  busy: boolean;
  variant?: 'default' | 'overlay';
}) {
  const c = usePalette();
  const { kind, label } = micState(snapshot, busy);
  const overlay = variant === 'overlay';
  const bad = kind === 'blocked' || kind === 'error';
  const fg = kind === 'on' ? c.live : bad ? c.errorText : overlay ? c.onScrim : c.subtext;
  return (
    <View
      style={[
        styles.pill,
        overlay
          ? { backgroundColor: bad ? c.errorBg : c.scrim, borderColor: c.scrimBorder }
          : { backgroundColor: c.card, borderColor: kind === 'on' ? c.live : c.border },
      ]}
      accessible
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
      accessibilityLabel={label}
    >
      {kind === 'on' && <View style={[styles.dot, { backgroundColor: c.live }]} />}
      <Icon name={MIC_ICON[kind]} color={fg} size={18} weight={2} />
      <Text style={[styles.text, { color: fg }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm - 2,
    borderWidth: 1,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm - 2,
    minHeight: 36,
    flexShrink: 1,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { ...TYPE.callout, fontWeight: '700', flexShrink: 1 },
});
