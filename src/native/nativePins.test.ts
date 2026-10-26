import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { normalizeClassification } from '../core/normalize';
import {
  YAMNET_HOP_SAMPLES,
  YAMNET_INPUT_SAMPLES,
  YAMNET_NUM_CLASSES,
  YAMNET_SAMPLE_RATE,
  YAMNET_TOP_K,
} from '../core/yamnet/constants';
import { YAMNET_LABELS } from '../core/yamnet/labels';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

/** The Kotlin adapter checks the model and labels itself; its pins must equal the repo's. */
describe('Android native pins', () => {
  const kotlin = read('modules/soundcanvas-audio/android/src/main/java/app/soundcanvas/audio/YamnetContract.kt');
  const pinned = read('scripts/verify-model.mjs');
  const constant = (name: string) => new RegExp(`const val ${name} = "?([\\w_]+)"?`).exec(kotlin)?.[1];

  it('model and class-map SHA-256 match scripts/verify-model.mjs', () => {
    const shaFor = (file: string) =>
      new RegExp(`'${file.replace('.', '\\.')}': \\{[^}]*sha256: '([0-9a-f]{64})'`).exec(pinned)?.[1];
    expect(constant('MODEL_SHA256')).toBe(shaFor('assets/model/yamnet.tflite'));
    expect(constant('CLASS_MAP_SHA256')).toBe(shaFor('assets/model/yamnet_class_map.csv'));
  });

  it('window, hop, rate and class count match the shared constants', () => {
    const int = (name: string) => Number(constant(name)?.replace(/_/g, ''));
    expect(int('SAMPLE_RATE')).toBe(YAMNET_SAMPLE_RATE);
    expect(int('WINDOW_SAMPLES')).toBe(YAMNET_INPUT_SAMPLES);
    expect(int('HOP_SAMPLES')).toBe(YAMNET_HOP_SAMPLES);
    expect(int('NUM_CLASSES')).toBe(YAMNET_NUM_CLASSES);
    expect(int('FEATURE_WINDOW_SAMPLES')).toBe(800);
    expect(int('TOP_K')).toBe(YAMNET_TOP_K);
  });

  it('the module config autolinks the Kotlin class next to the Swift one', () => {
    const config = JSON.parse(read('modules/soundcanvas-audio/expo-module.config.json'));
    expect(config.platforms).toEqual(['apple', 'android']);
    expect(config.apple.modules).toEqual(['SoundCanvasAudioModule']);
    expect(config.android.modules).toEqual(['app.soundcanvas.audio.SoundCanvasAudioModule']);
    expect(kotlin).toMatch(/^package app\.soundcanvas\.audio$/m);
  });
});

/** REQ-012: both adapters send the same top-K, chosen by the same rule, from the same output. */
describe('top-K parity (iOS, Android, JS)', () => {
  const swift = read('modules/soundcanvas-audio/ios/YamnetAudit.swift');
  const cases = read('modules/soundcanvas-audio/test-fixtures/topk-parity.txt')
    .split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const [name, expected, scores] = l.split('|');
      return { name: name!, expected: expected!.split(',').map(Number), scores: scores!.split(',').map(Number) };
    });

  it('Swift pins the same class count and top-K as Kotlin and JS', () => {
    expect(Number(/static let numClasses = (\d+)/.exec(swift)?.[1])).toBe(YAMNET_NUM_CLASSES);
    expect(Number(/static let topK = (\d+)/.exec(swift)?.[1])).toBe(YAMNET_TOP_K);
    expect(read('modules/soundcanvas-audio/ios/AudioPipeline.swift')).toMatch(/topK: YamnetContract\.topK/);
  });

  it('Swift and Kotlin audit the full output and break ties by lower index', () => {
    expect(swift).toMatch(/\$0\.score != \$1\.score \? \$0\.score > \$1\.score : \$0\.index < \$1\.index/);
    expect(swift).toMatch(/isFinite/);
    const kotlin = read('modules/soundcanvas-audio/android/src/main/java/app/soundcanvas/audio/YamnetContract.kt');
    expect(kotlin).toMatch(/compareByDescending<ClassScore> \{ it\.score \}\.thenBy \{ it\.index \}/);
  });

  it('the shared cases agree with the JS ordering rule and survive normalization unchanged', () => {
    expect(cases.map((c) => c.name)).toEqual(['all_equal', 'quantized_ties', 'speech_and_music', 'pink_noise', 'silence']);
    for (const c of cases) {
      expect(c.scores).toHaveLength(YAMNET_NUM_CLASSES);
      const ranked = c.scores
        .map((score, index) => ({ index, score }))
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .slice(0, YAMNET_TOP_K);
      expect(ranked.map((r) => r.index), c.name).toEqual(c.expected);
      // What an adapter would send, in a scrambled order: JS restores the same order.
      const top = [...ranked].reverse().map(({ index, score }) => ({ index, label: YAMNET_LABELS[index]!, score }));
      const p = normalizeClassification({ timestampMs: 0, classCount: YAMNET_NUM_CLASSES, top }, 'ios');
      expect(p.candidates.map((x) => x.index), c.name).toEqual(c.expected);
    }
  });
});
