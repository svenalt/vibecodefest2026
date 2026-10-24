import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TOUCH, usePalette } from './theme';

interface Props<T extends string> {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
}

/** Accessible single-choice control; selection is conveyed by state and a check mark, not colour alone. */
export function Segmented<T extends string>({ label, value, options, onChange }: Props<T>) {
  const c = usePalette();
  return (
    <View style={styles.wrap} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <Text style={[styles.label, { color: c.text }]}>{label}</Text>
      <View style={styles.row}>
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <Pressable
              key={o.value}
              onPress={() => onChange(o.value)}
              accessibilityRole="radio"
              accessibilityLabel={o.label}
              accessibilityState={{ selected, checked: selected }}
              style={[
                styles.option,
                {
                  backgroundColor: selected ? c.primary : c.card,
                  borderColor: selected ? c.primary : c.border,
                },
              ]}
            >
              <Text style={{ color: selected ? c.onPrimary : c.text, fontSize: 16, fontWeight: '600' }}>
                {selected ? '✓ ' : ''}
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  label: { fontSize: 16, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 8 },
  option: {
    flex: 1,
    minHeight: TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 8,
  },
});
