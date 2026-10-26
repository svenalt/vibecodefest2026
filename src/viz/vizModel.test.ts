import { describe, expect, it } from 'vitest';
import type { ActiveSound, Current } from '../core/eventTracker';
import { VISUAL_FAMILIES, type VisualFamily } from '../core/yamnet/taxonomy';
import {
  BURST_LIFE_S,
  LAYERS,
  LAYER_LOOK,
  MAX_BURSTS,
  MOTIFS,
  SECONDARY_SHARE,
  VizState,
  dbFromRms,
  intensityFromContrast,
  leadLayer,
  levelFromRms,
  sceneFor,
  sceneKey,
  vizModeFor,
  type Layer,
  type VizInput,
  type VizScene,
} from './vizModel';

const sound = (family: VisualFamily, label = family): ActiveSound => ({
  group: label,
  index: 0,
  rawLabel: label,
  label,
  family,
  score: 0.9,
  sinceMs: 0,
});
const event = (...families: VisualFamily[]): Current => {
  const [primary, ...secondary] = families.map((f) => sound(f));
  return { kind: 'event', primary: primary!, secondary, sinceMs: 0 };
};
const only = (layer: Layer): VizScene => ({ [layer]: 1 });
const CALM = only('calm');

describe('vizModeFor (REQ-010)', () => {
  it('follows the device: animated unless Reduce Motion is on, never off', () => {
    expect(vizModeFor(false)).toBe('animated');
    expect(vizModeFor(true)).toBe('reduced');
  });
});

describe('family look (REQ-012)', () => {
  it('keeps the accepted look of the original six sounds', () => {
    expect(LAYER_LOOK.voice).toEqual({ motif: 'waves', tint: 'lav' }); // speech
    expect(LAYER_LOOK.people).toEqual({ motif: 'pulses', tint: 'gold' }); // applause
    expect(LAYER_LOOK.animals).toEqual({ motif: 'pulses', tint: 'gold' }); // dog bark
    expect(LAYER_LOOK.signals).toEqual({ motif: 'pulses', tint: 'gold' }); // bell
    expect(LAYER_LOOK.nature).toEqual({ motif: 'particles', tint: 'mint' }); // rain
    expect(LAYER_LOOK.music).toEqual({ motif: 'forms', tint: 'aqua' });
    expect(LAYER_LOOK.calm).toEqual({ motif: 'ambient', tint: 'shine' });
  });

  it('gives every family a look from the existing motifs: no per-class scenes', () => {
    expect(LAYERS).toEqual([...VISUAL_FAMILIES, 'calm']);
    for (const l of LAYERS) expect(MOTIFS).toContain(LAYER_LOOK[l].motif);
  });
});

describe('sceneFor', () => {
  it('one sound drives the whole scene', () => {
    expect(sceneFor(event('voice'))).toEqual({ voice: 1 });
    expect(sceneFor(event('vehicles'))).toEqual({ vehicles: 1 });
  });

  it('blends simultaneous sounds predictably: primary leads, each secondary adds a fixed share', () => {
    expect(sceneFor(event('voice', 'music'))).toEqual({ voice: 1 - SECONDARY_SHARE, music: SECONDARY_SHARE });
    const three = sceneFor(event('voice', 'music', 'vehicles'));
    expect(three.voice).toBeCloseTo(1 - 2 * SECONDARY_SHARE, 9);
    expect(three.music).toBe(SECONDARY_SHARE);
    expect(three.vehicles).toBe(SECONDARY_SHARE);
    expect(three.voice!).toBeGreaterThanOrEqual(0.7);
    expect(leadLayer(three)).toBe('voice');
  });

  it('quiet, no confident sound and stopped all give the calm scene', () => {
    expect(sceneFor({ kind: 'none', sinceMs: 0 })).toEqual(CALM);
    expect(sceneFor({ kind: 'silence', sinceMs: 0 })).toEqual(CALM);
  });

  it('has a stable key, so an unchanged scene never redraws the still artwork', () => {
    expect(sceneKey(sceneFor(event('voice', 'music')))).toBe(sceneKey({ music: 0.15, voice: 0.85 }));
    expect(sceneKey(sceneFor(event('voice', 'music')))).not.toBe(sceneKey(sceneFor(event('music', 'voice'))));
  });
});

describe('levelFromRms', () => {
  it('is bounded, monotonic and zero for silence or garbage', () => {
    expect(levelFromRms(0)).toBe(0);
    expect(levelFromRms(-1)).toBe(0);
    expect(levelFromRms(NaN)).toBe(0);
    expect(levelFromRms(5)).toBe(1);
    expect(levelFromRms(0.02)).toBeLessThan(levelFromRms(0.1));
  });
});

