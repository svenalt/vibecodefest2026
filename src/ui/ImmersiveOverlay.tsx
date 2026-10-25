import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { SessionSnapshot } from '../core/soundSession';
import { Icon } from './Icon';
import { CATEGORY_ICON } from './icons';
import { MIC_ICON } from './MicStatus';
import { immersiveCard, micState, type Presentation } from './status';
import { RADIUS, SPACE, TOUCH_MIN, TYPE, usePalette } from './theme';

export type { Presentation } from './status';

interface Props {
  snapshot: SessionSnapshot;
  busy: boolean;
  presentation: Presentation;
  onPresentationChange: (p: Presentation) => void;
  onExit: () => void;
}

/**
 * Controls drawn over the full-screen artwork. Everything sits on an opaque-enough scrim inside
 * the safe area. Exit is always visible, never hidden behind a gesture. A blocked permission or a
 * capture error is surfaced at the top in both presentations, so neither fails silently.
 */
export function ImmersiveOverlay({ snapshot, busy, presentation, onPresentationChange, onExit }: Props) {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const mic = micState(snapshot, busy);
  const { current, lastPrediction } = snapshot.tracker;
  const side = Math.max(insets.left, insets.right, SPACE.lg);

  // Art + Sounds: a persistent card that updates in place, with no timer, tap or fade.
  // Confirmed sound changes are announced to screen readers by SessionProvider.
  const card = immersiveCard(presentation, mic.kind, current, lastPrediction !== null);
  const scrim = { backgroundColor: c.scrim, borderColor: c.scrimBorder };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View style={[styles.top, { top: insets.top + SPACE.sm, left: side, right: side }]} pointerEvents="box-none">
        <View style={styles.topRow} pointerEvents="box-none">
          <Pressable
            onPress={onExit}
            accessibilityRole="button"
            accessibilityLabel="Exit immersive mode"
            hitSlop={6}
            style={({ pressed }) => [styles.round, scrim, pressed && { backgroundColor: c.iconWell }]}
          >
            <Icon name="collapse" color={c.onScrim} size={22} weight={2} />
          </Pressable>
        </View>

        {mic.kind === 'blocked' && (
          <View style={[styles.notice, { backgroundColor: c.noticeBg }]} accessibilityRole="alert">
            <Text style={[styles.noticeText, { color: c.noticeText }]}>
              Microphone access is turned off for AUVIONA, so the artwork cannot hear anything. Nothing is recorded
              or uploaded.
            </Text>
            <Pressable
              onPress={() => void Linking.openSettings()}
              accessibilityRole="button"
              accessibilityLabel="Open system settings"
              style={({ pressed }) => [styles.action, { borderColor: c.noticeText, opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={[styles.actionText, { color: c.noticeText }]}>Open system settings</Text>
            </Pressable>
          </View>
        )}
        {mic.kind === 'error' && (
          <View style={[styles.notice, { backgroundColor: c.errorBg }]} accessibilityRole="alert">
            <Text style={[styles.noticeText, { color: c.errorText }]}>
              Problem: {snapshot.error ?? snapshot.capture.error ?? 'the microphone stopped'}
            </Text>
            <Text style={[styles.noticeText, { color: c.errorText }]}>
              Exit, then use Settings to start listening again.
            </Text>
          </View>
        )}
      </View>

      <View
        style={[styles.bottom, { bottom: insets.bottom + SPACE.md, left: side, right: side }]}
        pointerEvents="box-none"
      >
        {card && (
          <View
            style={[styles.caption, scrim]}
            accessible
            accessibilityRole="summary"
            accessibilityLabel={`Current sound: ${card.title}. ${card.detail}.`}
          >
            <Icon
              name={card.category ? CATEGORY_ICON[card.category] : MIC_ICON[mic.kind]}
              color={card.tone === 'event' ? c.primary : c.onScrim}
              size={26}
              weight={2}
            />
            <View style={styles.captionTexts}>
              <Text style={[styles.captionTitle, { color: c.onScrim }]}>{card.title}</Text>
              <Text style={[styles.captionDetail, { color: c.scrimSubtext }]}>{card.detail}</Text>
            </View>
          </View>
        )}

        <View style={[styles.modes, scrim]} accessibilityRole="radiogroup" accessibilityLabel="Presentation">
          {(
            [
              { value: 'art', label: 'Pure Art', hint: 'Artwork with minimal controls' },
              { value: 'sounds', label: 'Art + Sounds', hint: 'Shows the current sound over the artwork' },
            ] as const
          ).map((o) => {
            const selected = presentation === o.value;
            return (
              <Pressable
                key={o.value}
                onPress={() => onPresentationChange(o.value)}
                accessibilityRole="radio"
                accessibilityLabel={o.label}
                accessibilityHint={o.hint}
                accessibilityState={{ selected, checked: selected }}
                style={({ pressed }) => [
                  styles.mode,
                  { backgroundColor: selected ? c.primary : pressed ? c.iconWell : 'transparent' },
                ]}
              >
                <Text
                  style={[styles.modeText, { color: selected ? c.onPrimary : c.onScrim, fontWeight: selected ? '800' : '600' }]}
                >
                  {o.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

/** The expand control on the Live artwork card. */
export function EnterImmersiveButton({ onPress }: { onPress: () => void }) {
  const c = usePalette();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Enter immersive mode"
      accessibilityHint="Shows the artwork full screen"
      hitSlop={6}
      style={({ pressed }) => [
        styles.round,
        styles.enter,
        { backgroundColor: pressed ? c.iconWell : c.scrim, borderColor: c.scrimBorder },
      ]}
    >
      <Icon name="expand" color={c.onScrim} size={20} weight={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', gap: SPACE.sm },
  topRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  round: {
    width: TOUCH_MIN + 4,
    height: TOUCH_MIN + 4,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  enter: { position: 'absolute', top: SPACE.md, right: SPACE.md },
  notice: { padding: SPACE.md, borderRadius: RADIUS.md, gap: SPACE.sm },
  noticeText: TYPE.callout,
  action: {
    minHeight: TOUCH_MIN,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.lg,
  },
  actionText: { fontSize: 16, fontWeight: '700' },
  bottom: { position: 'absolute', alignItems: 'center', gap: SPACE.md },
  caption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    borderWidth: 1,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
    maxWidth: '100%',
  },
  captionTexts: { flexShrink: 1 },
  captionTitle: TYPE.title,
  captionDetail: TYPE.callout,
  modes: { flexDirection: 'row', borderWidth: 1, borderRadius: RADIUS.pill, padding: SPACE.xs, gap: SPACE.xs, maxWidth: '100%' },
  mode: {
    minHeight: TOUCH_MIN,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACE.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 1,
  },
  modeText: { fontSize: 15, textAlign: 'center' },
});
