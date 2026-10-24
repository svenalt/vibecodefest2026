import { Canvas, Group, Path, Skia, type SkPath } from '@shopify/react-native-skia';
import { View } from 'react-native';

import { ICON_PATHS, type IconName } from './icons';

const parsed = new Map<IconName, SkPath | null>();
function pathFor(name: IconName): SkPath | null {
  if (!parsed.has(name)) parsed.set(name, Skia.Path.MakeFromSVGString(ICON_PATHS[name]));
  return parsed.get(name) ?? null;
}

interface Props {
  name: IconName;
  color: string;
  size?: number;
  /** Stroke width on the 24 pt grid; scales with `size`. */
  weight?: number;
}

/** Decorative line icon. Hidden from accessibility and touch, so the surrounding control owns both. */
export function Icon({ name, color, size = 24, weight = 1.8 }: Props) {
  const path = pathFor(name);
  return (
    <View
      style={{ width: size, height: size }}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {path && (
        <Canvas style={{ width: size, height: size }}>
          <Group transform={[{ scale: size / 24 }]}>
            <Path path={path} style="stroke" strokeWidth={weight} strokeCap="round" strokeJoin="round" color={color} />
          </Group>
        </Canvas>
      )}
    </View>
  );
}
