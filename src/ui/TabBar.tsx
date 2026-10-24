import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from './Icon';
import type { IconName } from './icons';
import { RADIUS, SPACE, usePalette } from './theme';

export type TabKey = 'live' | 'walk' | 'gallery' | 'settings';

export const TABS: ReadonlyArray<{ key: TabKey; label: string; icon: IconName }> = [
  { key: 'live', label: 'Live', icon: 'live' },
  { key: 'walk', label: 'Sound Walk', icon: 'walk' },
  { key: 'gallery', label: 'Gallery', icon: 'gallery' },
  { key: 'settings', label: 'Settings', icon: 'settings' },
];

export function TabBar({ active, onChange }: { active: TabKey; onChange: (t: TabKey) => void }) {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.bar,
        { backgroundColor: c.card, borderTopColor: c.border, paddingBottom: Math.max(insets.bottom, SPACE.sm) },
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
            style={({ pressed }) => [styles.tab, { opacity: pressed ? 0.6 : 1 }]}
          >
            {/* Selection is shown by the filled pill and bold label, not by colour alone. */}
            <View style={[styles.pill, { backgroundColor: selected ? c.iconWell : 'transparent' }]}>
              <Icon name={t.icon} color={selected ? c.art : c.subtext} size={22} weight={selected ? 2.1 : 1.8} />
            </View>
            <Text
              style={[styles.label, { color: selected ? c.text : c.subtext, fontWeight: selected ? '800' : '600' }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
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
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: SPACE.sm - 2 },
  tab: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: 2 },
  pill: { width: 56, height: 30, borderRadius: RADIUS.pill, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 12 },
});
