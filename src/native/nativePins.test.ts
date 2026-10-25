import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { YAMNET_HOP_SAMPLES, YAMNET_INPUT_SAMPLES, YAMNET_NUM_CLASSES, YAMNET_SAMPLE_RATE } from '../core/yamnet/constants';

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
    expect(int('TOP_K')).toBe(10);
  });

  it('the module config autolinks the Kotlin class next to the Swift one', () => {
    const config = JSON.parse(read('modules/soundcanvas-audio/expo-module.config.json'));
    expect(config.platforms).toEqual(['apple', 'android']);
    expect(config.apple.modules).toEqual(['SoundCanvasAudioModule']);
    expect(config.android.modules).toEqual(['app.soundcanvas.audio.SoundCanvasAudioModule']);
    expect(kotlin).toMatch(/^package app\.soundcanvas\.audio$/m);
  });
});
