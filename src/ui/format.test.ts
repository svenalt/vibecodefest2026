import { describe, expect, it } from 'vitest';
import { formatScore, formatSessionTime } from './format';

describe('format', () => {
  it('formats session time as m:ss', () => {
    expect(formatSessionTime(0)).toBe('0:00');
    expect(formatSessionTime(12_900)).toBe('0:12');
    expect(formatSessionTime(72_000)).toBe('1:12');
    expect(formatSessionTime(-5)).toBe('0:00');
  });

  it('formats raw scores with two decimals', () => {
    expect(formatScore(0.9123)).toBe('0.91');
  });
});
