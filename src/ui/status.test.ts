import { describe, expect, it } from 'vitest';

import type { Current } from '../core/eventTracker';
import type { SessionSnapshot } from '../core/soundSession';
import { IDLE_CAPTURE_STATE, type CaptureStatus, type PermissionStatus } from '../core/types';
import { immersiveCard, listeningHint, micState, saveNotice, soundSummary, type MicKind } from './status';

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

  it('a failure is never shown as a healthy microphone, even before capture reports stopping', () => {
    expect(micState(snap('listening', 'granted', 'Inference failed'), false).kind).toBe('error');
    expect(micState(snap('stopping', 'granted', 'Inference failed'), true).kind).toBe('error');
    const card = immersiveCard('sounds', micState(snap('listening', 'granted', 'Inference failed'), false).kind, speech, true);
    expect(card).toMatchObject({ category: null, title: 'Listening stopped', tone: 'alert' });
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

describe('immersiveCard', () => {
  const music: Current = { kind: 'event', category: 'music', score: 0.7, rawLabel: 'Music', sinceMs: 9000 };

  it('Pure Art never shows a card, whatever is heard', () => {
    for (const cur of [speech, quiet, none]) expect(immersiveCard('art', 'on', cur, true)).toBeNull();
    expect(immersiveCard('art', 'blocked', none, false)).toBeNull();
  });

  it('Art + Sounds shows the current sound at once, with no tap or new event needed', () => {
    // Entering (or switching to) Art + Sounds while a sound is already confirmed.
    expect(immersiveCard('sounds', 'on', speech, true)).toMatchObject({ category: 'speech', title: 'Speech', tone: 'event' });
    // And with nothing confirmed yet: the listening status, never an empty slot.
    expect(immersiveCard('sounds', 'on', none, false)).toMatchObject({ title: 'Listening for sounds', tone: 'calm' });
  });

  it('a newly confirmed sound replaces the previous one', () => {
    expect(immersiveCard('sounds', 'on', speech, true)?.title).toBe('Speech');
    expect(immersiveCard('sounds', 'on', music, true)).toMatchObject({ category: 'music', title: 'Music', tone: 'event' });
  });

  it('silence, unknown, stopped or blocked never leave a stale detection on screen', () => {
    expect(immersiveCard('sounds', 'on', quiet, true)).toMatchObject({ category: 'silence', tone: 'calm' });
    expect(immersiveCard('sounds', 'on', none, true)).toMatchObject({ category: 'unknown', tone: 'calm' });
    for (const mic of ['off', 'starting', 'stopping', 'blocked', 'error'] as MicKind[]) {
      const card = immersiveCard('sounds', mic, speech, true);
      expect(card).not.toBeNull();
      expect(card!.tone).not.toBe('event');
      expect(card!.title).not.toBe('Speech');
    }
  });
});

/** REQ-011 P1-C: never claim a Stop survives a restart before it is stored. */
describe('listening persistence copy', () => {
  it('promises a lasting Stop only once it is saved', () => {
    expect(listeningHint(false, false, 'saved')).toMatch(/stays off, even after you leave or restart/);
    for (const save of ['saving', 'failed'] as const) {
      expect(listeningHint(false, false, save)).not.toMatch(/restart|stays off/);
    }
    expect(listeningHint(false, false, 'saving')).toMatch(/Saving/);
  });

  it('does not call a failed or interrupted session "off"', () => {
    expect(listeningHint(false, true, 'saved')).toMatch(/not running right now/);
    expect(listeningHint(true, true, 'failed')).toMatch(/Listening is on/);
  });

  it('explains an unsaved Stop plainly, and nothing once saved', () => {
    expect(saveNotice('failed', false, true)).toBe(
      'Listening is stopped, but this choice could not be saved for the next launch.',
    );
    expect(saveNotice('failed', true, false)).toMatch(/Listening is on, but/);
    expect(saveNotice('failed', false, false)).toBe('Your settings could not be saved for the next launch.');
    expect(saveNotice('saving', false, true)).toBeNull();
    expect(saveNotice('saved', false, true)).toBeNull();
  });
});

