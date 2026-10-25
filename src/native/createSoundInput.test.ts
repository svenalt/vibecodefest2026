import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SoundSession } from '../core/soundSession';
import { fakeClassification, settle } from '../core/testing/fakeSoundInput';
import type { CaptureState } from '../core/types';
import { createSoundInput, NATIVE_MODULE_MISSING } from './createSoundInput';
import { fakeNative } from './testing/fakeNativeModule';

const host = vi.hoisted(() => ({ os: 'android', native: null as unknown }));

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return host.os;
    },
  },
}));
vi.mock('expo', () => ({ requireOptionalNativeModule: () => host.native }));
// expo-asset copies the bundled model into the app cache and returns that file.
vi.mock('./modelAsset', () => ({
  resolveModelPath: async () => '/data/user/0/app.soundcanvas.poc/cache/ExponentAsset-yamnet.tflite',
}));

const LISTENING_48K: Partial<CaptureState> & { status: 'listening' } = {
  status: 'listening',
  hardwareSampleRate: 48000,
  hardwareChannelCount: 1,
  analysisSampleRate: 16000,
  analysisChannelCount: 1,
};

describe('createSoundInput on Android', () => {
  beforeEach(() => {
    host.os = 'android';
    host.native = null;
  });

  it('uses the Kotlin module when it is registered', async () => {
    const fake = fakeNative();
    host.native = fake.native;
    const input = createSoundInput();
    expect(input.platform).toBe('android');

    await input.start();
    await input.stop();
    expect(fake.calls).toEqual([
      'start:/data/user/0/app.soundcanvas.poc/cache/ExponentAsset-yamnet.tflite',
      'stop',
    ]);
  });

  it('runs real native events through the shared session with platform "android"', async () => {
    const fake = fakeNative();
    host.native = fake.native;
    const session = new SoundSession(createSoundInput());
    const features: number[] = [];
    session.onFeatures((f) => features.push(f.rms));

    await session.start();
    fake.fire('onState', LISTENING_48K);
    fake.fire('onFeatures', { timestampMs: 50, rms: 0.2, peak: 0.4, bands: { low: 0.5, mid: 0.3, high: 0.2 } });
    fake.fire('onClassification', fakeClassification(975, [['Speech', 0.8], ['Music', 0.1]]));
    fake.fire('onClassification', fakeClassification(1462, [['Speech', 0.82]]));

    const snap = session.getSnapshot();
    expect(snap.capture).toMatchObject({ ...LISTENING_48K, modelClassCount: 521, error: null });
    expect(snap.tracker.current).toMatchObject({ kind: 'event', category: 'speech' });
    expect(snap.diagnostics.lastPrediction).toMatchObject({ platform: 'android', model: 'yamnet', rawLabel: 'Speech' });
    expect(features).toEqual([0.2]);
  });

  it('asks for the microphone once and never starts capture when the user declines', async () => {
    const fake = fakeNative();
    fake.setPermission('undetermined');
    fake.answerPermissionWith('denied');
    host.native = fake.native;
    const session = new SoundSession(createSoundInput());

    await session.start();
    expect(fake.calls).toEqual(['requestPermission']);
    expect(session.getSnapshot()).toMatchObject({ permission: 'denied', capture: { status: 'idle' } });

    // Denied (including "don't ask again" or revoked in Settings): no prompt loop, no capture.
    await session.start();
    expect(fake.calls).toEqual(['requestPermission']);
  });

  it('starts after the user grants the prompt', async () => {
    const fake = fakeNative();
    fake.setPermission('undetermined');
    host.native = fake.native;
    const session = new SoundSession(createSoundInput());
    await session.start();
    expect(fake.calls).toEqual([
      'requestPermission',
      'start:/data/user/0/app.soundcanvas.poc/cache/ExponentAsset-yamnet.tflite',
    ]);
    expect(session.getSnapshot().permission).toBe('granted');
  });

  it('shows a native start failure (e.g. model mismatch) as an error, not as listening', async () => {
    const fake = fakeNative();
    fake.failStartWith(new Error('YAMNet model does not match the pinned file'));
    host.native = fake.native;
    const session = new SoundSession(createSoundInput());

    await session.start();
    fake.fire('onState', { status: 'error', error: 'YAMNet model does not match the pinned file' });
    expect(session.getSnapshot()).toMatchObject({
      capture: { status: 'error' },
      error: 'YAMNet model does not match the pinned file',
    });
  });

  it('surfaces native interruptions (route change, call) after capture was released', async () => {
    const fake = fakeNative();
    host.native = fake.native;
    const session = new SoundSession(createSoundInput());
    await session.start();
    fake.fire('onState', LISTENING_48K);
    fake.fire('onState', { status: 'stopping' });
    fake.fire('onState', { status: 'idle' });
    fake.fire('onError', { message: 'The audio route changed. Start listening again.' });
    expect(session.getSnapshot()).toMatchObject({
      capture: { status: 'idle' },
      error: 'The audio route changed. Start listening again.',
    });
  });

  it('stops capture when Android reports a class list that does not match the pinned labels', async () => {
    const fake = fakeNative();
    host.native = fake.native;
    const session = new SoundSession(createSoundInput());
    await session.start();
    fake.fire('onState', LISTENING_48K);
    fake.fire('onClassification', { timestampMs: 975, classCount: 521, top: [{ index: 0, label: 'Music', score: 0.9 }] });
    await settle();
    expect(session.getSnapshot().error).toMatch(/Class order mismatch at index 0/);
    expect(fake.calls.at(-1)).toBe('stop');
  });

  it('falls back to an honest unavailable adapter without the native module (Expo Go)', async () => {
    const input = createSoundInput();
    expect(input.platform).toBe('android');
    const states: CaptureState[] = [];
    input.on('state', (s) => states.push(s));

    expect(await input.getPermission()).toBe('undetermined');
    await expect(input.requestPermission()).rejects.toThrow(NATIVE_MODULE_MISSING);
    await expect(input.start()).rejects.toThrow(NATIVE_MODULE_MISSING);
    expect(states.at(-1)).toMatchObject({ status: 'error', error: NATIVE_MODULE_MISSING });
  });

  it('tells the user why nothing listens in Expo Go instead of staying silent', async () => {
    const session = new SoundSession(createSoundInput());
    await session.start();
    expect(session.getSnapshot()).toMatchObject({
      permission: 'undetermined',
      capture: { status: 'idle' },
      error: NATIVE_MODULE_MISSING,
    });
  });
});

describe('createSoundInput on other hosts', () => {
  it('keeps using the Swift module on iOS', () => {
    host.os = 'ios';
    host.native = fakeNative().native;
    expect(createSoundInput().platform).toBe('ios');
  });

  it('reports the missing module on iOS without native code', async () => {
    host.os = 'ios';
    host.native = null;
    await expect(createSoundInput().start()).rejects.toThrow(NATIVE_MODULE_MISSING);
  });

  it('never wires a native module on web', async () => {
    host.os = 'web';
    host.native = fakeNative().native;
    await expect(createSoundInput().start()).rejects.toThrow(NATIVE_MODULE_MISSING);
  });
});
