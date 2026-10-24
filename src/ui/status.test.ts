import { describe, expect, it } from 'vitest';

import type { Current } from '../core/eventTracker';
import type { SessionSnapshot } from '../core/soundSession';
import { IDLE_CAPTURE_STATE, type CaptureStatus, type PermissionStatus } from '../core/types';
import { captionKey, micState, soundSummary, type MicKind } from './status';

function snap(status: CaptureStatus, permission: PermissionStatus = 'granted', error: string | null = null): SessionSnapshot {
  return {
    permission,
    capture: { ...IDLE_CAPTURE_STATE, status },
    tracker: { current: { kind: 'none', sinceMs: 0 }, events: [], lastPrediction: null },
    diagnostics: {
      inferenceCount: 0,
      firstResultLatencyMs: null,
      lastIntervalMs: null,
      meanIntervalMs: null,
      lastPrediction: null,
    },
    error,
  };
}

const speech: Current = { kind: 'event', category: 'speech', score: 0.83, rawLabel: 'Conversation', sinceMs: 4000 };
const none: Current = { kind: 'none', sinceMs: 0 };
const quiet: Current = { kind: 'silence', sinceMs: 1000 };

describe('micState', () => {
  it('reports ON only while capture is listening', () => {
    expect(micState(snap('listening'), false).kind).toBe('on');
    expect(micState(snap('idle'), false).kind).toBe('off');
    expect(micState(snap('starting'), false).kind).toBe('starting');
    expect(micState(snap('idle'), true).kind).toBe('starting');
    expect(micState(snap('stopping'), true).kind).toBe('stopping');
  });

  it('distinguishes blocked permission from capture errors', () => {
    expect(micState(snap('idle', 'denied'), false)).toEqual({ kind: 'blocked', label: 'Microphone blocked' });
    expect(micState(snap('error'), false).kind).toBe('error');
    expect(micState(snap('idle', 'granted', 'Model failed'), false).kind).toBe('error');
  });
});

describe('soundSummary', () => {
  it('names a real detection without raw labels or scores', () => {
    const s = soundSummary('on', speech, true);
    expect(s).toMatchObject({ category: 'speech', title: 'Speech', detail: 'Detected just now', tone: 'event' });
    const text = `${s.title} ${s.detail}`;
    expect(text).not.toMatch(/Conversation|0\.8|score|confiden|probab|%/i);
  });

  it('never shows a detected category unless the microphone is on', () => {
    const offKinds: MicKind[] = ['off', 'starting', 'stopping', 'blocked', 'error'];
    for (const mic of offKinds) {
      const s = soundSummary(mic, speech, true);
      expect(s.category).toBeNull();
      expect(s.tone).not.toBe('event');
      expect(s.title).not.toBe('Speech');
    }
  });

  it('treats quiet and unknown as calm listening states, not warnings or detections', () => {
    expect(soundSummary('on', quiet, true)).toMatchObject({ category: 'silence', tone: 'calm' });
    expect(soundSummary('on', none, true)).toMatchObject({
      category: 'unknown',
      title: 'Listening for sounds',
      detail: 'Nothing recognized right now',
      tone: 'calm',
    });
    expect(soundSummary('on', none, false).detail).toBe('First result in about a second');
  });

  it('makes blocked and error states actionable alerts', () => {
    expect(soundSummary('blocked', none, false)).toMatchObject({ tone: 'alert', title: 'Microphone blocked' });
    expect(soundSummary('error', none, false).tone).toBe('alert');
    expect(soundSummary('off', none, false)).toMatchObject({ tone: 'off', title: 'Not listening' });
  });
});

describe('captionKey', () => {
  it('produces no caption for silence, unknown or a stopped microphone', () => {
    expect(captionKey(true, none)).toBeNull();
    expect(captionKey(true, quiet)).toBeNull();
    expect(captionKey(false, speech)).toBeNull();
  });

  it('is stable while the same detection continues and changes on a new one', () => {
    const k1 = captionKey(true, speech);
    expect(k1).not.toBeNull();
    expect(captionKey(true, { ...speech, score: 0.6, rawLabel: 'Speech' })).toBe(k1);
    expect(captionKey(true, { ...speech, category: 'music' })).not.toBe(k1);
    // Same category confirmed again after it lapsed counts as a new detection.
    expect(captionKey(true, { ...speech, sinceMs: 9000 })).not.toBe(k1);
  });
});
