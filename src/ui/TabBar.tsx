import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePalette } from './theme';

export type TabKey = 'live' | 'walk' | 'gallery' | 'settings';

export const TABS: ReadonlyArray<{ key: TabKey; label: string; icon: string }> = [
  { key: 'live', label: 'Live', icon: '◉' },
  { key: 'walk', label: 'Sound Walk', icon: '🚶' },
  { key: 'gallery', label: 'Gallery', icon: '🖼️' },
  { key: 'settings', label: 'Settings', icon: '⚙️' },
];

export function TabBar({ active, onChange }: { active: TabKey; onChange: (t: TabKey) => void }) {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.bar,
        { backgroundColor: c.card, borderTopColor: c.border, paddingBottom: Math.max(insets.bottom, 8) },
      ]}
    >
      {TABS.map((t) => {
        const selected = t.key === active;
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            accessibilityRole="tab"
            accessibilityLabel={t.label}
            accessibilityState={{ selected }}
            style={styles.tab}
          >
            <View style={[styles.indicator, { backgroundColor: selected ? c.primary : 'transparent' }]} />
            <Text style={[styles.icon, { opacity: selected ? 1 : 0.65 }]} accessibilityElementsHidden importantForAccessibility="no">
              {t.icon}
            </Text>
            <Text
              style={{ color: selected ? c.text : c.subtext, fontSize: 12, fontWeight: selected ? '800' : '600' }}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 4 },
  tab: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 2 },
  indicator: { height: 3, width: 28, borderRadius: 2, marginBottom: 2 },
  icon: { fontSize: 20 },
});
