import { describe, expect, it } from 'vitest';
import { SoundSession } from '../core/soundSession';
import { fakeClassification } from '../core/testing/fakeSoundInput';
import { NativeSoundInput, type SoundCanvasAudioModule } from './nativeSoundInput';

/** Stand-in for the Swift/Kotlin module: records calls and lets a test fire native events. */
function fakeNative() {
  const listeners = new Map<string, Array<(p: any) => void>>();
  const calls: string[] = [];
  let permission: 'undetermined' | 'granted' | 'denied' = 'granted';
  const native = {
    getPermissionStatus: async () => permission,
    requestPermission: async () => (permission = 'granted'),
    start: async (modelPath: string) => {
      calls.push(`start:${modelPath}`);
    },
    stop: async () => {
      calls.push('stop');
    },
    addListener(event: string, listener: (p: any) => void) {
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
      return { remove: () => listeners.set(event, (listeners.get(event) ?? []).filter((l) => l !== listener)) };
    },
  } as unknown as SoundCanvasAudioModule;
  const fire = (event: string, payload: unknown) => listeners.get(event)?.forEach((l) => l(payload));
  return { native, calls, fire, setPermission: (p: typeof permission) => (permission = p) };
}

describe('NativeSoundInput', () => {
  it('resolves the model path and passes it to the native start', async () => {
    const { native, calls } = fakeNative();
    const input = new NativeSoundInput('ios', native, async () => '/bundle/yamnet.tflite');
    await input.start();
    await input.stop();
    expect(calls).toEqual(['start:/bundle/yamnet.tflite', 'stop']);
  });

  it('maps native state events and learns the model class count from results', () => {
    const { native, fire } = fakeNative();
    const input = new NativeSoundInput('ios', native, async () => '');
    const states: any[] = [];
    input.on('state', (s) => states.push(s));

    fire('onState', {
      status: 'listening',
      hardwareSampleRate: 48000,
      hardwareChannelCount: 1,
      analysisSampleRate: 16000,
      analysisChannelCount: 1,
      error: null,
    });
    fire('onClassification', fakeClassification(10, [['Speech', 0.9]]));

    expect(states.at(-1)).toMatchObject({
      status: 'listening',
      hardwareSampleRate: 48000,
      analysisSampleRate: 16000,
      modelClassCount: 521,
    });

    fire('onState', { status: 'idle' });
    expect(states.at(-1)).toMatchObject({ status: 'idle', modelClassCount: null, hardwareSampleRate: null });
  });

  it('drives a SoundSession end to end through the native contract', async () => {
    const { native, fire } = fakeNative();
    const input = new NativeSoundInput('ios', native, async () => '/m.tflite');
    const session = new SoundSession(input);
    await session.start();
    fire('onState', { status: 'listening', hardwareSampleRate: 44100, hardwareChannelCount: 2 });
    fire('onClassification', fakeClassification(0, [['Music', 0.9]]));
    fire('onClassification', fakeClassification(490, [['Music', 0.9]]));
    expect(session.getSnapshot().tracker.current).toMatchObject({ kind: 'event', category: 'music' });
    expect(session.getSnapshot().diagnostics.lastPrediction?.platform).toBe('ios');
  });

  it('forwards native errors', () => {
    const { native, fire } = fakeNative();
    const input = new NativeSoundInput('ios', native, async () => '');
    const seen: string[] = [];
    input.on('error', (e) => seen.push(e.message));
    fire('onError', { message: 'Audio route changed' });
    expect(seen).toEqual(['Audio route changed']);
  });

  it('stops receiving native events after dispose', () => {
    const { native, fire } = fakeNative();
    const input = new NativeSoundInput('ios', native, async () => '');
    const seen: unknown[] = [];
    input.on('features', (f) => seen.push(f));
    input.dispose();
    fire('onFeatures', { timestampMs: 0, rms: 0.1, peak: 0.1, bands: { low: 0, mid: 0, high: 0 } });
    expect(seen).toEqual([]);
  });
});
