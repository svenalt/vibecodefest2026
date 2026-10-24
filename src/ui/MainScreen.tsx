import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useReduceMotion } from '../hooks/useReduceMotion';
import { useSoundSession } from '../hooks/useSoundSession';
import { CATEGORY_DISPLAY } from '../core/yamnet/taxonomy';
import { SoundCanvasView } from '../viz/SoundCanvasView';
import { motifForCurrent } from '../viz/vizModel';
import { CurrentSound } from './CurrentSound';
import { Diagnostics } from './Diagnostics';
import { Segmented } from './Segmented';
import { Timeline } from './Timeline';
import { TOUCH, useSetThemeMode, usePalette, type ThemeMode } from './theme';

type VizChoice = 'animated' | 'reduced' | 'off';

export function MainScreen() {
  const c = usePalette();
  const setThemeMode = useSetThemeMode();
  const insets = useSafeAreaInsets();
  const { session, snapshot, getFeatures } = useSoundSession();
  const deviceReducesMotion = useReduceMotion();

  const [vizChoice, setVizChoice] = useState<VizChoice | null>(null); // null = follow the device
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const status = snapshot.capture.status;
  const listening = status === 'listening';
  const busy = status === 'starting' || status === 'stopping';
  const { current } = snapshot.tracker;
  const effectiveViz: VizChoice = vizChoice ?? (deviceReducesMotion ? 'reduced' : 'animated');

  // Announce confirmed sound changes to screen readers (VoiceOver / TalkBack).
  const announced = useRef<string>('');
  useEffect(() => {
    if (!listening) {
      announced.current = '';
      return;
    }
    const key = current.kind === 'event' ? current.category : current.kind;
    if (key === announced.current) return;
    announced.current = key;
    if (current.kind === 'event') {
      AccessibilityInfo.announceForAccessibility(`Sound detected: ${CATEGORY_DISPLAY[current.category]}`);
    }
  }, [listening, current]);

  const onToggle = () => {
    void (listening ? session.stop() : session.start());
  };

  return (
    <ScrollView
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 },
      ]}
    >
      <View style={styles.brand}>
        <Text style={[styles.title, { color: c.text }]} accessibilityRole="header">
          SONORA
        </Text>
        <Text style={[styles.tagline, { color: c.art }]}>Visualize Your Surroundings</Text>
      </View>
      <View
        style={[styles.notice, { backgroundColor: c.noticeBg }]}
        accessible
        accessibilityLabel="Experimental. Not a safety, emergency, navigation or medical alert system."
      >
        <Text style={[styles.noticeText, { color: c.noticeText }]}>
          Experimental prototype. Do not rely on it for safety, emergency, navigation or medical decisions.
        </Text>
      </View>

      {effectiveViz !== 'off' && (
        <SoundCanvasView
          motif={motifForCurrent(current)}
          mode={effectiveViz === 'reduced' ? 'reduced' : 'animated'}
          height={220}
          getFeatures={getFeatures}
        />
      )}

      <CurrentSound listening={listening} current={current} lastPrediction={snapshot.tracker.lastPrediction} />

      <View style={styles.controlWrap}>
        <Pressable
          onPress={onToggle}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={listening ? 'Stop listening' : 'Start listening'}
          accessibilityHint={
            listening ? 'Turns the microphone off' : 'Turns the microphone on and analyses sound on this device'
          }
          accessibilityState={{ busy, disabled: busy }}
          style={[
            styles.button,
            { backgroundColor: listening ? c.danger : c.primary, opacity: busy ? 0.6 : 1 },
          ]}
        >
          <Text style={[styles.buttonText, { color: listening ? c.onDanger : c.onPrimary }]}>
            {listening ? 'Stop listening' : busy ? 'Please wait…' : 'Start listening'}
          </Text>
        </Pressable>

        <View
          accessible
          accessibilityLiveRegion="polite"
          accessibilityLabel={listening ? 'Microphone is on' : 'Microphone is off'}
          style={styles.indicator}
        >
          <Text style={{ color: listening ? c.live : c.subtext, fontSize: 16, fontWeight: '600' }}>
            {listening ? '● Microphone is ON. Analysing on this device.' : '○ Microphone is off.'}
          </Text>
        </View>
      </View>

      {snapshot.permission === 'denied' && (
        <View style={[styles.notice, { backgroundColor: c.noticeBg }]} accessibilityRole="alert">
          <Text style={[styles.noticeText, { color: c.noticeText }]}>
            Microphone access is turned off for SONORA. It needs the microphone to hear sounds, and
            nothing is recorded or uploaded. You can allow it in Settings.
          </Text>
          <Pressable
            onPress={() => void Linking.openSettings()}
            accessibilityRole="button"
            accessibilityLabel="Open Settings"
            style={[styles.linkButton, { borderColor: c.noticeText }]}
          >
            <Text style={{ color: c.noticeText, fontSize: 16, fontWeight: '700' }}>Open Settings</Text>
          </Pressable>
        </View>
      )}

      {snapshot.error !== null && (
        <View style={[styles.notice, { backgroundColor: c.errorBg }]} accessibilityRole="alert">
          <Text style={[styles.noticeText, { color: c.errorText }]}>Problem: {snapshot.error}</Text>
        </View>
      )}

      <Timeline events={snapshot.tracker.events} />

      <Segmented<ThemeMode>
        label="Appearance"
        value={c.mode}
        options={[
          { value: 'dark', label: 'Dark' },
          { value: 'light', label: 'Light' },
        ]}
        onChange={setThemeMode}
      />

      <Segmented<VizChoice>
        label="Visualization"
        value={effectiveViz}
        options={[
          { value: 'animated', label: 'Animated' },
          { value: 'reduced', label: 'Reduced' },
          { value: 'off', label: 'Off' },
        ]}
        onChange={setVizChoice}
      />
      {deviceReducesMotion && vizChoice === null && (
        <Text style={[styles.hint, { color: c.subtext }]}>
          Reduce Motion is on for this device, so the visualization starts in Reduced mode.
        </Text>
      )}

      <Pressable
        onPress={() => setShowDiagnostics((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={showDiagnostics ? 'Hide diagnostics' : 'Show diagnostics'}
        accessibilityState={{ expanded: showDiagnostics }}
        style={[styles.linkButton, { borderColor: c.border }]}
      >
        <Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }}>
          {showDiagnostics ? 'Hide diagnostics' : 'Show diagnostics'}
        </Text>
      </Pressable>
      {showDiagnostics && <Diagnostics snapshot={snapshot} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, gap: 16 },
  brand: { gap: 2 },
  title: { fontSize: 32, fontWeight: '800', letterSpacing: 4 },
  tagline: { fontSize: 16, fontWeight: '600' },
  notice: { padding: 12, borderRadius: 12, gap: 8 },
  noticeText: { fontSize: 15, lineHeight: 21 },
  controlWrap: { gap: 10 },
  button: {
    minHeight: 64,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  buttonText: { fontSize: 22, fontWeight: '800' },
  indicator: { minHeight: 28, justifyContent: 'center' },
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
