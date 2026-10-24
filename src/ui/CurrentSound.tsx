import { StyleSheet, Text, View } from 'react-native';

import type { Current } from '../core/eventTracker';
import type { SoundPrediction } from '../core/types';
import { CATEGORY_DISPLAY } from '../core/yamnet/taxonomy';
import { formatScore } from './format';
import { CATEGORY_ICON } from './icons';
import { usePalette } from './theme';

interface Props {
  listening: boolean;
  current: Current;
  lastPrediction: SoundPrediction | null;
}

/** The "what is the phone hearing now" card. Text and icon only; no dependence on colour or motion. */
export function CurrentSound({ listening, current, lastPrediction }: Props) {
  const c = usePalette();

  let icon = '🎙️';
  let title = 'Not listening';
  let detail = 'Start listening in the Settings tab to begin.';
  if (listening) {
    if (current.kind === 'event') {
      icon = CATEGORY_ICON[current.category];
      title = CATEGORY_DISPLAY[current.category];
      detail = `Model label: ${current.rawLabel}. Raw score ${formatScore(current.score)} (not a probability).`;
    } else if (current.kind === 'silence') {
      icon = CATEGORY_ICON.silence;
      title = CATEGORY_DISPLAY.silence;
      detail = 'The model hears very little right now.';
    } else {
      icon = CATEGORY_ICON.unknown;
      title = CATEGORY_DISPLAY.unknown;
      detail = lastPrediction
        ? 'Listening. Nothing matched one of the supported sounds with enough confidence.'
        : 'Listening. Waiting for the first result, which takes about a second.';
    }
  }

  return (
    <View
      style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={`Current sound: ${title}. ${detail}`}
      accessibilityLiveRegion="polite"
    >
      <Text style={styles.icon} accessibilityElementsHidden importantForAccessibility="no">
        {icon}
      </Text>
      <View style={styles.texts}>
        <Text style={[styles.title, { color: c.text }]}>{title}</Text>
        <Text style={[styles.detail, { color: c.subtext }]}>{detail}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  icon: { fontSize: 44 },
  texts: { flex: 1, gap: 4 },
  title: { fontSize: 26, fontWeight: '700' },
  detail: { fontSize: 15, lineHeight: 21 },
});
