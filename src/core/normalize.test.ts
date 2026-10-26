import { describe, expect, it } from 'vitest';
import { ModelContractError, normalizeClassification } from './normalize';
import { fakeClassification } from './testing/fakeSoundInput';
import type { RawClassification } from './types';
import { YAMNET_NUM_CLASSES, YAMNET_TOP_K } from './yamnet/constants';
import { YAMNET_LABELS } from './yamnet/labels';
import { TAXONOMY } from './yamnet/taxonomy';

const raw = (top: RawClassification['top'], extra: Partial<RawClassification> = {}): RawClassification => ({
  timestampMs: 0,
  classCount: YAMNET_NUM_CLASSES,
  top,
  ...extra,
});
const entry = (index: number, score: number) => ({ index, label: YAMNET_LABELS[index]!, score });

describe('normalizeClassification (REQ-012)', () => {
  it('produces the ranked candidate schema with families from the shared taxonomy', () => {
    const p = normalizeClassification(fakeClassification(1234, [['Speech', 0.9], ['Music', 0.6]]), 'ios');
    expect(p).toEqual({
      timestampMs: 1234,
      candidates: [
        { index: 0, rawLabel: 'Speech', score: 0.9, family: 'voice' },
        { index: 132, rawLabel: 'Music', score: 0.6, family: 'music' },
      ],
      model: 'yamnet',
      platform: 'ios',
    });
  });

  it('is identical on both platforms apart from the platform field', () => {
    const input = fakeClassification(5, [['Bark', 0.8], ['Dog', 0.6]]);
    const ios = normalizeClassification(input, 'ios');
    const android = normalizeClassification(input, 'android');
    expect({ ...ios, platform: 'x' }).toEqual({ ...android, platform: 'x' });
    expect(android.platform).toBe('android');
  });

  it('keeps every top-K entry, including unfamiliar and context classes (no allowlist)', () => {
    const p = normalizeClassification(
      fakeClassification(0, [['Inside, small room', 0.8], ['Siren', 0.5], ['Whale vocalization', 0.3]]),
      'ios',
    );
    expect(p.candidates.map((c) => c.rawLabel)).toEqual(['Inside, small room', 'Siren', 'Whale vocalization']);
    expect(p.candidates.map((c) => c.family)).toEqual(['other', 'signals', 'animals']);
  });

  it('can turn every one of the 521 classes into a candidate', () => {
    for (let index = 0; index < YAMNET_NUM_CLASSES; index++) {
      const [c] = normalizeClassification(raw([entry(index, 0.9)]), 'android').candidates;
      expect(c).toEqual({ index, rawLabel: YAMNET_LABELS[index], score: 0.9, family: TAXONOMY[index]!.family });
    }
  });

  it('orders best first, ties by lower index, whatever order the adapter used', () => {
    const p = normalizeClassification(raw([entry(70, 0.5), entry(132, 0.9), entry(0, 0.5)]), 'ios');
    expect(p.candidates.map((c) => c.index)).toEqual([132, 0, 70]);
  });

  it('passes raw scores through untouched (not probabilities)', () => {
    const p = normalizeClassification(raw([entry(0, 0.4141)]), 'ios');
    expect(p.candidates[0]!.score).toBe(0.4141);
  });

  it('handles an empty result as no candidates', () => {
    expect(normalizeClassification(raw([]), 'ios').candidates).toEqual([]);
  });

  it('preserves exactly the intended top-K and rejects more', () => {
    const ten = Array.from({ length: YAMNET_TOP_K }, (_, i) => entry(i, 1 - i / 100));
    expect(normalizeClassification(raw(ten), 'ios').candidates).toHaveLength(YAMNET_TOP_K);
    const eleven = [...ten, entry(50, 0.01)];
    expect(() => normalizeClassification(raw(eleven), 'ios')).toThrow(/at most the top 10/);
    expect(() => normalizeClassification(raw(ten), 'ios', 5)).toThrow(ModelContractError);
  });

  it('rejects a wrong class count', () => {
    expect(() => normalizeClassification(raw([entry(0, 0.9)], { classCount: 520 }), 'ios')).toThrow(ModelContractError);
  });

  it('rejects a class-order mismatch between runtime labels and the pinned labels', () => {
    const p = raw([{ index: 1, label: 'Speech', score: 0.9 }]);
    expect(() => normalizeClassification(p, 'ios')).toThrow(/Class order mismatch at index 1/);
  });

  it('rejects out-of-range, fractional and duplicate indices', () => {
    for (const index of [-1, YAMNET_NUM_CLASSES, 1.5]) {
      expect(() => normalizeClassification(raw([{ index, label: 'Speech', score: 0.5 }]), 'ios')).toThrow(
        /out of range or twice/,
      );
    }
    expect(() => normalizeClassification(raw([entry(3, 0.5), entry(3, 0.4)]), 'ios')).toThrow(/out of range or twice/);
  });

  it('rejects non-finite scores and timestamps', () => {
    for (const score of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => normalizeClassification(raw([entry(0, score)]), 'ios')).toThrow(/non-finite score/);
    }
    expect(() => normalizeClassification(raw([entry(0, 0.5)], { timestampMs: Number.NaN }), 'ios')).toThrow(
      /invalid timestamp/,
    );
  });
});
