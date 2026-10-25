import Constants from 'expo-constants';
import type { ReactNode } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { openPublicPage } from '../app/publicLinks';
import { PRE_RELEASE, PRIVACY_POLICY_URL, SUPPORT_URL } from '../app/release';
import { useSession } from '../app/SessionProvider';
import { Diagnostics } from './Diagnostics';
import { Icon } from './Icon';
import type { IconName } from './icons';
import { MicStatus } from './MicStatus';
import { Segmented } from './Segmented';
import { RADIUS, SPACE, TOUCH, TOUCH_MIN, TYPE, usePalette, useSetThemeMode, type ThemeMode } from './theme';

function Group({ title, icon, children }: { title: string; icon: IconName; children: ReactNode }) {
  const c = usePalette();
  return (
    <View style={styles.group}>
      <View style={styles.groupHead}>
        <Icon name={icon} color={c.art} size={16} weight={2.2} />
        <Text style={[styles.groupTitle, { color: c.subtext }]} accessibilityRole="header">
          {title}
        </Text>
      </View>
      <View style={[styles.groupCard, { backgroundColor: c.card, borderColor: c.border }]}>{children}</View>
    </View>
  );
}

const APP_VERSION = Constants.expoConfig?.version ?? null;

/** Opens a public page; never throws, and says so in plain words when the page cannot open. */
async function openPage(title: string, url: string | null) {
  const result = await openPublicPage(url, (u) => Linking.openURL(u));
  if (result === 'unavailable') {
    Alert.alert(title, `The AUVIONA ${title.toLowerCase()} page is not published yet.`);
  } else if (result === 'failed') {
    Alert.alert(title, `This page could not be opened here. You can visit it in a browser at ${url}`);
  }
}

function PageLink({ title, hint, url }: { title: string; hint: string; url: string | null }) {
  const c = usePalette();
  return (
    <Pressable
      onPress={() => void openPage(title, url)}
      accessibilityRole="link"
      accessibilityLabel={title}
      accessibilityHint={hint}
      style={({ pressed }) => [styles.linkButton, styles.pageLink, { borderColor: c.border, opacity: pressed ? 0.6 : 1 }]}
    >
      <Text style={[styles.pageLinkText, { color: c.primary }]}>{title}</Text>
      <Text style={[styles.pageLinkText, { color: c.primary }]} importantForAccessibility="no" accessibilityElementsHidden>
        ↗
      </Text>
    </Pressable>
  );
}

