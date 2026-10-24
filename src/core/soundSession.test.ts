import { describe, expect, it } from 'vitest';
import { SoundSession } from './soundSession';
import { FakeSoundInput } from './testing/fakeSoundInput';
import type { Platform } from './types';

function setup(platform: Platform = 'ios') {
  const input = new FakeSoundInput(platform);
  let now = 1_000;
  const session = new SoundSession(input, undefined, () => now);
  return { input, session, advance: (ms: number) => (now += ms) };
}

describe.each<Platform>(['ios', 'android'])('SoundSession on %s adapter', (platform) => {
  it('shares identical behaviour across platforms: speech then music', async () => {
    const { input, session, advance } = setup(platform);
    await session.start();
    expect(session.getSnapshot().capture.status).toBe('listening');

    for (const label of ['Speech', 'Speech', 'Music', 'Music']) {
      advance(490);
      input.emitScores(0, [[label, 0.9], ['Inside, small room', 0.3]]);
    }

    const { tracker, diagnostics } = session.getSnapshot();
    expect(tracker.current).toMatchObject({ kind: 'event', category: 'music' });
    expect(tracker.events.map((e) => e.category)).toEqual(['music', 'speech']);
    expect(diagnostics.lastPrediction).toMatchObject({ platform, model: 'yamnet', category: 'music' });
  });
});

describe('SoundSession lifecycle', () => {
  it('requests permission on first start and starts capture when granted', async () => {
    const { input, session } = setup();
    input.permission = 'undetermined';
    await session.start();
    expect(session.getSnapshot().permission).toBe('granted');
    expect(input.startCalls).toBe(1);
  });

  it('does not touch the microphone when permission is denied', async () => {
    const { input, session } = setup();
    input.permission = 'undetermined';
    input.nextPermissionAnswer = 'denied';
    await session.start();
    expect(session.getSnapshot().permission).toBe('denied');
    expect(input.startCalls).toBe(0);
    expect(session.getSnapshot().capture.status).toBe('idle');
    expect(session.getSnapshot().error).toBeNull();
  });

  it('does not start when permission was revoked after an earlier grant', async () => {
    const { input, session } = setup();
    await session.start();
    await session.stop();
    input.permission = 'denied';
    await session.start();
    expect(input.startCalls).toBe(1);
    expect(session.getSnapshot().permission).toBe('denied');
  });

  it('stop releases capture and the snapshot reflects idle', async () => {
    const { input, session } = setup();
    await session.start();
    await session.stop();
    expect(input.stopCalls).toBe(1);
    expect(session.getSnapshot().capture.status).toBe('idle');
  });

  it('ignores a second start while already listening', async () => {
    const { input, session } = setup();
    await session.start();
    await session.start();
    expect(input.startCalls).toBe(1);
  });

  it('clears the timeline when a new session starts', async () => {
    const { input, session } = setup();
    await session.start();
    input.emitScores(0, [['Applause', 0.9]]);
    input.emitScores(0, [['Applause', 0.9]]);
    expect(session.getSnapshot().tracker.events).toHaveLength(1);
    await session.stop();
    await session.start();
    expect(session.getSnapshot().tracker.events).toHaveLength(0);
  });

  it('keeps "no confident event" distinct from an error', async () => {
    const { input, session } = setup();
    await session.start();
    input.emitScores(0, [['Siren', 0.9]]);
    input.emitScores(0, [['Siren', 0.9]]);
    const snap = session.getSnapshot();
    expect(snap.tracker.current.kind).toBe('none');
    expect(snap.error).toBeNull();
  });

  it('surfaces native errors without claiming a sound', async () => {
    const { input, session } = setup();
    await session.start();
    input.emit('error', { message: 'Audio route changed' });
    expect(session.getSnapshot().error).toBe('Audio route changed');
  });

  it('stops and reports an error when the model class order does not match', async () => {
    const { input, session } = setup();
    await session.start();
    input.emit('classification', {
      timestampMs: 1,
      classCount: 521,
      top: [{ index: 3, label: 'Speech', score: 0.9 }],
    });
    await Promise.resolve();
    expect(session.getSnapshot().error).toMatch(/Class order mismatch/);
    expect(input.stopCalls).toBe(1);
  });

  it('measures first-result latency and update interval', async () => {
    const { input, session, advance } = setup();
    await session.start();
    advance(1500);
    input.emitScores(0, [['Speech', 0.9]]);
    advance(490);
    input.emitScores(0, [['Speech', 0.9]]);
    advance(510);
    input.emitScores(0, [['Speech', 0.9]]);
    const d = session.getSnapshot().diagnostics;
    expect(d.inferenceCount).toBe(3);
    expect(d.firstResultLatencyMs).toBe(1500);
    expect(d.lastIntervalMs).toBe(510);
    expect(d.meanIntervalMs).toBe(500);
  });

  it('forwards features without putting them in the React snapshot', async () => {
    const { input, session } = setup();
    const seen: number[] = [];
    session.onFeatures((f) => seen.push(f.rms));
    const before = session.getSnapshot();
    input.emitFeatures({ rms: 0.5 });
    expect(seen).toEqual([0.5]);
    expect(session.getSnapshot()).toBe(before);
  });

  it('notifies subscribers and stops after dispose', async () => {
    const { input, session } = setup();
    let calls = 0;
    session.subscribe(() => calls++);
    await session.start();
    expect(calls).toBeGreaterThan(0);
    await session.dispose();
    const after = calls;
    input.emitScores(0, [['Speech', 0.9]]);
    expect(calls).toBe(after);
    expect(input.stopCalls).toBe(1);
  });
});
