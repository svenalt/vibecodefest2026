import { describe, expect, it } from 'vitest';
import type { Current } from '../core/eventTracker';
import { MOTIFS, VizState, levelFromRms, motifForCurrent } from './vizModel';

const event = (category: Extract<Current, { kind: 'event' }>['category']): Current => ({
  kind: 'event',
  category,
  score: 0.9,
  rawLabel: category,
  sinceMs: 0,
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

describe('VizState', () => {
  const loud = { rms: 0.3, bands: { low: 0.3, mid: 0.4, high: 0.3 } };

  it('rises faster than it falls (attack > release)', () => {
    const rise = new VizState();
    const up = rise.step(1 / 30, loud, 'ambient').level;

    const fall = new VizState();
    for (let i = 0; i < 30; i++) fall.step(1 / 30, loud, 'ambient');
    const before = fall.frame().level;
    const down = fall.step(1 / 30, null, 'ambient').level;

    expect(up).toBeGreaterThan(0.3);
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