/** Secondary screen over Live. Back returns to the same running session and artwork. */
export function SettingsScreen({ onBack }: { onBack: () => void }) {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const setThemeMode = useSetThemeMode();
  const { snapshot, busy, listeningOn, toggleListening, hapticsAvailable, hapticAlerts, setHapticAlerts } = useSession();
  // While a start is in flight the button offers Stop, so a pending start can be cancelled.
  const disabled = busy && !listeningOn;

  return (
    <ScrollView
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + SPACE.sm, paddingBottom: insets.bottom + SPACE.xl },
      ]}
    >
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back to Live"
          hitSlop={6}
          style={({ pressed }) => [styles.back, { backgroundColor: pressed ? c.iconWell : 'transparent' }]}
        >
          <Icon name="back" color={c.primary} size={22} weight={2.2} />
          <Text style={[styles.backText, { color: c.primary }]}>Live</Text>
        </Pressable>
        <Text style={[styles.title, { color: c.text }]} accessibilityRole="header">
          Settings
        </Text>
      </View>

      <Group title="Listening" icon="mic">
        <MicStatus snapshot={snapshot} busy={busy} />
        <Pressable
          onPress={toggleListening}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={listeningOn ? 'Stop listening' : 'Start listening'}
          accessibilityHint={
            listeningOn
              ? 'Turns the microphone off until you start listening again'
              : 'Turns the microphone on and analyses sound on this device'
          }
          accessibilityState={{ busy, disabled }}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: listeningOn ? c.danger : c.primary, opacity: disabled ? 0.6 : pressed ? 0.8 : 1 },
          ]}
        >
          <Text style={[styles.buttonText, { color: listeningOn ? c.onDanger : c.onPrimary }]}>
            {disabled ? 'Please wait…' : listeningOn ? 'Stop listening' : 'Start listening'}
          </Text>
        </Pressable>
        <Text style={[styles.hint, { color: c.subtext }]}>
          {listeningOn
            ? 'Listening is on. It pauses whenever you leave AUVIONA and resumes when you come back.'
            : 'Listening is off. It stays off, even after you leave or restart AUVIONA, until you start it again.'}
        </Text>
        {snapshot.permission === 'denied' && (
          <View style={[styles.notice, { backgroundColor: c.noticeBg }]} accessibilityRole="alert">
            <Text style={[styles.noticeText, { color: c.noticeText }]}>
              Microphone access is turned off for AUVIONA. It needs the microphone to hear sounds, and
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
        {hapticsAvailable && (
          <View style={styles.switchRow}>
            <View style={styles.switchTexts}>
              <Text style={[styles.switchLabel, { color: c.text }]} importantForAccessibility="no" accessibilityElementsHidden>
                Haptic alerts
              </Text>
              <Text style={[styles.hint, { color: c.subtext }]} importantForAccessibility="no" accessibilityElementsHidden>
                A short vibration when a supported sound is confirmed. Not an alarm: vibrations can be missed or
                muted by the system, and the on-screen labels stay the main signal.
              </Text>
            </View>
            <Switch
              value={hapticAlerts}
              onValueChange={setHapticAlerts}
              accessibilityLabel="Haptic alerts"
              accessibilityHint="Vibrates briefly when a supported sound is confirmed. Not an alarm."
              trackColor={{ false: c.border, true: c.primary }}
              ios_backgroundColor={c.border}
            />
          </View>
        )}
      </Group>

      <Group title="Appearance" icon="appearance">
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

      <Group title="About" icon="about">
        {PRE_RELEASE && (
          <Text style={[styles.about, { color: c.text }]}>
            This build of AUVIONA is an experimental prototype for testing.
          </Text>
        )}
        <Text style={[styles.about, { color: c.subtext }]}>
          AUVIONA turns the sounds around you into labels, icons and live artwork, for art and general sound
          awareness. It can miss or mislabel sounds and is not reliable for emergencies, alarms, safety-critical
          decisions, navigation or medical decisions.
        </Text>
        <Text style={[styles.about, { color: c.subtext }]}>
          Sound is analysed on this device while listening is on. Audio is held in memory only long enough to be
          analysed; it is never recorded, saved or uploaded. The sound list is kept in memory and cleared when
          listening starts again. Your settings are stored on this device only.
        </Text>
        <Text style={[styles.about, { color: c.subtext }]}>
          The microphone is used only while AUVIONA is open. When listening is on, it resumes when you return to
          the app; when you stop it, it stays off until you start it again.
        </Text>
        <PageLink title="Privacy Policy" hint="Opens the AUVIONA privacy policy in your browser" url={PRIVACY_POLICY_URL} />
        <PageLink title="Support" hint="Opens AUVIONA help and contact details in your browser" url={SUPPORT_URL} />
        {APP_VERSION !== null && (
          <Text style={[styles.hint, { color: c.subtext }]}>Version {APP_VERSION}</Text>
        )}
      </Group>

      {/* Development builds only: release builds show just Listening, Appearance and About. */}
      {__DEV__ && (
        <Group title="Developer" icon="diagnostics">
          <Diagnostics snapshot={snapshot} />
        </Group>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: SPACE.lg, paddingBottom: SPACE.xl, gap: SPACE.xl },
  header: { gap: SPACE.xs },
  back: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: TOUCH_MIN,
    paddingRight: SPACE.md,
    paddingLeft: SPACE.xs,
    marginLeft: -SPACE.sm,
    borderRadius: RADIUS.pill,
  },
  backText: { fontSize: 17, fontWeight: '600' },
  title: TYPE.display,
  group: { gap: SPACE.sm },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm - 2, paddingHorizontal: SPACE.xs },
  groupTitle: TYPE.eyebrow,
  groupCard: { borderWidth: 1, borderRadius: RADIUS.lg, padding: SPACE.lg, gap: SPACE.md },
  notice: { padding: SPACE.md, borderRadius: RADIUS.md, gap: SPACE.sm },
  noticeText: TYPE.callout,
  button: {
    minHeight: 60,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  buttonText: { fontSize: 20, fontWeight: '800' },
  linkButton: {
    minHeight: TOUCH,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  hint: { fontSize: 14, lineHeight: 20 },
  about: { ...TYPE.callout },
  pageLink: { flexDirection: 'row', justifyContent: 'space-between' },
  pageLinkText: { fontSize: 16, fontWeight: '700' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: TOUCH_MIN },
  switchTexts: { flex: 1, gap: 2 },
  switchLabel: { fontSize: 16, fontWeight: '600' },
});
