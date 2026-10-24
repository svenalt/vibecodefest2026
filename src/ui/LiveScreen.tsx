import { Linking, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { useSession } from '../app/SessionProvider';
import { SoundCanvasView } from '../viz/SoundCanvasView';
import { motifForCurrent } from '../viz/vizModel';
import { CurrentSound } from './CurrentSound';
import { MicStatus } from './MicStatus';
import { Timeline } from './Timeline';
import { TOUCH, usePalette } from './theme';

export function LiveScreen({ active, topInset }: { active: boolean; topInset: number }) {
  const c = usePalette();
  const { snapshot, getFeatures, busy, effectiveViz } = useSession();
  const { height: windowHeight } = useWindowDimensions();
  const { current } = snapshot.tracker;
  const listening = snapshot.capture.status === 'listening';
  const vizHeight = Math.round(Math.min(440, Math.max(260, windowHeight * 0.42)));

  return (
    <ScrollView
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={[styles.content, { paddingTop: topInset + 12 }]}
    >
      <View style={styles.headerRow}>
        <View style={styles.brand}>
          <Text style={[styles.title, { color: c.text }]} accessibilityRole="header">
            SONORA
          </Text>
          <Text style={[styles.tagline, { color: c.art }]}>Visualize Your Surroundings</Text>
        </View>
        <MicStatus snapshot={snapshot} busy={busy} />
      </View>

      {effectiveViz !== 'off' && (
        <SoundCanvasView
          motif={motifForCurrent(current)}
          mode={effectiveViz === 'reduced' ? 'reduced' : 'animated'}
          height={vizHeight}
          getFeatures={getFeatures}
          paused={!active}
        />
      )}

      <CurrentSound listening={listening} current={current} lastPrediction={snapshot.tracker.lastPrediction} />

      {snapshot.permission === 'denied' && (
        <View style={[styles.notice, { backgroundColor: c.noticeBg }]} accessibilityRole="alert">
          <Text style={[styles.noticeText, { color: c.noticeText }]}>
            Microphone access is turned off for SONORA. Nothing is recorded or uploaded.
          </Text>
          <Pressable
            onPress={() => void Linking.openSettings()}
            accessibilityRole="button"
            accessibilityLabel="Open system settings"
            style={[styles.linkButton, { borderColor: c.noticeText }]}
          >
            <Text style={{ color: c.noticeText, fontSize: 16, fontWeight: '700' }}>Open system settings</Text>
          </Pressable>
        </View>
      )}

      {snapshot.error !== null && (
        <View style={[styles.notice, { backgroundColor: c.errorBg }]} accessibilityRole="alert">
          <Text style={[styles.noticeText, { color: c.errorText }]}>Problem: {snapshot.error}</Text>
        </View>
      )}

      {!listening && snapshot.permission !== 'denied' && (
        <Text style={[styles.hint, { color: c.subtext }]}>Start or stop listening in the Settings tab.</Text>
      )}

      <Timeline events={snapshot.tracker.events} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingBottom: 24, gap: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  brand: { gap: 0 },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: 4 },
  tagline: { fontSize: 15, fontWeight: '600' },
  notice: { padding: 12, borderRadius: 12, gap: 8 },
  noticeText: { fontSize: 15, lineHeight: 21 },
  linkButton: {
    minHeight: TOUCH,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  hint: { fontSize: 14, lineHeight: 20 },
});
