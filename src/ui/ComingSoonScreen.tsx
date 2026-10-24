import { StyleSheet, Text, View } from 'react-native';

import { Icon } from './Icon';
import type { IconName } from './icons';
import { RADIUS, SPACE, TYPE, usePalette } from './theme';

export function ComingSoonScreen({ title, icon, blurb, topInset }: { title: string; icon: IconName; blurb: string; topInset: number }) {
  const c = usePalette();
  return (
    <View style={[styles.wrap, { backgroundColor: c.bg, paddingTop: topInset + SPACE.md }]}>
      <Text style={[styles.title, { color: c.text }]} accessibilityRole="header">
        {title}
      </Text>
      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <View style={[styles.well, { backgroundColor: c.iconWell }]}>
          <Icon name={icon} color={c.art} size={36} weight={1.6} />
        </View>
        <View style={[styles.badge, { borderColor: c.art }]}>
          <Text style={[styles.badgeText, { color: c.art }]}>Coming soon</Text>
        </View>
        <Text style={[styles.blurb, { color: c.subtext }]}>{blurb}</Text>
        <Text style={[styles.note, { color: c.subtext }]}>Not available in this prototype yet.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: SPACE.lg, gap: SPACE.lg },
  title: TYPE.display,
  card: { borderWidth: 1, borderRadius: RADIUS.lg, paddingVertical: SPACE.xxl, paddingHorizontal: SPACE.xl, alignItems: 'center', gap: SPACE.md },
  well: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  badge: { borderWidth: 1, borderRadius: RADIUS.pill, paddingHorizontal: SPACE.md, paddingVertical: SPACE.xs },
  badgeText: TYPE.eyebrow,
  blurb: { ...TYPE.body, textAlign: 'center' },
  note: { ...TYPE.caption, fontWeight: '500', textAlign: 'center' },
});
