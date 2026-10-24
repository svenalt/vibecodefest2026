import {
  Canvas,
  Circle,
  Group,
  LinearGradient,
  Path,
  Rect,
  Skia,
  vec,
} from '@shopify/react-native-skia';
import { useEffect, useRef, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';

import type { AudioFeatures } from '../core/types';
import { usePalette } from '../ui/theme';
import { VizState, type Motif, type VizFrame } from './vizModel';

export type VizMode = 'animated' | 'reduced';

interface Props {
  motif: Motif;
  mode: VizMode;
  height: number;
  /** Latest features, or null when not listening. Read every frame; never causes a render. */
  getFeatures: () => AudioFeatures | null;
}

const FRAME_MS = 1000 / 30;

const COLORS = {
  low: '#7C5CFF',
  mid: '#2DD4BF',
  high: '#FBBF24',
  rain: '#8FD3FF',
  pulse: '#FF6B9A',
  wave: '#5EEAD4',
};

// Fixed pseudo-random seeds so rain looks the same on every launch and between frames.
const PARTICLES = (() => {
  let s = 12345;
  const next = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
  return Array.from({ length: 70 }, () => ({
    x: next(),
    y: next(),
    speed: 0.4 + next() * 0.9,
    size: 1 + next() * 2.2,
    wobble: next() * Math.PI * 2,
  }));
})();

/**
 * Decorative sound-reactive Skia scene. It is an artistic interpretation of loudness, tone
 * and broad sound class, never a map of where a sound comes from, and it carries no
 * information that the text UI does not also state.
 */
export function SoundCanvasView({ motif, mode, height, getFeatures }: Props) {
  const c = usePalette();
  const [width, setWidth] = useState(0);
  const [frame, setFrame] = useState<VizFrame>(() => VizState.staticFrame(motif));
  const motifRef = useRef(motif);
  motifRef.current = motif;

  // Reduce Motion: one fixed composition, redrawn only when the motif changes.
  useEffect(() => {
    if (mode === 'reduced') setFrame(VizState.staticFrame(motif));
  }, [mode, motif]);

  // Animated: one long-lived state so motif changes cross-fade instead of restarting.
  useEffect(() => {
    if (mode !== 'animated') return;
    const state = new VizState();
    let raf = 0;
    let last = Date.now();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = Date.now();
      if (now - last < FRAME_MS - 2) return;
      const dt = (now - last) / 1000;
      last = now;
      setFrame(state.step(dt, getFeatures(), motifRef.current));
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [mode, getFeatures]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <View
      style={{ height, borderRadius: 20, overflow: 'hidden', backgroundColor: c.vizBg[0] }}
      onLayout={onLayout}
      // Decorative: the same information is available as text below.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {width > 0 && (
        <Canvas style={{ width, height }}>
          <Rect x={0} y={0} width={width} height={height}>
            <LinearGradient start={vec(0, 0)} end={vec(width, height)} colors={c.vizBg} />
          </Rect>
          <Scene frame={frame} w={width} h={height} />
        </Canvas>
      )}
    </View>
  );
}

function Scene({ frame, w, h }: { frame: VizFrame; w: number; h: number }) {
  const { weights } = frame;
  return (
    <>
      {weights.ambient > 0.02 && <Ambient frame={frame} w={w} h={h} />}
      {weights.waves > 0.02 && <Waves frame={frame} w={w} h={h} />}
      {weights.pulses > 0.02 && <Pulses frame={frame} w={w} h={h} />}
      {weights.particles > 0.02 && <Particles frame={frame} w={w} h={h} />}
      {weights.forms > 0.02 && <Forms frame={frame} w={w} h={h} />}
    </>
  );
}

type SceneProps = { frame: VizFrame; w: number; h: number };

