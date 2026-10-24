import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { TimelineEvent } from '../core/eventTracker';
import { CATEGORY_DISPLAY } from '../core/yamnet/taxonomy';
import { formatSessionTime } from './format';
import { Icon } from './Icon';
import { CATEGORY_ICON } from './icons';
import { RADIUS, SPACE, TOUCH_MIN, TYPE, usePalette } from './theme';

/** How many recent sounds Live shows before "Show all". */
export const RECENT_PREVIEW = 3;

/** Session history, newest first. Shows the latest few; the full in-memory list is one tap away. */
export function Timeline({ events }: { events: readonly TimelineEvent[] }) {
  const c = usePalette();
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? events : events.slice(0, RECENT_PREVIEW);
  const hidden = events.length - RECENT_PREVIEW;

  return (
    <View style={styles.wrap}>
      <View style={styles.headRow}>
        <Text style={[styles.heading, { color: c.text }]} accessibilityRole="header">
          Recent sounds
        </Text>
        {hidden > 0 && (
          <Pressable
            onPress={() => setExpanded((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={expanded ? 'Show fewer recent sounds' : `Show all ${events.length} recent sounds`}
            accessibilityState={{ expanded }}
            hitSlop={8}
            style={({ pressed }) => [styles.more, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[styles.moreText, { color: c.primary }]}>
              {expanded ? 'Show fewer' : `Show all ${events.length}`}
            </Text>
          </Pressable>
        )}
      </View>
      {events.length === 0 ? (
        <Text style={[styles.empty, { color: c.subtext }]}>
          Sounds you hear will collect here. Kept in memory for this session only.
        </Text>
      ) : (
        <View style={[styles.list, { backgroundColor: c.card, borderColor: c.border }]}>
          {shown.map((e, i) => (
            <View
              key={e.id}
              style={[styles.row, i > 0 && { borderTopColor: c.border, borderTopWidth: StyleSheet.hairlineWidth }]}
              accessible
              accessibilityLabel={`${CATEGORY_DISPLAY[e.category]} at ${formatSessionTime(e.timestampMs)} into the session`}
            >
              <View style={[styles.well, { backgroundColor: c.iconWell }]}>
                <Icon name={CATEGORY_ICON[e.category]} color={c.art} size={20} />
              </View>
              <Text style={[styles.rowLabel, { color: c.text }]}>{CATEGORY_DISPLAY[e.category]}</Text>
              <Text style={[styles.rowMeta, { color: c.subtext }]}>{formatSessionTime(e.timestampMs)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: SPACE.sm },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.sm, flexWrap: 'wrap' },
  heading: TYPE.headline,
  more: { minHeight: TOUCH_MIN, justifyContent: 'center' },
  moreText: { ...TYPE.callout, fontWeight: '700' },
  empty: TYPE.callout,
  list: { borderRadius: RADIUS.md, borderWidth: 1, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    minHeight: 52,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
  },
  well: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, ...TYPE.body, fontWeight: '600' },
  rowMeta: { ...TYPE.callout, fontVariant: ['tabular-nums'] },
});
