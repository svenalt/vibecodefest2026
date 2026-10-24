import { useState, type ReactNode } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useSession, type VizChoice } from '../app/SessionProvider';
import { Diagnostics } from './Diagnostics';
import { MicStatus } from './MicStatus';
import { Segmented } from './Segmented';
import { TOUCH, usePalette, useSetThemeMode, type ThemeMode } from './theme';

function Group({ title, children }: { title: string; children: ReactNode }) {
  const c = usePalette();
  return (
    <View style={styles.group}>
      <Text style={[styles.groupTitle, { color: c.text }]} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

export function SettingsScreen({ topInset }: { topInset: number }) {
  const c = usePalette();
  const setThemeMode = useSetThemeMode();
  const { snapshot, busy, toggleListening, vizChoice, setVizChoice, effectiveViz, deviceReducesMotion } =
    useSession();
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const listening = snapshot.capture.status === 'listening';

  return (
    <ScrollView
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={[styles.content, { paddingTop: topInset + 12 }]}
    >
      <Text style={[styles.title, { color: c.text }]} accessibilityRole="header">
        Settings
      </Text>

      <Group title="Listening">
        <MicStatus snapshot={snapshot} busy={busy} />
        <Pressable
          onPress={toggleListening}
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
            {busy ? 'Please wait…' : listening ? 'Stop listening' : 'Start listening'}
          </Text>
        </Pressable>
        {snapshot.permission === 'denied' && (
          <View style={[styles.notice, { backgroundColor: c.noticeBg }]} accessibilityRole="alert">
            <Text style={[styles.noticeText, { color: c.noticeText }]}>
              Microphone access is turned off for SONORA. It needs the microphone to hear sounds, and
              nothing is recorded or uploaded. You can allow it in system settings.
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
      </Group>

      <Group title="Appearance">
        <Segmented<ThemeMode>
          label="Theme"
          value={c.mode}
          options={[
            { value: 'dark', label: 'Dark' },
            { value: 'light', label: 'Light' },
          ]}
          onChange={setThemeMode}
        />
      </Group>

      <Group title="Visualization">
        <Segmented<VizChoice>
          label="Motion"
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
      </Group>

      <Group title="Diagnostics">
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
      </Group>

      <Group title="About">
        <Text style={[styles.about, { color: c.subtext }]}>
          SONORA is an experimental prototype. It is not reliable for safety, emergencies, navigation or
          medical decisions. Sound is analysed on this device while the microphone is on; no audio is
          recorded, stored or uploaded. Listening starts when you open the app and stops when you leave it.
        </Text>
      </Group>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingBottom: 24, gap: 24 },
  title: { fontSize: 28, fontWeight: '800' },
  group: { gap: 10 },
  groupTitle: { fontSize: 20, fontWeight: '700' },
  notice: { padding: 12, borderRadius: 12, gap: 8 },
  noticeText: { fontSize: 15, lineHeight: 21 },
  button: {
    minHeight: 60,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  buttonText: { fontSize: 20, fontWeight: '800' },
  linkButton: {
    minHeight: TOUCH,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  hint: { fontSize: 14, lineHeight: 20 },
  about: { fontSize: 14, lineHeight: 21 },
});