function Ambient({ frame, w, h }: SceneProps) {
  const breathe = 1 + 0.08 * Math.sin(frame.time * 0.6);
  const r = h * (0.22 + 0.2 * frame.level) * breathe;
  return (
    <Group opacity={frame.weights.ambient * 0.7}>
      <Circle cx={w / 2} cy={h / 2} r={r * 1.6} color={COLORS.low} opacity={0.18} />
      <Circle cx={w / 2} cy={h / 2} r={r} color={COLORS.mid} opacity={0.35} />
      <Circle cx={w / 2} cy={h / 2} r={r * 0.5} color={COLORS.high} opacity={0.4} />
    </Group>
  );
}

function Waves({ frame, w, h }: SceneProps) {
  const paths = [0, 1, 2].map((i) => {
    const builder = Skia.PathBuilder.Make();
    const amp = h * 0.2 * (0.12 + frame.level) * (1 - i * 0.2);
    for (let x = 0; x <= w; x += 8) {
      const y =
        h / 2 +
        Math.sin(x * 0.018 * (1 + i * 0.4) + frame.time * (1.6 + i * 0.5) + i * 1.7) * amp +
        Math.sin(x * 0.007 + frame.time * 0.7) * amp * 0.4;
      if (x === 0) builder.moveTo(x, y);
      else builder.lineTo(x, y);
    }
    return builder.build();
  });
  return (
    <Group opacity={frame.weights.waves}>
      {paths.map((path, i) => (
        <Path
          key={i}
          path={path}
          style="stroke"
          strokeWidth={3 + frame.level * 4 - i}
          color={[COLORS.wave, COLORS.mid, COLORS.low][i]!}
          opacity={0.9 - i * 0.25}
        />
      ))}
    </Group>
  );
}

function Pulses({ frame, w, h }: SceneProps) {
  const maxR = Math.min(w, h) * 0.55 + frame.level * 30;
  const speed = 0.35 + frame.level * 0.9;
  return (
    <Group opacity={frame.weights.pulses}>
      {[0, 1, 2, 3].map((i) => {
        const p = (frame.time * speed + i / 4) % 1;
        return (
          <Circle
            key={i}
            cx={w / 2}
            cy={h / 2}
            r={8 + p * maxR}
            style="stroke"
            strokeWidth={2 + frame.level * 7 * (1 - p)}
            color={i % 2 === 0 ? COLORS.pulse : COLORS.high}
            opacity={(1 - p) * 0.9}
          />
        );
      })}
    </Group>
  );
}

function Particles({ frame, w, h }: SceneProps) {
  const fall = frame.time * (0.12 + frame.level * 0.35);
  return (
    <Group opacity={frame.weights.particles * (0.45 + 0.45 * frame.level)}>
      {PARTICLES.map((p, i) => (
        <Circle
          key={i}
          cx={p.x * w + Math.sin(frame.time * 0.8 + p.wobble) * 4}
          cy={((p.y + fall * p.speed) % 1) * h}
          r={p.size * (1 + frame.level * 0.6)}
          color={COLORS.rain}
        />
      ))}
    </Group>
  );
}

function Forms({ frame, w, h }: SceneProps) {
  const beat = 0.5 + 0.5 * Math.sin(frame.time * 4.2);
  const { low, mid, high } = frame.bands;
  const base = Math.min(w, h) * 0.18;
  const spots = [
    { x: 0.25, y: 0.55, e: low, color: COLORS.low, phase: 0 },
    { x: 0.5, y: 0.4, e: mid, color: COLORS.mid, phase: 1.3 },
    { x: 0.75, y: 0.58, e: high, color: COLORS.high, phase: 2.6 },
  ];
  return (
    <Group opacity={frame.weights.forms}>
      {spots.map((s, i) => {
        const pulse = 0.5 + 0.5 * Math.sin(frame.time * 4.2 + s.phase);
        const r = base * (0.5 + s.e * 1.4 + frame.level * 0.8 * (0.4 + 0.6 * pulse));
        return (
          <Group key={i}>
            <Circle cx={w * s.x} cy={h * s.y} r={r * 1.5} color={s.color} opacity={0.18 + 0.1 * beat} />
            <Circle cx={w * s.x} cy={h * s.y} r={r} color={s.color} opacity={0.75} />
          </Group>
        );
      })}
    </Group>
  );
}
