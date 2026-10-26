import { describe, expect, it } from 'vitest';

import type { ActiveSound, Current } from '../core/eventTracker';
import type { SessionSnapshot } from '../core/soundSession';
import { IDLE_CAPTURE_STATE, type CaptureStatus, type PermissionStatus } from '../core/types';
import {
  immersiveCard,
  joinLabels,
  listeningHint,
  micState,
  saveNotice,
  soundSummary,
  summaryAccessibilityLabel,
  type MicKind,
} from './status';

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

const active = (label: string, family: ActiveSound['family'], rawLabel = label): ActiveSound => ({
  group: label.toLowerCase(),
  index: 0,
  rawLabel,
  label,
  family,
  score: 0.83,
  sinceMs: 4000,
});
const speech: Current = { kind: 'event', primary: active('Speech', 'voice', 'Conversation'), secondary: [], sinceMs: 4000 };
const scene: Current = {
  kind: 'event',
  primary: active('Speech', 'voice'),
  secondary: [active('Music', 'music'), active('Traffic', 'vehicles', 'Traffic noise, roadway noise')],
  sinceMs: 4000,
};
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
    expect(card).toMatchObject({ icon: null, title: 'Listening stopped', tone: 'alert', also: [] });
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
    expect(s).toMatchObject({ icon: 'voice', title: 'Speech', detail: 'Detected just now', tone: 'event', also: [] });
    const text = `${s.title} ${s.detail}`;
    expect(text).not.toMatch(/Conversation|0\.8|score|confiden|probab|%/i);
  });

  it('shows the primary sound as the title and up to two others alongside (REQ-012)', () => {
    const s = soundSummary('on', scene, true);
    expect(s).toMatchObject({ icon: 'voice', title: 'Speech', tone: 'event' });
    expect(s.also).toEqual([
      { label: 'Music', family: 'music' },
      { label: 'Traffic', family: 'vehicles' },
    ]);
    expect(summaryAccessibilityLabel(s)).toBe('Current sound: Speech. Also: Music and Traffic. Detected just now.');
    expect(summaryAccessibilityLabel(s)).not.toMatch(/roadway|0\.8|score|probab/i);
  });

  it('never shows a detected sound unless the microphone is on', () => {
    const offKinds: MicKind[] = ['off', 'starting', 'stopping', 'blocked', 'error'];
    for (const mic of offKinds) {
      const s = soundSummary(mic, scene, true);
      expect(s.icon).toBeNull();
      expect(s.tone).not.toBe('event');
      expect(s.title).not.toBe('Speech');
      expect(s.also).toEqual([]);
    }
  });

  it('treats quiet and unknown as distinct calm listening states, not warnings or detections', () => {
    expect(soundSummary('on', quiet, true)).toMatchObject({ icon: 'silence', title: 'Quiet', tone: 'calm', also: [] });
    expect(soundSummary('on', none, true)).toMatchObject({
      icon: 'unknown',
      title: 'Listening for sounds',
      detail: 'No confident sound right now',
      tone: 'calm',
      also: [],
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
  const music: Current = { kind: 'event', primary: active('Music', 'music'), secondary: [], sinceMs: 9000 };

  it('Pure Art never shows a card, whatever is heard', () => {
    for (const cur of [speech, quiet, none]) expect(immersiveCard('art', 'on', cur, true)).toBeNull();
    expect(immersiveCard('art', 'blocked', none, false)).toBeNull();
  });

  it('Art + Sounds shows the current sound at once, with no tap or new event needed', () => {
    // Entering (or switching to) Art + Sounds while a sound is already confirmed.
    expect(immersiveCard('sounds', 'on', speech, true)).toMatchObject({ icon: 'voice', title: 'Speech', tone: 'event' });
    // And with nothing confirmed yet: the listening status, never an empty slot.
    expect(immersiveCard('sounds', 'on', none, false)).toMatchObject({ title: 'Listening for sounds', tone: 'calm' });
  });

  it('a newly confirmed sound replaces the previous one', () => {
    expect(immersiveCard('sounds', 'on', speech, true)?.title).toBe('Speech');
    expect(immersiveCard('sounds', 'on', music, true)).toMatchObject({ icon: 'music', title: 'Music', tone: 'event' });
  });

  it('Art + Sounds shows the secondary sounds directly; Pure Art stays art-only', () => {
    expect(immersiveCard('sounds', 'on', scene, true)?.also.map((a) => a.label)).toEqual(['Music', 'Traffic']);
    expect(immersiveCard('art', 'on', scene, true)).toBeNull();
  });

  it('silence, unknown, stopped or blocked never leave a stale detection on screen', () => {
    expect(immersiveCard('sounds', 'on', quiet, true)).toMatchObject({ icon: 'silence', tone: 'calm' });
    expect(immersiveCard('sounds', 'on', none, true)).toMatchObject({ icon: 'unknown', tone: 'calm' });
    for (const mic of ['off', 'starting', 'stopping', 'blocked', 'error'] as MicKind[]) {
      const card = immersiveCard('sounds', mic, scene, true);
      expect(card).not.toBeNull();
      expect(card!.tone).not.toBe('event');
      expect(card!.title).not.toBe('Speech');
      expect(card!.also).toEqual([]);
    }
  });
});

describe('joinLabels', () => {
  it('reads naturally for one, two and three sounds', () => {
    expect(joinLabels([])).toBe('');
    expect(joinLabels(['Speech'])).toBe('Speech');
    expect(joinLabels(['Speech', 'Music'])).toBe('Speech and Music');
    expect(joinLabels(['Speech', 'Music', 'Rain'])).toBe('Speech, Music and Rain');
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

