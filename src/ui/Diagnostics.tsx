import { StyleSheet, Text, View } from 'react-native';

import type { SessionSnapshot } from '../core/soundSession';
import { TAXONOMY_VERSION } from '../core/yamnet/taxonomy';
import { usePalette } from './theme';

const ms = (v: number | null) => (v === null ? 'n/a' : `${Math.round(v)} ms`);

/** Development diagnostics: technical state only, never audio or transcripts. */
export function Diagnostics({ snapshot }: { snapshot: SessionSnapshot }) {
  const c = usePalette();
  const { capture, diagnostics: d, permission, error } = snapshot;
  const last = d.lastPrediction;

  const rows: Array<[string, string]> = [
    ['Microphone permission', permission],
    ['Capture state', capture.status],
    [
      'Hardware format',
      capture.hardwareSampleRate === null
        ? 'n/a'
        : `${capture.hardwareSampleRate} Hz, ${capture.hardwareChannelCount} ch`,
    ],
    [
      'Analysis format',
      capture.analysisSampleRate === null
        ? 'n/a'
        : `${capture.analysisSampleRate} Hz, ${capture.analysisChannelCount} ch`,
    ],
    ['Model output classes', capture.modelClassCount === null ? 'n/a' : String(capture.modelClassCount)],
    ['Inferences', String(d.inferenceCount)],
    ['First result after start', ms(d.firstResultLatencyMs)],
    ['Last update interval', ms(d.lastIntervalMs)],
    ['Mean update interval', ms(d.meanIntervalMs)],
    [
      'Last prediction',
      last ? `${last.category} / "${last.rawLabel}" / ${last.score.toFixed(3)}` : 'n/a',
    ],
    ['Model / platform', last ? `${last.model} / ${last.platform}` : 'yamnet / n/a'],
    ['Taxonomy version', String(TAXONOMY_VERSION)],
    ['Error', error ?? capture.error ?? 'none'],
  ];

  return (
    <View style={[styles.box, { backgroundColor: c.card, borderColor: c.border }]}>
      {rows.map(([label, value]) => (
        <View key={label} style={styles.row} accessible accessibilityLabel={`${label}: ${value}`}>
          <Text style={[styles.label, { color: c.subtext }]}>{label}</Text>
          <Text style={[styles.value, { color: c.text }]}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  label: { fontSize: 14, flexShrink: 1 },
  value: { fontSize: 14, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
});
