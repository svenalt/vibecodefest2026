import { describe, expect, it } from 'vitest';
import type { Current } from '../core/eventTracker';
import {
  BURST_LIFE_S,
  MAX_BURSTS,
  MOTIFS,
  VizState,
  dbFromRms,
  intensityFromContrast,
  levelFromRms,
  motifForCurrent,
  vizModeFor,
  type Motif,
  type VizInput,
} from './vizModel';

const event = (category: Extract<Current, { kind: 'event' }>['category']): Current => ({
  kind: 'event',
  category,
  score: 0.9,
  rawLabel: category,
  sinceMs: 0,
});

describe('vizModeFor (REQ-010)', () => {
  it('follows the device: animated unless Reduce Motion is on, never off', () => {
    expect(vizModeFor(false)).toBe('animated');
    expect(vizModeFor(true)).toBe('reduced');
  });
});

describe('motifForCurrent', () => {
  it('maps the broad sound classes from REQ-001.5', () => {
    expect(motifForCurrent(event('speech'))).toBe('waves');
    expect(motifForCurrent(event('applause'))).toBe('pulses');
    expect(motifForCurrent(event('rain'))).toBe('particles');
    expect(motifForCurrent(event('music'))).toBe('forms');
  });

  it('falls back to calm ambient for unknown and quiet', () => {
    expect(motifForCurrent({ kind: 'none', sinceMs: 0 })).toBe('ambient');
    expect(motifForCurrent({ kind: 'silence', sinceMs: 0 })).toBe('ambient');
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
    for (let i = 0; i < seconds * 30; i++) level = s.step(1 / 30, feat(rms), 'ambient').level;
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
    const up = rise.step(1 / 30, loud, 'ambient').level;

    const fall = new VizState();
    for (let i = 0; i < 30; i++) fall.step(1 / 30, loud, 'ambient');
    const before = fall.frame().level;
    const down = fall.step(1 / 30, null, 'ambient').level;

    expect(up).toBeGreaterThan(0.05);
    expect(before - down).toBeLessThan(up);
  });

  it('keeps motif weights summing to 1 and converges to the target motif', () => {
    const s = new VizState();
    let frame = s.frame();
    for (let i = 0; i < 90; i++) {
      frame = s.step(1 / 30, loud, 'waves');
      const sum = MOTIFS.reduce((a, m) => a + frame.weights[m], 0);
      expect(sum).toBeCloseTo(1, 6);
    }
    expect(frame.weights.waves).toBeGreaterThan(0.95);
  });

  it('cross-fades instead of jumping when the motif changes', () => {
    const s = new VizState();
    for (let i = 0; i < 90; i++) s.step(1 / 30, loud, 'waves');
    const first = s.step(1 / 30, loud, 'forms');
    expect(first.weights.waves).toBeGreaterThan(0.5);
    expect(first.weights.forms).toBeGreaterThan(0);
    expect(first.weights.forms).toBeLessThan(0.5);
  });

  it('clamps huge frame gaps so a stall does not teleport the animation', () => {
    const s = new VizState();
    expect(s.step(10, loud, 'waves').time).toBeLessThanOrEqual(0.1);
  });

  it('static frame shows one motif with no clock', () => {
    const f = VizState.staticFrame('particles');
    expect(f.time).toBe(0);
    expect(f.weights.particles).toBe(1);
  });
});

describe('sound-driven accents (REQ-005)', () => {
  const tone = { low: 0.2, mid: 0.6, high: 0.2 };
  const feat = (rms: number, peak = rms * 3) => ({ rms, peak, bands: tone });
  /** Runs at 30 fps and returns the number of onsets seen plus the last frame. */
  const run = (s: VizState, seconds: number, input: (i: number) => VizInput | null, motif: Motif = 'ambient') => {
    let onsets = 0;
    let frame = s.frame();
    for (let i = 0; i < seconds * 30; i++) {
      frame = s.step(1 / 30, input(i), motif);
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
    const off = run(silent, 5, () => null, 'pulses');
    expect(off.onsets).toBe(0);
    expect(off.frame.listening).toBe(false);
    expect(off.frame.level).toBe(0);

    const quiet = run(new VizState(), 5, () => feat(0.0005), 'pulses');
    expect(quiet.onsets).toBe(0);
    expect(quiet.frame.listening).toBe(true);
  });

  it('band energy is ~0 in near silence even though the tone balance sums to 1', () => {
    const { frame } = run(new VizState(), 5, () => feat(0.001), 'forms');
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

  it('a burst keeps the motif it was born with while the scene cross-fades', () => {
    const s = new VizState();
    run(s, 3, () => feat(0.002), 'pulses');
    run(s, 0.1, () => feat(0.2), 'pulses');
    const { frame } = run(s, 0.3, () => feat(0.002), 'waves');
    expect(frame.bursts[0]?.motif).toBe('pulses');
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
    const f = VizState.staticFrame('pulses');
    expect(f.bursts).toHaveLength(0);
    expect(f.accent).toBe(0);
  });
});
