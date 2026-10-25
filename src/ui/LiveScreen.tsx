import { useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ScrollViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSession } from '../app/SessionProvider';
import { SoundCanvasView } from '../viz/SoundCanvasView';
import { motifForCurrent } from '../viz/vizModel';
import { CurrentSound } from './CurrentSound';
import { Icon } from './Icon';
import { EnterImmersiveButton, ImmersiveOverlay, type Presentation } from './ImmersiveOverlay';
import { micState } from './status';
import { RADIUS, SPACE, TOUCH, TOUCH_MIN, TYPE, usePalette } from './theme';
import { Timeline } from './Timeline';

interface Props {
  active: boolean;
  immersive: boolean;
  onImmersiveChange: (immersive: boolean) => void;
  onOpenSettings: () => void;
}

/**
 * Live screen. Immersive mode reuses this same tree: the chrome around the artwork is removed and
 * the artwork's container grows to the whole screen, so the one canvas, its loop and its state
 * stay mounted throughout.
 */
export function LiveScreen({ active, immersive, onImmersiveChange, onOpenSettings }: Props) {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const { snapshot, getFeatures, busy, effectiveViz, deviceReducesMotion } = useSession();
  const { height: windowHeight } = useWindowDimensions();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const [presentation, setPresentation] = useState<Presentation>('art');
  const { current } = snapshot.tracker;
  const mic = micState(snapshot, busy);
  const vizOn = effectiveViz !== 'off';
  const vizHeight = Math.round(Math.min(440, Math.max(260, windowHeight * 0.42)));

  const setImmersive = (on: boolean) => {
    if (on) scrollRef.current?.scrollTo({ y: 0, animated: false });
    onImmersiveChange(on);
    AccessibilityInfo.announceForAccessibility(on ? 'Immersive mode' : 'Left immersive mode');
  };

  return (
    <ScrollView
      ref={scrollRef}
      style={{ backgroundColor: immersive ? c.vizBg[0] : c.bg }}
      contentContainerStyle={
        immersive
          ? styles.immersiveContent
          : [styles.content, { paddingTop: insets.top + SPACE.md, paddingBottom: insets.bottom + SPACE.xl }]
      }
      scrollEnabled={!immersive}
      bounces={!immersive}
      showsVerticalScrollIndicator={!immersive}
    >
      {!immersive && (
        <View style={styles.header}>
          <View style={styles.brand}>
            <Text style={[styles.title, { color: c.text }]} accessibilityRole="header" accessibilityLabel="Auviona">
              AUVIONA
            </Text>
            <Text style={[styles.tagline, { color: c.art }]}>Visualize Your Surroundings</Text>
          </View>
          <Pressable
            onPress={onOpenSettings}
            accessibilityRole="button"
            accessibilityLabel="Open settings"
            hitSlop={6}
            style={({ pressed }) => [
              styles.gear,
              { backgroundColor: pressed ? c.iconWell : c.card, borderColor: c.border },
            ]}
          >
            <Icon name="gear" color={c.text} size={24} />
          </Pressable>
        </View>
      )}

      {vizOn ? (
        <View style={immersive ? styles.fill : { height: vizHeight }}>
          <SoundCanvasView
            motif={motifForCurrent(current)}
            mode={effectiveViz === 'reduced' ? 'reduced' : 'animated'}
            rounded={!immersive}
            getFeatures={getFeatures}
            paused={!active}
          />
          {immersive ? (
            <ImmersiveOverlay
              snapshot={snapshot}
              busy={busy}
              presentation={presentation}
              onPresentationChange={setPresentation}
              onExit={() => setImmersive(false)}
              reduceMotion={deviceReducesMotion || effectiveViz === 'reduced'}
            />
          ) : (
            <EnterImmersiveButton onPress={() => setImmersive(true)} />
          )}
        </View>
      ) : (
        <View style={[styles.vizOff, { backgroundColor: c.cardMuted, borderColor: c.border }]}>
          <Text style={[styles.vizOffText, { color: c.subtext }]}>
            The artwork is turned off, so immersive mode is unavailable. You can turn it back on in Settings under
            Visualization.
          </Text>
        </View>
      )}

      {!immersive && <CurrentSound mic={mic.kind} current={current} hasPrediction={snapshot.tracker.lastPrediction !== null} />}

      {/* Listening is controlled in Settings; offer the way there whenever it is not running. */}
      {!immersive && (mic.kind === 'off' || mic.kind === 'error') && (
        <Pressable
          onPress={onOpenSettings}
          accessibilityRole="button"
          accessibilityLabel="Open settings to start listening"
          style={({ pressed }) => [styles.linkButton, { borderColor: c.border, opacity: pressed ? 0.6 : 1 }]}
        >
          <Icon name="gear" color={c.primary} size={20} weight={2} />
          <Text style={[styles.linkText, { color: c.primary }]}>Open Settings to start listening</Text>
        </Pressable>
      )}

      {!immersive && snapshot.permission === 'denied' && (
        <View style={[styles.notice, { backgroundColor: c.noticeBg }]} accessibilityRole="alert">
          <Text style={[styles.noticeText, { color: c.noticeText }]}>
            Microphone access is turned off for AUVIONA. Nothing is recorded or uploaded.
          </Text>
          <Pressable
            onPress={() => void Linking.openSettings()}
            accessibilityRole="button"
            accessibilityLabel="Open system settings"
            style={({ pressed }) => [styles.linkButton, { borderColor: c.noticeText, opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={{ color: c.noticeText, fontSize: 16, fontWeight: '700' }}>Open system settings</Text>
          </Pressable>
        </View>
      )}

      {!immersive && snapshot.error !== null && (
        <View style={[styles.notice, { backgroundColor: c.errorBg }]} accessibilityRole="alert">
          <Text style={[styles.noticeText, { color: c.errorText }]}>Problem: {snapshot.error}</Text>
        </View>
      )}

      {!immersive && <Timeline events={snapshot.tracker.events} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: SPACE.lg, gap: SPACE.lg },
  immersiveContent: { flexGrow: 1 },
  fill: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.md },
  brand: { flexShrink: 1 },
  gear: {
    width: TOUCH_MIN + 4,
    height: TOUCH_MIN + 4,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: 4 },
  tagline: { fontSize: 15, fontWeight: '600' },
  vizOff: { borderWidth: 1, borderRadius: RADIUS.lg, padding: SPACE.lg },
  vizOffText: TYPE.callout,
  notice: { padding: SPACE.md, borderRadius: RADIUS.md, gap: SPACE.sm },
  noticeText: TYPE.callout,
  linkButton: {
    minHeight: TOUCH,
    flexDirection: 'row',
    gap: SPACE.sm,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.lg,
  },
  linkText: { fontSize: 16, fontWeight: '700', flexShrink: 1 },
});
