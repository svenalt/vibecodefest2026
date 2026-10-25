import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { SessionSnapshot } from '../core/soundSession';
import { Icon } from './Icon';
import { CATEGORY_ICON } from './icons';
import { MIC_ICON } from './MicStatus';
import { captionKey, micState, soundSummary, type SoundSummary } from './status';
import { RADIUS, SPACE, TOUCH_MIN, TYPE, usePalette } from './theme';

export type Presentation = 'art' | 'sounds';

const CAPTION_HOLD_MS = 3000;

interface Props {
  snapshot: SessionSnapshot;
  busy: boolean;
  presentation: Presentation;
  onPresentationChange: (p: Presentation) => void;
  onExit: () => void;
  /** Skip caption fades (device Reduce Motion or Reduced visualization). */
  reduceMotion: boolean;
}

/**
 * Controls drawn over the full-screen artwork. Everything sits on an opaque-enough scrim inside
 * the safe area. Exit is always visible, never hidden behind a gesture. Microphone status lives
 * in Settings; only a blocked permission or a capture error is surfaced here, so neither fails silently.
 */
export function ImmersiveOverlay({ snapshot, busy, presentation, onPresentationChange, onExit, reduceMotion }: Props) {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const mic = micState(snapshot, busy);
  const { current, lastPrediction } = snapshot.tracker;
  const side = Math.max(insets.left, insets.right, SPACE.lg);

  // Captions: shown for a real newly confirmed category, then faded. Never for silence or unknown.
  const [caption, setCaption] = useState<SoundSummary | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showCaption = useCallback(
    (s: SoundSummary) => {
      if (timer.current) clearTimeout(timer.current);
      opacity.stopAnimation();
      setCaption(s);
      const hide = () => setCaption(null);
      if (reduceMotion) {
        opacity.setValue(1);
        timer.current = setTimeout(hide, CAPTION_HOLD_MS);
        return;
      }
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      timer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 600, useNativeDriver: true }).start(({ finished }) => {
          if (finished) hide();
        });
      }, CAPTION_HOLD_MS);
    },
    [opacity, reduceMotion],
  );
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const key = captionKey(mic.kind === 'on', current);
  const prevKey = useRef(key);
  useEffect(() => {
    const prev = prevKey.current;
    prevKey.current = key; // tracked in Pure Art too, so switching modes never replays an old detection
    if (presentation === 'sounds' && key !== null && key !== prev) showCaption(soundSummary('on', current, true));
  }, [key, presentation, current, showCaption]);

  useEffect(() => {
    if (presentation === 'art') setCaption(null);
  }, [presentation]);

  // A detection caption must not outlive the microphone.
  useEffect(() => {
    if (mic.kind !== 'on') setCaption((cap) => (cap?.tone === 'event' ? null : cap));
  }, [mic.kind]);

  const now = soundSummary(mic.kind, current, lastPrediction !== null);
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
        {presentation === 'sounds' &&
          (caption ? (
            <Animated.View
              style={[styles.caption, scrim, { opacity }]}
              accessible
              accessibilityLabel={`${caption.title}. ${caption.detail}.`}
            >
              <Icon
                name={caption.category ? CATEGORY_ICON[caption.category] : MIC_ICON[mic.kind]}
                color={caption.tone === 'event' ? c.primary : c.onScrim}
                size={26}
                weight={2}
              />
              <View style={styles.captionTexts}>
                <Text style={[styles.captionTitle, { color: c.onScrim }]}>{caption.title}</Text>
                <Text style={[styles.captionDetail, { color: c.scrimSubtext }]}>{caption.detail}</Text>
              </View>
            </Animated.View>
          ) : (
            <Pressable
              onPress={() => showCaption(now)}
              accessibilityRole="button"
              accessibilityLabel={`Current sound: ${now.title}`}
              accessibilityHint="Shows it as a caption for a few seconds"
              style={({ pressed }) => [styles.chip, scrim, pressed && { backgroundColor: c.iconWell }]}
            >
              <Icon name="sounds" color={c.onScrim} size={18} weight={2} />
              <Text style={[styles.chipText, { color: c.onScrim }]}>Current sound</Text>
            </Pressable>
          ))}

        <View style={[styles.modes, scrim]} accessibilityRole="radiogroup" accessibilityLabel="Presentation">
          {(
            [
              { value: 'art', label: 'Pure Art', hint: 'Artwork with minimal controls' },
              { value: 'sounds', label: 'Art + Sounds', hint: 'Shows a caption when a sound is detected' },
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
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    minHeight: TOUCH_MIN,
    borderWidth: 1,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACE.lg,
  },
  chipText: { ...TYPE.callout, fontWeight: '700' },
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
