import { describe, expect, it } from 'vitest';
import { SoundSession } from './soundSession';
import { FakeSoundInput, gate, settle } from './testing/fakeSoundInput';
import { IDLE_CAPTURE_STATE, type Platform } from './types';

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

  it('ignores overlapping start calls while permission is pending', async () => {
    const { input, session } = setup();
    await Promise.all([session.start(), session.start(), session.start()]);
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
    await session.start();
    const seen: number[] = [];
    session.onFeatures((f) => seen.push(f.rms));
    const before = session.getSnapshot();
    input.emitFeatures({ rms: 0.5 });
    expect(seen).toEqual([0.5]);
    expect(session.getSnapshot()).toBe(before);
  });

  it('stop() during the permission prompt cancels the start', async () => {
    const { input, session } = setup();
    input.permission = 'undetermined';
    const prompt = gate();
    input.permissionGate = prompt.promise;
    const starting = session.start();
    await settle();
    await session.stop();
    prompt.open();
    await starting;
    expect(input.startCalls).toBe(0);
    expect(session.getSnapshot().permission).toBe('granted');
    expect(session.getSnapshot().capture.status).toBe('idle');
  });

  it('stop() during capture start-up releases the microphone once start-up finishes', async () => {
    const { input, session } = setup();
    const startup = gate();
    input.startGate = startup.promise;
    const starting = session.start();
    await settle();
    expect(session.getSnapshot().capture.status).toBe('starting');
    await session.stop();
    startup.open();
    await starting;
    expect(input.stopCalls).toBe(2);
    expect(session.getSnapshot().capture.status).toBe('idle');
  });

  it('a later start after a cancelled one still works', async () => {
    const { input, session } = setup();
    input.permission = 'undetermined';
    const prompt = gate();
    input.permissionGate = prompt.promise;
    const cancelled = session.start();
    await session.stop();
    prompt.open();
    await cancelled;
    await session.start();
    expect(session.getSnapshot().capture.status).toBe('listening');
  });

  it('surfaces a failing permission check as an error', async () => {
    const { input, session } = setup();
    input.getPermission = async () => {
      throw new Error('Audio session unavailable');
    };
    await session.start();
    expect(session.getSnapshot().error).toBe('Audio session unavailable');
    expect(input.startCalls).toBe(0);
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

/** REQ-011 P0-A: a fatal failure must end the session truthfully, never leave it looking healthy. */
describe('SoundSession fatal failures', () => {
  async function hearingSpeech() {
    const t = setup();
    await t.session.start();
    for (let i = 0; i < 3; i++) t.input.emitScores(i * 500, [['Speech', 0.9]]);
    expect(t.session.getSnapshot().tracker.current).toMatchObject({ kind: 'event', category: 'speech' });
    const features: number[] = [];
    t.session.onFeatures((f) => features.push(f.rms));
    return { ...t, features };
  }

  /** What an adapter still delivers after the failure: late results of the failed session. */
  function lateResults(input: FakeSoundInput) {
    input.emitScores(2000, [['Music', 0.95]]);
    input.emitScores(2500, [['Music', 0.95]]);
    input.emitFeatures({ rms: 0.9 });
  }

  it('a bare adapter error releases capture and clears the current detection', async () => {
    const { input, session, features } = await hearingSpeech();
    input.emit('error', { message: 'Inference failed: interpreter error' });
    const snap = session.getSnapshot();
    expect(input.stopCalls).toBe(1);
    expect(snap.capture.status).toBe('idle');
    expect(snap.error).toBe('Inference failed: interpreter error');
    expect(snap.tracker.current.kind).toBe('none');
    expect(snap.tracker.events.map((e) => e.category)).toEqual(['speech']); // history only

    lateResults(input);
    const after = session.getSnapshot();
    expect(after.tracker.current.kind).toBe('none');
    expect(after.tracker.events).toHaveLength(1);
    expect(after.diagnostics.inferenceCount).toBe(3);
    expect(features).toEqual([]);
  });

  it('reports `stopping`, not a healthy microphone, while the failed capture is released', async () => {
    const { input, session } = await hearingSpeech();
    const teardown = gate();
    input.stopGate = teardown.promise;
    input.emit('error', { message: 'Audio conversion failed: -50' });
    expect(session.getSnapshot().capture.status).toBe('stopping');
    expect(session.getSnapshot().tracker.current.kind).toBe('none');
    input.stopGate = null;
    teardown.open();
    await settle();
    expect(session.getSnapshot().capture.status).toBe('idle');
    expect(session.getSnapshot().error).toBe('Audio conversion failed: -50');
  });

  it("an adapter's terminal error state ends the session without a second stop", async () => {
    const { input, session, features } = await hearingSpeech();
    input.setState({ ...IDLE_CAPTURE_STATE, status: 'error', error: 'Inference failed: bad tensor' });
    expect(input.stopCalls).toBe(0);
    expect(session.getSnapshot().error).toBe('Inference failed: bad tensor');
    expect(session.getSnapshot().tracker.current.kind).toBe('none');
    lateResults(input);
    expect(session.getSnapshot().tracker.events).toHaveLength(1);
    expect(features).toEqual([]);
  });

  it('only the first failure counts; repeated errors do not stop again', async () => {
    const { input, session } = await hearingSpeech();
    input.emit('error', { message: 'Inference failed: first' });
    input.emit('error', { message: 'Inference failed: second' });
    await settle();
    expect(input.stopCalls).toBe(1);
    expect(session.getSnapshot().error).toBe('Inference failed: first');
  });

  it('an explicit start after a failure clears the error and runs exactly one new session', async () => {
    const { input, session } = await hearingSpeech();
    input.emit('error', { message: 'Inference failed' });
    await settle();
    await session.start();
    const snap = session.getSnapshot();
    expect(snap.error).toBeNull();
    expect(snap.capture.status).toBe('listening');
    expect(input.startCalls).toBe(2);
    expect(snap.tracker.events).toHaveLength(0); // a new session starts a new list
    input.emitScores(0, [['Music', 0.9]]);
    input.emitScores(500, [['Music', 0.9]]);
    expect(session.getSnapshot().tracker.current).toMatchObject({ kind: 'event', category: 'music' });
  });

  it('a retry waits for the failed session to be released before opening capture', async () => {
    const { input, session } = await hearingSpeech();
    const teardown = gate();
    input.stopGate = teardown.promise;
    input.emit('error', { message: 'Inference failed' });
    const retry = session.start();
    await settle();
    expect(input.startCalls).toBe(1);
    input.stopGate = null;
    teardown.open();
    await retry;
    expect(input.startCalls).toBe(2);
    expect(session.getSnapshot().capture.status).toBe('listening');
    expect(session.getSnapshot().error).toBeNull();
  });

  it('a late failure of an old stop cannot overwrite the retried session', async () => {
    const { input, session } = await hearingSpeech();
    const teardown = gate();
    input.stop = async () => {
      input.stopCalls++;
      await teardown.promise;
      throw new Error('late stop failure');
    };
    const stopping = session.stop();
    const retry = session.start();
    await settle();
    expect(input.startCalls).toBe(1); // still waiting for the old teardown
    teardown.open();
    await Promise.all([stopping, retry]);
    expect(input.startCalls).toBe(2);
    expect(session.getSnapshot().capture.status).toBe('listening');
    expect(session.getSnapshot().error).toBeNull();
  });

  it('an error after an explicit stop is ignored', async () => {
    const { input, session } = await hearingSpeech();
    await session.stop();
    input.emit('error', { message: 'Inference failed: late' });
    input.setState({ ...IDLE_CAPTURE_STATE, status: 'error', error: 'late' });
    expect(session.getSnapshot().error).toBeNull();
    expect(input.stopCalls).toBe(1);
  });

  it('stopping clears the current detection but keeps the timeline', async () => {
    const { session } = await hearingSpeech();
    await session.stop();
    expect(session.getSnapshot().tracker.current.kind).toBe('none');
    expect(session.getSnapshot().tracker.events).toHaveLength(1);
  });
});

