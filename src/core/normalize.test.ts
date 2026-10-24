import { describe, expect, it } from 'vitest';
import { ModelContractError, normalizeClassification } from './normalize';
import { fakeClassification } from './testing/fakeSoundInput';

describe('normalizeClassification', () => {
  it('produces the normalized event schema', () => {
    const p = normalizeClassification(fakeClassification(1234, [['Speech', 0.9]]), 'ios');
    expect(p).toEqual({
      timestampMs: 1234,
      category: 'speech',
      rawLabel: 'Speech',
      score: 0.9,
      model: 'yamnet',
      platform: 'ios',
    });
  });

  it('is identical on both platforms apart from the platform field', () => {
    const raw = fakeClassification(5, [['Bark', 0.8], ['Dog', 0.6]]);
    const ios = normalizeClassification(raw, 'ios');
    const android = normalizeClassification(raw, 'android');
    expect({ ...ios, platform: 'x' }).toEqual({ ...android, platform: 'x' });
    expect(android.platform).toBe('android');
  });

  it('picks the best-scoring surfaced class, skipping unsurfaced ones', () => {
    const p = normalizeClassification(
      fakeClassification(0, [['Inside, small room', 0.8], ['Music', 0.5], ['Speech', 0.3]]),
      'ios',
    );
    expect(p.category).toBe('music');
    expect(p.rawLabel).toBe('Music');
  });

  it('returns unknown (keeping the best raw label) when nothing is surfaced', () => {
    const p = normalizeClassification(fakeClassification(0, [['Siren', 0.7], ['Inside, small room', 0.2]]), 'ios');
    expect(p.category).toBe('unknown');
    expect(p.rawLabel).toBe('Siren');
    expect(p.score).toBe(0.7);
  });

  it('maps Silence to the silence category', () => {
    expect(normalizeClassification(fakeClassification(0, [['Silence', 0.95]]), 'ios').category).toBe('silence');
  });

  it('handles an empty result as unknown', () => {
    const p = normalizeClassification({ timestampMs: 1, top: [], classCount: 521 }, 'ios');
    expect(p).toMatchObject({ category: 'unknown', rawLabel: '', score: 0 });
  });

  it('rejects a wrong class count', () => {
    const raw = { ...fakeClassification(0, [['Speech', 0.9]]), classCount: 520 };
    expect(() => normalizeClassification(raw, 'ios')).toThrow(ModelContractError);
  });

  it('rejects a class-order mismatch between runtime labels and the pinned labels', () => {
    const raw = fakeClassification(0, [['Speech', 0.9]]);
    raw.top[0] = { index: 1, label: 'Speech', score: 0.9 };
    expect(() => normalizeClassification(raw, 'ios')).toThrow(/Class order mismatch/);
  });
});
