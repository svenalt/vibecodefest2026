import { Canvas, Picture, type SkPicture } from '@shopify/react-native-skia';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';

import type { AudioFeatures } from '../core/types';
import { usePalette } from '../ui/theme';
import { UniversePainter } from './universePainter';
import { sceneKey, VizState, type VizMode, type VizScene } from './vizModel';

interface Props {
  /** What the recognized sounds ask of the scene; the sound itself drives all motion. */
  scene: VizScene;
  mode: VizMode;
  /** Rounded card corners; off when the artwork fills the screen. */
  rounded?: boolean;
  /** Latest features, or null when not listening. Read every frame; never causes a render. */
  getFeatures: () => AudioFeatures | null;
  /** True while the view is not visible; stops the animation loop without unmounting. */
  paused?: boolean;
}

const FRAME_MS = 1000 / 30;
const IDLE_FRAME_MS = 1000 / 15; // stopped and settled: slow breathing only, so save battery

/**
 * Decorative sound-reactive Skia scene. It is an artistic interpretation of loudness, tone
 * and broad sound families, never a map of where a sound comes from or how many sources there
 * are, and it carries no information that the text UI does not also state.
 *
 * Each frame is recorded imperatively into one Skia picture, so React only swaps a single
 * prop instead of reconciling a tree of shapes.
 *
 * Fills its parent; the parent decides whether that is a card or the whole screen. The same
 * instance serves both, so entering immersive mode never starts a second scene or loop.
 */
export function SoundCanvasView({ scene, mode, rounded = true, getFeatures, paused = false }: Props) {
  const c = usePalette();
  // The painter always uses the measured size, so the same scene recomposes for a card or the full screen.
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [picture, setPicture] = useState<SkPicture | null>(null);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const key = sceneKey(scene);

  const painter = useMemo(
    () => (size.width > 0 && size.height > 0 ? new UniversePainter(size.width, size.height, c.mode, c.vizBg) : null),
    [size.width, size.height, c.mode, c.vizBg],
  );
  // One long-lived state so sound changes, pauses and theme switches cross-fade instead of restarting.
  const state = useRef(new VizState()).current;

  // Reduce Motion: one fixed composition, redrawn only when the sounds, size or theme change.
  useEffect(() => {
    if (mode === 'reduced' && painter) setPicture(painter.draw(VizState.staticFrame(sceneRef.current)));
  }, [mode, key, painter]);

  useEffect(() => {
    if (mode !== 'animated' || paused || !painter) return;
    let raf = 0;
    let last = Date.now();
    let interval = FRAME_MS;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = Date.now();
      if (now - last < interval - 2) return;
      const dt = (now - last) / 1000;
      last = now;
      const frame = state.step(dt, getFeatures(), sceneRef.current);
      const settled = !frame.listening && frame.presence < 0.02 && frame.level < 0.01 && frame.bursts.length === 0;
      interval = settled ? IDLE_FRAME_MS : FRAME_MS;
      setPicture(painter.draw(frame));
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [mode, paused, painter, getFeatures, state]);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    const h = Math.round(e.nativeEvent.layout.height);
    // Same size keeps the same object, so the painter is rebuilt only on a real size change.
    setSize((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
  };

  return (
    <View
      style={{
        flex: 1,
        borderRadius: rounded ? 20 : 0,
        overflow: 'hidden',
        backgroundColor: c.vizBg[0],
      }}
      onLayout={onLayout}
      // Decorative: the same information is available as text below.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* Absolutely positioned: the canvas's own (possibly stale) size must never hold its container
          open, or leaving immersive mode would keep the full-screen height. */}
      {painter && (
        <Canvas style={{ position: 'absolute', left: 0, top: 0, width: size.width, height: size.height }}>
          {picture && <Picture picture={picture} />}
        </Canvas>
      )}
    </View>
  );
}
