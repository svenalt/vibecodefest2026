import { StyleSheet, Text, View } from 'react-native';

import type { Current } from '../core/eventTracker';
import { Icon } from './Icon';
import { SOUND_ICON } from './icons';
import { MIC_ICON } from './MicStatus';
import { soundSummary, summaryAccessibilityLabel, type AlsoSound, type MicKind } from './status';
import { RADIUS, SPACE, TYPE, usePalette } from './theme';

interface Props {
  mic: MicKind;
  current: Current;
  hasPrediction: boolean;
}

/**
 * The "what is the phone hearing now" tile: the primary sound as the title, other sounds
 * recognized at the same time as small labels below. Text and icon carry everything; colour only
 * reinforces it. Raw model labels and scores stay in Diagnostics.
 */
export function CurrentSound({ mic, current, hasPrediction }: Props) {
  const c = usePalette();
  const s = soundSummary(mic, current, hasPrediction);
  const icon = s.icon ? SOUND_ICON[s.icon] : MIC_ICON[mic];

  const surface =
    s.tone === 'alert'
      ? { backgroundColor: c.noticeBg, borderColor: c.noticeBg }
      : s.tone === 'off'
        ? { backgroundColor: c.cardMuted, borderColor: c.border }
        : { backgroundColor: c.card, borderColor: s.tone === 'event' ? c.primary : c.border };
  const titleColor = s.tone === 'alert' ? c.noticeText : c.text;
  const detailColor = s.tone === 'alert' ? c.noticeText : c.subtext;
  const iconColor = s.tone === 'event' ? c.primary : s.tone === 'calm' ? c.art : s.tone === 'alert' ? c.noticeText : c.subtext;

  return (
    <View
      style={[styles.tile, surface]}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={summaryAccessibilityLabel(s)}
      accessibilityLiveRegion="polite"
    >
      <View style={[styles.well, { backgroundColor: s.tone === 'alert' ? 'transparent' : c.iconWell }]}>
        <Icon name={icon} color={iconColor} size={28} />
      </View>
      <View style={styles.texts}>
        <Text style={[styles.title, { color: titleColor }]}>{s.title}</Text>
        <Text style={[styles.detail, { color: detailColor }]}>{s.detail}</Text>
        <AlsoSounds also={s.also} textColor={c.text} iconColor={c.art} borderColor={c.border} />
      </View>
    </View>
  );
}

/** Compact labels for the secondary sounds. Hidden from accessibility: the parent's label reads them. */
export function AlsoSounds({
  also,
  textColor,
  iconColor,
  borderColor,
}: {
  also: readonly AlsoSound[];
  textColor: string;
  iconColor: string;
  borderColor: string;
}) {
  if (also.length === 0) return null;
  return (
    <View style={styles.also} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {also.map((a) => (
        <View key={`${a.family}:${a.label}`} style={[styles.pill, { borderColor }]}>
          <Icon name={SOUND_ICON[a.family]} color={iconColor} size={16} weight={2} />
          <Text style={[styles.pillText, { color: textColor }]} numberOfLines={1}>
            {a.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md + 2,
    paddingVertical: SPACE.md + 2,
    paddingHorizontal: SPACE.lg,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
  },
  well: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1, gap: 2 },
  title: TYPE.title,
  detail: TYPE.callout,
  also: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.xs + 2, marginTop: SPACE.xs + 2 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
    borderWidth: 1,
    borderRadius: RADIUS.pill,
    paddingVertical: 3,
    paddingHorizontal: SPACE.sm + 2,
    maxWidth: '100%',
  },
  pillText: { ...TYPE.caption, flexShrink: 1 },
});
