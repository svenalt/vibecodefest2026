import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  YAMNET_HOP_SAMPLES,
  YAMNET_INPUT_SAMPLES,
  YAMNET_NUM_CLASSES,
  YAMNET_SAMPLE_RATE,
} from './constants';
import { YAMNET_LABELS } from './labels';
import { SILENCE_INDEX, TAXONOMY, categoryForIndex } from './taxonomy';

/** Parses the pinned CSV independently of the generator script. */
function readCsvLabels(): string[] {
  const rows = readFileSync(new URL('../../../assets/model/yamnet_class_map.csv', import.meta.url), 'utf8')
    .trim()
    .split('\n')
    .slice(1);
  return rows.map((row) => {
    const afterMid = row.replace(/^\d+,[^,]+,/, '').replace(/\r$/, '');
    return afterMid.startsWith('"') ? afterMid.slice(1, -1) : afterMid;
  });
}

describe('YAMNet model contract', () => {
  it('uses 15,600 samples at 16 kHz (0.975 s) and 521 classes', () => {
    expect(YAMNET_SAMPLE_RATE).toBe(16000);
    expect(YAMNET_INPUT_SAMPLES).toBe(15600);
    expect(YAMNET_INPUT_SAMPLES / YAMNET_SAMPLE_RATE).toBeCloseTo(0.975, 6);
    expect(YAMNET_NUM_CLASSES).toBe(521);
  });

  it('hops about every 0.49 s (inside the 0.48-0.5 s target)', () => {
    const hopSeconds = YAMNET_HOP_SAMPLES / YAMNET_SAMPLE_RATE;
    expect(hopSeconds).toBeGreaterThanOrEqual(0.48);
    expect(hopSeconds).toBeLessThanOrEqual(0.5);
  });

  it('bundled label list matches the pinned CSV in count and order', () => {
    const csv = readCsvLabels();
    expect(csv).toHaveLength(YAMNET_NUM_CLASSES);
    expect(YAMNET_LABELS).toHaveLength(YAMNET_NUM_CLASSES);
    expect([...YAMNET_LABELS]).toEqual(csv);
  });
});

describe('taxonomy', () => {
  it('every mapped index carries the label YAMNet has at that index', () => {
    for (const entry of TAXONOMY) {
      expect(YAMNET_LABELS[entry.index], `index ${entry.index}`).toBe(entry.label);
    }
    expect(YAMNET_LABELS[SILENCE_INDEX]).toBe('Silence');
  });

  it('has no duplicate indices and covers the six demo categories', () => {
    const indices = TAXONOMY.map((e) => e.index);
    expect(new Set(indices).size).toBe(indices.length);
    expect(new Set(TAXONOMY.map((e) => e.category))).toEqual(
      new Set(['speech', 'music', 'dog_bark', 'applause', 'rain', 'bell']),
    );
  });

  it('does not surface unrelated classes', () => {
    expect(categoryForIndex(YAMNET_LABELS.indexOf('Inside, small room'))).toBeUndefined();
    expect(categoryForIndex(YAMNET_LABELS.indexOf('Siren'))).toBeUndefined();
    expect(categoryForIndex(SILENCE_INDEX)).toBe('silence');
  });
});
