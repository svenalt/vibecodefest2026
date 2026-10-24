import { StyleSheet, Text, View } from 'react-native';

import type { TimelineEvent } from '../core/eventTracker';
import { CATEGORY_DISPLAY } from '../core/yamnet/taxonomy';
import { formatScore, formatSessionTime } from './format';
import { CATEGORY_ICON } from './icons';
import { usePalette } from './theme';

export function Timeline({ events }: { events: readonly TimelineEvent[] }) {
  const c = usePalette();
  return (
    <View style={styles.wrap}>
      <Text style={[styles.heading, { color: c.text }]} accessibilityRole="header">
        Recent sounds this session
      </Text>
      {events.length === 0 ? (
        <Text style={[styles.empty, { color: c.subtext }]}>
          Nothing recognized yet. This list is kept in memory only and clears when you start a new session.
        </Text>
      ) : (
        events.map((e) => (
          <View
            key={e.id}
            style={[styles.row, { backgroundColor: c.card, borderColor: c.border }]}
            accessible
            accessibilityLabel={`${CATEGORY_DISPLAY[e.category]} at ${formatSessionTime(e.timestampMs)} into the session`}
          >
            <Text style={styles.rowIcon} accessibilityElementsHidden importantForAccessibility="no">
              {CATEGORY_ICON[e.category]}
            </Text>
            <Text style={[styles.rowLabel, { color: c.text }]}>{CATEGORY_DISPLAY[e.category]}</Text>
            <Text style={[styles.rowMeta, { color: c.subtext }]}>
              {formatSessionTime(e.timestampMs)} · {formatScore(e.score)}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  heading: { fontSize: 18, fontWeight: '700' },
  empty: { fontSize: 15, lineHeight: 21 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  rowIcon: { fontSize: 24 },
  rowLabel: { flex: 1, fontSize: 17, fontWeight: '600' },
  rowMeta: { fontSize: 14, fontVariant: ['tabular-nums'] },
});