describe('adaptive intensity', () => {
  it('handles silence and invalid RMS', () => {
    expect(dbFromRms(0)).toBe(dbFromRms(NaN));
    expect(intensityFromContrast(-5)).toBe(0);
    expect(intensityFromContrast(100)).toBeLessThan(1);
  });

  const feat = (rms: number) => ({ rms, bands: { low: 0.3, mid: 0.4, high: 0.3 } });
  const run = (s: VizState, rms: number, seconds: number) => {
    let level = 0;
    for (let i = 0; i < seconds * 30; i++) level = s.step(1 / 30, feat(rms), CALM).level;
    return level;
  };

  it('shows a quiet transient but calms under sustained loud ambience', () => {
    const quiet = new VizState();
    run(quiet, 0.002, 10);
    expect(run(quiet, 0.02, 0.5)).toBeGreaterThan(0.3);

    const loud = new VizState();
    const early = run(loud, 0.2, 1);
    const late = run(loud, 0.2, 15);
    expect(late).toBeLessThan(early * 0.5);
    expect(run(loud, 0.9, 0.5)).toBeGreaterThan(late + 0.2);
  });
});

describe('VizState', () => {
  const loud = { rms: 0.3, bands: { low: 0.3, mid: 0.4, high: 0.3 } };

  it('rises faster than it falls (attack > release)', () => {
    const rise = new VizState();
    const up = rise.step(1 / 30, loud, CALM).level;

    const fall = new VizState();
    for (let i = 0; i < 30; i++) fall.step(1 / 30, loud, CALM);
    const before = fall.frame().level;
    const down = fall.step(1 / 30, null, CALM).level;

    expect(up).toBeGreaterThan(0.05);
    expect(before - down).toBeLessThan(up);
  });

  it('keeps layer and motif weights summing to 1 and converges to the target', () => {
    const s = new VizState();
    let frame = s.frame();
    for (let i = 0; i < 90; i++) {
      frame = s.step(1 / 30, loud, only('voice'));
      expect(MOTIFS.reduce((a, m) => a + frame.weights[m], 0)).toBeCloseTo(1, 6);
      expect(LAYERS.reduce((a, l) => a + frame.layers[l], 0)).toBeCloseTo(1, 6);
    }
    expect(frame.weights.waves).toBeGreaterThan(0.95);
    expect(frame.layers.voice).toBeGreaterThan(0.95);
  });

  it('cross-fades instead of jumping when the sound changes', () => {
    const s = new VizState();
    for (let i = 0; i < 90; i++) s.step(1 / 30, loud, only('voice'));
    const first = s.step(1 / 30, loud, only('music'));
    expect(first.weights.waves).toBeGreaterThan(0.5);
    expect(first.weights.forms).toBeGreaterThan(0);
    expect(first.weights.forms).toBeLessThan(0.5);
  });

  it('settles on the blend of simultaneous sounds, with the primary clearly leading', () => {
    const s = new VizState();
    let frame = s.frame();
    for (let i = 0; i < 150; i++) frame = s.step(1 / 30, loud, sceneFor(event('voice', 'music', 'nature')));
    expect(frame.layers.voice).toBeCloseTo(0.7, 2);
    expect(frame.layers.music).toBeCloseTo(0.15, 2);
    expect(frame.layers.nature).toBeCloseTo(0.15, 2);
    expect(frame.weights).toMatchObject({ waves: expect.closeTo(0.7, 2), forms: expect.closeTo(0.15, 2) });
  });

  it('a secondary sound appearing or leaving moves the scene gently (no flicker)', () => {
    const s = new VizState();
    for (let i = 0; i < 150; i++) s.step(1 / 30, loud, sceneFor(event('voice')));
    const joined = s.step(1 / 30, loud, sceneFor(event('voice', 'music')));
    expect(joined.layers.music).toBeLessThan(0.02);
    expect(joined.layers.voice).toBeGreaterThan(0.98);
  });

  it('two families sharing a motif keep their own layers (and tints)', () => {
    const s = new VizState();
    let frame = s.frame();
    for (let i = 0; i < 150; i++) frame = s.step(1 / 30, loud, sceneFor(event('voice', 'vehicles')));
    expect(frame.weights.waves).toBeCloseTo(1, 2);
    expect(frame.layers.voice).toBeCloseTo(0.85, 2);
    expect(frame.layers.vehicles).toBeCloseTo(0.15, 2);
  });

  it('returns to calm when the sounds end or listening stops', () => {
    const s = new VizState();
    for (let i = 0; i < 90; i++) s.step(1 / 30, loud, only('voice'));
    let frame = s.frame();
    for (let i = 0; i < 150; i++) frame = s.step(1 / 30, null, sceneFor({ kind: 'none', sinceMs: 0 }));
    expect(frame.layers.calm).toBeGreaterThan(0.99);
    expect(frame.listening).toBe(false);
    expect(frame.level).toBeLessThan(0.01);
  });

  it('clamps huge frame gaps so a stall does not teleport the animation', () => {
    const s = new VizState();
    expect(s.step(10, loud, only('voice')).time).toBeLessThanOrEqual(0.1);
  });

  it('static frame (Reduce Motion) shows the scene as is, with no clock', () => {
    const f = VizState.staticFrame(only('nature'));
    expect(f.time).toBe(0);
    expect(f.weights.particles).toBe(1);
    const blend = VizState.staticFrame(sceneFor(event('voice', 'music')));
    expect(blend.layers).toMatchObject({ voice: 0.85, music: 0.15, calm: 0 });
    expect(blend.weights).toMatchObject({ waves: 0.85, forms: 0.15 });
  });
});

