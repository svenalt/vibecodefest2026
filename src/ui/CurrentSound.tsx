import { StyleSheet, Text, View } from 'react-native';

import type { Current } from '../core/eventTracker';
import { Icon } from './Icon';
import { CATEGORY_ICON } from './icons';
import { MIC_ICON } from './MicStatus';
import { soundSummary, type MicKind } from './status';
import { RADIUS, SPACE, TYPE, usePalette } from './theme';

interface Props {
  mic: MicKind;
  current: Current;
  hasPrediction: boolean;
}

/**
 * The "what is the phone hearing now" tile. Text and icon carry everything; colour only
 * reinforces it. Raw model labels and scores stay in Diagnostics.
 */
export function CurrentSound({ mic, current, hasPrediction }: Props) {
  const c = usePalette();
  const s = soundSummary(mic, current, hasPrediction);
  const icon = s.category ? CATEGORY_ICON[s.category] : MIC_ICON[mic];

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
      accessibilityLabel={`Current sound: ${s.title}. ${s.detail}.`}
      accessibilityLiveRegion="polite"
    >
      <View style={[styles.well, { backgroundColor: s.tone === 'alert' ? 'transparent' : c.iconWell }]}>
        <Icon name={icon} color={iconColor} size={28} />
      </View>
      <View style={styles.texts}>
        <Text style={[styles.title, { color: titleColor }]}>{s.title}</Text>
        <Text style={[styles.detail, { color: detailColor }]}>{s.detail}</Text>
      </View>
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
});
