import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  YAMNET_HOP_SAMPLES,
  YAMNET_INPUT_SAMPLES,
  YAMNET_NUM_CLASSES,
  YAMNET_SAMPLE_RATE,
  YAMNET_TOP_K,
} from './constants';
import { YAMNET_LABELS } from './labels';
import {
  FAMILY_DISPLAY,
  GROUP_ORDER,
  SILENCE_INDEX,
  TAXONOMY,
  TAXONOMY_VERSION,
  VISUAL_FAMILIES,
  classInfo,
  defaultDisplay,
} from './taxonomy';

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

describe('taxonomy (REQ-012)', () => {
  const byLabel = (label: string) => TAXONOMY[YAMNET_LABELS.indexOf(label)]!;

  it('is versioned and covers every model output 0..520 exactly once, in order', () => {
    expect(TAXONOMY_VERSION).toBe(2);
    expect(TAXONOMY).toHaveLength(YAMNET_NUM_CLASSES);
    TAXONOMY.forEach((entry, i) => expect(entry.index).toBe(i));
    expect(new Set(TAXONOMY.map((e) => e.index)).size).toBe(YAMNET_NUM_CLASSES);
    expect(classInfo(-1)).toBeUndefined();
    expect(classInfo(YAMNET_NUM_CLASSES)).toBeUndefined();
  });

  it('carries the exact pinned raw label at every index (CSV order, no drift)', () => {
    const csv = readCsvLabels();
    TAXONOMY.forEach((entry, i) => expect(entry.label, `index ${i}`).toBe(csv[i]));
  });

  it('uses only the declared families, each with a name, and every family is used', () => {
    expect(new Set(TAXONOMY.map((e) => e.family))).toEqual(new Set(VISUAL_FAMILIES));
    for (const f of VISUAL_FAMILIES) expect(FAMILY_DISPLAY[f]).toMatch(/^[A-Z][a-z ]+$/);
  });

  it('keeps every subtype group within one family, with a stable order', () => {
    const familyOf = new Map<string, string>();
    for (const e of TAXONOMY) {
      expect(familyOf.get(e.group) ?? e.family, e.label).toBe(e.family);
      familyOf.set(e.group, e.family);
      expect(GROUP_ORDER.has(e.group), e.group).toBe(true);
    }
  });

  it('handles silence explicitly and keeps room/recording context out of the sounds', () => {
    expect(YAMNET_LABELS[SILENCE_INDEX]).toBe('Silence');
    expect(TAXONOMY.filter((e) => e.role === 'silence').map((e) => e.index)).toEqual([SILENCE_INDEX]);
    expect(
      TAXONOMY.filter((e) => e.role === 'context')
        .map((e) => e.label)
        .sort(),
    ).toEqual(
      [
        'Echo',
        'Environmental noise',
        'Field recording',
        'Inside, large room or hall',
        'Inside, public space',
        'Inside, small room',
        'Noise',
        'Outside, rural or natural',
        'Outside, urban or manmade',
        'Reverberation',
        'Sidetone',
      ].sort(),
    );
    // Everything else is a sound that can be shown: 509 of 521.
    expect(TAXONOMY.filter((e) => e.role === 'sound')).toHaveLength(509);
  });

  it('keeps the intuitive names and visual families of the original six sounds', () => {
    expect(byLabel('Speech')).toMatchObject({ display: 'Speech', family: 'voice', group: 'speech' });
    expect(byLabel('Conversation')).toMatchObject({ family: 'voice', group: 'speech' });
    expect(byLabel('Music')).toMatchObject({ display: 'Music', family: 'music', group: 'music' });
    expect(byLabel('Bark')).toMatchObject({ display: 'Dog barking', family: 'animals', group: 'dog' });
    expect(byLabel('Dog')).toMatchObject({ display: 'Dog', group: 'dog' });
    expect(byLabel('Applause')).toMatchObject({ display: 'Applause', family: 'people', group: 'applause' });
    expect(byLabel('Clapping').group).toBe('applause');
    expect(byLabel('Rain')).toMatchObject({ display: 'Rain', family: 'nature', group: 'rain' });
    expect(byLabel('Rain on surface').display).toBe('Rain');
    expect(byLabel('Bell')).toMatchObject({ display: 'Bell', family: 'signals', group: 'bell' });
    expect(byLabel('Church bell').group).toBe('bell');
  });

  it('merges parents, children and synonyms into one sound', () => {
    for (const label of ['Musical instrument', 'Guitar', 'Piano', 'Jazz', 'Singing', 'Choir']) {
      expect(byLabel(label).group, label).toBe('music');
    }
    for (const label of ['Bark', 'Howl', 'Bow-wow', 'Canidae, dogs, wolves']) expect(byLabel(label).group).toBe('dog');
    for (const label of ['Police car (siren)', 'Ambulance (siren)', 'Siren', 'Civil defense siren']) {
      expect(byLabel(label).group).toBe('siren');
    }
    expect(byLabel('Animal').umbrella).toBe(true);
    expect(byLabel('Vehicle').umbrella).toBe(true);
    expect(byLabel('Dog').umbrella).toBe(false);
  });

  it('never shows opaque AudioSet strings: short plain names, no commas or parentheses', () => {
    for (const e of TAXONOMY) {
      expect(e.display, e.label).toMatch(/^[A-Z][A-Za-z&' -]*$/);
      expect(e.display.length, e.label).toBeLessThanOrEqual(22);
    }
    expect(defaultDisplay('Fly, housefly')).toBe('Fly');
    expect(defaultDisplay('Zipper (clothing)')).toBe('Zipper');
  });

  it('does not turn sensitive classes into strong real-world claims', () => {
    expect(byLabel('Gunshot, gunfire').display).toBe('Loud bang');
    expect(byLabel('Machine gun').display).toBe('Rapid bangs');
    expect(byLabel('Explosion').display).toBe('Loud bang');
    for (const label of ['Police car (siren)', 'Ambulance (siren)', 'Fire engine, fire truck (siren)']) {
      expect(byLabel(label).display).toBe('Siren');
    }
    expect(byLabel('Smoke detector, smoke alarm').display).toBe('Alarm');
    expect(byLabel('Heart murmur').display).toBe('Heartbeat');
    expect(byLabel("Dental drill, dentist's drill").display).toBe('Drill');
    for (const label of ['Christian music', 'Music of Africa', 'Music of Asia', 'Sad music', 'Angry music']) {
      expect(byLabel(label).display, label).toBe('Music');
    }
    expect(byLabel('Snake').display).toBe('Hissing');
  });

  it('native adapters send the top 10', () => {
    expect(YAMNET_TOP_K).toBe(10);
  });
});
