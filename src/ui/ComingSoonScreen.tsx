import { StyleSheet, Text, View } from 'react-native';

import { usePalette } from './theme';

export function ComingSoonScreen({ title, icon, blurb, topInset }: { title: string; icon: string; blurb: string; topInset: number }) {
  const c = usePalette();
  return (
    <View style={[styles.wrap, { backgroundColor: c.bg, paddingTop: topInset + 12 }]}>
      <Text style={[styles.title, { color: c.text }]} accessibilityRole="header">
        {title}
      </Text>
      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={styles.icon} accessibilityElementsHidden importantForAccessibility="no">
          {icon}
        </Text>
        <Text style={[styles.soon, { color: c.art }]}>Coming soon</Text>
        <Text style={[styles.blurb, { color: c.subtext }]}>{blurb}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 16, gap: 16 },
  title: { fontSize: 28, fontWeight: '800' },
  card: { borderWidth: 1, borderRadius: 16, padding: 24, alignItems: 'center', gap: 10 },
  icon: { fontSize: 48 },
  soon: { fontSize: 22, fontWeight: '700' },
  blurb: { fontSize: 16, lineHeight: 23, textAlign: 'center' },
});
