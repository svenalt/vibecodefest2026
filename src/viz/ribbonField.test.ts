import { describe, expect, it } from 'vitest';

import { burstLift, layoutFor, RibbonField, SHEETS } from './ribbonField';
import { BURST_LIFE_S, VizState, type Burst, type VizFrame, type VizInput } from './vizModel';

const DT = 1 / 30;
const quiet: VizInput = { rms: 0.004, peak: 0.005, bands: { low: 0.4, mid: 0.4, high: 0.2 } };
const tap: VizInput = { rms: 0.03, peak: 0.08, bands: { low: 0.3, mid: 0.5, high: 0.2 } };

function snapshot(field: RibbonField): number[] {
  const out: number[] = [];
  SHEETS.forEach((_, i) => {
    for (let j = 0; j < field.n; j++) out.push(field.threadY(i, -1, j), field.threadY(i, 1, j));
  });
  return out;
}

const maxDiff = (a: number[], b: number[]) => a.reduce((m, v, k) => Math.max(m, Math.abs(v - b[k]!)), 0);

/** Runs the model for `seconds` of quiet, then returns the field and the state for more steps. */
function settled(w: number, h: number, seconds = 6) {
  const state = new VizState();
  const field = new RibbonField(w, h);
  let frame!: VizFrame;
  for (let t = 0; t < seconds; t += DT) frame = state.step(DT, quiet, 'ambient');
  field.update(frame);
  return { state, field, frame };
}

describe('layoutFor', () => {
  it('keeps the upper part quiet on wide frames and recomposes for tall ones', () => {
    for (const [w, h] of [
      [834, 470],
      [396, 389],
      [428, 926],
      [926, 428],
    ] as const) {
      const l = layoutFor(w, h);
      expect(l.top).toBeGreaterThan(h * 0.2);
      expect(l.top + l.zone).toBeLessThanOrEqual(h);
      expect(l.samples).toBeGreaterThanOrEqual(24);
      expect(l.samples).toBeLessThanOrEqual(60);
    }
    expect(layoutFor(834, 470).top / 470).toBeGreaterThan(0.3);
    // Portrait shows fewer waves across the width instead of squeezing them.
    expect(layoutFor(428, 926).cycles).toBeLessThan(layoutFor(834, 470).cycles);
  });
});

describe('RibbonField', () => {
  it('stays finite and inside a sensible band under extreme or invalid input', () => {
    const state = new VizState();
    const field = new RibbonField(396, 389);
    const inputs: (VizInput | null)[] = [
      null,
      { rms: 0, bands: { low: 0, mid: 0, high: 0 } },
      { rms: NaN, peak: Infinity, bands: { low: 1, mid: 1, high: 1 } },
      { rms: 1, peak: 1, bands: { low: 1, mid: 1, high: 1 } },
    ];
    let lo = Infinity;
    let hi = -Infinity;
    let finite = true;
    for (let k = 0; k < 600; k++) {
      const input = k % 7 === 0 ? inputs[3]! : inputs[k % inputs.length]!;
      field.update(state.step(DT, input, k % 50 < 25 ? 'forms' : 'waves'));
      for (const y of snapshot(field)) {
        finite &&= Number.isFinite(y);
        lo = Math.min(lo, y);
        hi = Math.max(hi, y);
      }
    }
    expect(finite).toBe(true);
    expect(lo).toBeGreaterThan(-389 * 0.5);
    expect(hi).toBeLessThan(389 * 1.5);
  });

  it('is almost still in a quiet room: tiny change between consecutive frames', () => {
    const { state, field } = settled(396, 389);
    const a = snapshot(field);
    field.update(state.step(DT, quiet, 'ambient'));
    expect(maxDiff(a, snapshot(field))).toBeLessThan(1.5);
  });

  it('a quiet tap deforms the ribbons (shape, not just brightness), then releases', () => {
    const { state, field } = settled(396, 389);
    const before = snapshot(field);
    let frame = state.step(DT, tap, 'ambient');
    for (let k = 0; k < 6; k++) frame = state.step(DT, quiet, 'ambient');
    expect(frame.bursts.length).toBe(1);
    field.update(frame);
    expect(maxDiff(before, snapshot(field))).toBeGreaterThan(12);

    for (let t = 0; t < BURST_LIFE_S + 1.5; t += DT) frame = state.step(DT, quiet, 'ambient');
    field.update(frame);
    const after = snapshot(field);
    field.update(state.step(DT, quiet, 'ambient'));
    expect(frame.bursts.length).toBe(0);
    expect(maxDiff(after, snapshot(field))).toBeLessThan(1.5);
  });

  it('low-band energy thickens the lower sheets', () => {
    const base = settled(396, 389).frame;
    const thickness = (f: VizFrame) => {
      const field = new RibbonField(396, 389);
      field.update(f);
      const bottom = field.half[SHEETS.length - 1]!;
      return bottom.reduce((s, v) => s + v, 0);
    };
    const lowHeavy: VizFrame = { ...base, level: 0.5, bands: { low: 0.4, mid: 0.05, high: 0.05 } };
    const highHeavy: VizFrame = { ...base, level: 0.5, bands: { low: 0.05, mid: 0.05, high: 0.4 } };
    expect(thickness(lowHeavy)).toBeGreaterThan(thickness(highHeavy) * 1.3);
  });
});

describe('burstLift', () => {
  const burst = (age: number): Burst => ({ age, strength: 0.8, seed: 0.5, motif: 'ambient' });

  it('rises quickly, travels outward and is gone by the end of its life', () => {
    expect(burstLift(burst(0), 0.5, 1)).toBe(0);
    expect(burstLift(burst(0.15), 0.5, 1)).toBeGreaterThan(0.05);
    // Later the peak has moved away from the origin.
    expect(burstLift(burst(1), 0.5 + 0.32, 1)).toBeGreaterThan(burstLift(burst(1), 0.5, 1));
    expect(burstLift(burst(BURST_LIFE_S + 0.2), 0.5, 1)).toBe(0);
  });

  it('is bounded and answers less on the back sheets', () => {
    for (let a = 0; a < BURST_LIFE_S; a += 0.05) {
      for (let u = 0; u <= 1; u += 0.05) {
        const v = burstLift({ age: a, strength: 1, seed: 0.5, motif: 'waves' }, u, 1);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(0.4);
      }
    }
    expect(burstLift(burst(0.3), 0.5, 0.15)).toBeLessThan(burstLift(burst(0.3), 0.5, 1));
  });
});