describe('sound-driven accents (REQ-005)', () => {
  const tone = { low: 0.2, mid: 0.6, high: 0.2 };
  const feat = (rms: number, peak = rms * 3) => ({ rms, peak, bands: tone });
  /** Runs at 30 fps and returns the number of onsets seen plus the last frame. */
  const run = (s: VizState, seconds: number, input: (i: number) => VizInput | null, scene: VizScene = CALM) => {
    let onsets = 0;
    let frame = s.frame();
    for (let i = 0; i < seconds * 30; i++) {
      frame = s.step(1 / 30, input(i), scene);
      if (frame.bursts.some((b) => b.age === 0)) onsets++;
    }
    return { onsets, frame };
  };

  it('a quiet tap in a quiet room emits one short-lived burst', () => {
    const s = new VizState();
    run(s, 8, () => feat(0.002));
    const tap = run(s, 0.15, () => feat(0.01, 0.08));
    expect(tap.onsets).toBe(1);
    expect(tap.frame.accent).toBeGreaterThan(0.4);
    const after = run(s, BURST_LIFE_S + 0.2, () => feat(0.002));
    expect(after.onsets).toBe(0);
    expect(after.frame.bursts).toHaveLength(0);
    expect(after.frame.accent).toBeLessThan(0.05);
  });

  it('steady, slightly jittery noise settles to no bursts; a stronger sound still stands out', () => {
    const s = new VizState();
    const jitter = (i: number) => feat(0.1 * (1 + 0.15 * Math.sin(i * 1.7)));
    run(s, 6, jitter);
    const settled = run(s, 10, jitter);
    expect(settled.onsets).toBe(0);
    expect(settled.frame.level).toBeLessThan(0.05);
    expect(settled.frame.accent).toBeLessThan(0.05);

    const shout = run(s, 0.3, () => feat(0.6));
    expect(shout.onsets).toBeGreaterThanOrEqual(1);
    expect(shout.frame.level).toBeGreaterThan(0.4);
  });

  it('never emits pulses or bursts in silence or while not listening', () => {
    const silent = new VizState();
    const off = run(silent, 5, () => null, only('people'));
    expect(off.onsets).toBe(0);
    expect(off.frame.listening).toBe(false);
    expect(off.frame.level).toBe(0);

    const quiet = run(new VizState(), 5, () => feat(0.0005), sceneFor(event('voice', 'music', 'signals')));
    expect(quiet.onsets).toBe(0);
    expect(quiet.frame.listening).toBe(true);
  });

  it('band energy is ~0 in near silence even though the tone balance sums to 1', () => {
    const { frame } = run(new VizState(), 5, () => feat(0.001), only('music'));
    expect(frame.bands.low + frame.bands.mid + frame.bands.high).toBeLessThan(0.02);
  });

  it('rate-limits bursts and keeps them bounded under rapid hits', () => {
    const s = new VizState();
    run(s, 3, () => feat(0.002));
    // Alternating hits and silence every 2 frames (15 Hz) for 2 seconds.
    const { onsets, frame } = run(s, 2, (i) => (i % 4 < 2 ? feat(0.3) : feat(0.002)));
    expect(onsets).toBeLessThanOrEqual(Math.ceil(2 / 0.22));
    expect(frame.bursts.length).toBeLessThanOrEqual(MAX_BURSTS);
  });

  it('a burst keeps the look it was born with while the scene cross-fades', () => {
    const s = new VizState();
    run(s, 3, () => feat(0.002), only('people'));
    run(s, 0.1, () => feat(0.2), only('people'));
    const { frame } = run(s, 0.3, () => feat(0.002), only('voice'));
    expect(frame.bursts[0]).toMatchObject({ motif: 'pulses', tint: 'gold' });
  });

  it('a burst takes the look of the primary sound, not of a secondary one', () => {
    const s = new VizState();
    run(s, 3, () => feat(0.002), sceneFor(event('vehicles', 'people')));
    const { frame } = run(s, 0.1, () => feat(0.2), sceneFor(event('vehicles', 'people')));
    expect(frame.bursts.at(-1)).toMatchObject({ motif: 'waves', tint: 'amber' });
  });

  it('drift advances faster with foreground sound than at rest', () => {
    const rest = run(new VizState(), 2, () => feat(0.002)).frame.flow;
    const s = new VizState();
    run(s, 2, () => feat(0.002));
    const before = s.frame().flow;
    const loud = run(s, 2, (i) => feat(i % 20 < 10 ? 0.3 : 0.05)).frame.flow - before;
    expect(loud).toBeGreaterThan(rest * 1.5);
  });

  it('static frame has no bursts or accent', () => {
    const f = VizState.staticFrame(only('signals'));
    expect(f.bursts).toHaveLength(0);
    expect(f.accent).toBe(0);
  });
});
