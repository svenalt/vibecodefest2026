import { describe, expect, it } from 'vitest';
import { EventTracker, currentSounds, type TrackerSnapshot } from './eventTracker';
import { normalizeClassification } from './normalize';
import { fakeClassification } from './testing/fakeSoundInput';
import type { SoundPrediction } from './types';
import { YAMNET_LABELS } from './yamnet/labels';
import { TAXONOMY } from './yamnet/taxonomy';

let t = 0;
const STEP = 490;

type Scores = ReadonlyArray<readonly [string, number]>;

/** One inference with these top-K scores, `STEP` ms after the previous one (or at `at`). */
function pred(scores: Scores, at?: number): SoundPrediction {
  t = at ?? t + STEP;
  return normalizeClassification(fakeClassification(t, scores), 'ios');
}

function fresh(config: ConstructorParameters<typeof EventTracker>[0] = {}) {
  t = 0;
  return new EventTracker(config);
}

function pushN(tracker: EventTracker, n: number, scores: Scores): TrackerSnapshot {
  let snap = tracker.snapshot();
  for (let i = 0; i < n; i++) snap = tracker.push(pred(scores));
  return snap;
}

const labels = (snap: TrackerSnapshot) => currentSounds(snap.current).map((s) => s.label);
const primary = (snap: TrackerSnapshot) => (snap.current.kind === 'event' ? snap.current.primary.label : snap.current.kind);

describe('EventTracker: confidence and smoothing', () => {
  it('starts with no confident sound', () => {
    expect(fresh().snapshot().current.kind).toBe('none');
  });

  it('needs minVotes inferences before a sound is present (onset debounce)', () => {
    const tracker = fresh();
    expect(tracker.push(pred([['Speech', 0.9]])).current.kind).toBe('none');
    const snap = tracker.push(pred([['Speech', 0.9]]));
    expect(snap.current).toMatchObject({ kind: 'event', primary: { label: 'Speech', family: 'voice' }, secondary: [] });
    expect(snap.events).toHaveLength(1);
  });

  it('ignores a single stray inference between stable ones (no flicker)', () => {
    const tracker = fresh();
    pushN(tracker, 2, [['Speech', 0.9]]);
    const snap = tracker.push(pred([['Music', 0.9]]));
    expect(labels(snap)).toEqual(['Speech']);
    expect(snap.events).toHaveLength(1);
  });

  it('a low-confidence class never shows just because it is in the top 10', () => {
    const tracker = fresh();
    const snap = pushN(tracker, 6, [
      ['Siren', 0.3],
      ['Whale vocalization', 0.25],
      ['Speech', 0.2],
      ['Bird', 0.1],
    ]);
    expect(snap.current.kind).toBe('none');
    expect(snap.events).toHaveLength(0);
  });

  it('never shows room acoustics or recording context, however confident', () => {
    const snap = pushN(fresh(), 6, [
      ['Inside, small room', 0.95],
      ['Reverberation', 0.9],
      ['Field recording', 0.9],
      ['Environmental noise', 0.9],
    ]);
    expect(snap.current.kind).toBe('none');
    expect(snap.events).toHaveLength(0);
  });

  it('every displayable class (509 of 521) can become a shown, named sound', () => {
    for (const entry of TAXONOMY) {
      if (entry.role !== 'sound') continue;
      const tracker = new EventTracker();
      for (const at of [500, 1000]) {
        tracker.push(normalizeClassification(fakeClassification(at, [[entry.label, 0.95]]), 'android'));
      }
      const { current } = tracker.snapshot();
      expect(current.kind, entry.label).toBe('event');
      if (current.kind === 'event') expect(current.primary).toMatchObject({ index: entry.index, label: entry.display });
    }
  });

  it('keeps a present sound through a dip (hysteresis) but needs the full threshold to start', () => {
    const tracker = fresh();
    pushN(tracker, 2, [['Speech', 0.9]]);
    // 0.41 is below Speech's 0.5 threshold but above 0.8 x 0.5.
    expect(labels(pushN(tracker, 6, [['Speech', 0.41]]))).toEqual(['Speech']);

    const cold = fresh();
    expect(pushN(cold, 6, [['Speech', 0.41]]).current.kind).toBe('none');
  });

  it('honours configured thresholds by class, group and family', () => {
    expect(pushN(fresh({ thresholds: { classes: { Speech: 0.95 } } }), 3, [['Speech', 0.9]]).current.kind).toBe('none');
    expect(pushN(fresh({ thresholds: { groups: { bird: 0.95 } } }), 3, [['Bird', 0.9]]).current.kind).toBe('none');
    expect(pushN(fresh({ thresholds: { families: { animals: 0.2 } } }), 3, [['Bird', 0.25]]).current.kind).toBe('event');
    expect(fresh().thresholdFor(YAMNET_LABELS.indexOf('Bell'))).toBe(0.35);
    expect(fresh().thresholdFor(YAMNET_LABELS.indexOf('Doorbell'))).toBe(0.41);
    expect(fresh().thresholdFor(YAMNET_LABELS.indexOf('Bird'))).toBe(0.5);
  });

  it('requires strong evidence before naming bangs: rain-like scores are not a "Loud bang"', () => {
    expect(pushN(fresh(), 6, [['Gunshot, gunfire', 0.8], ['Explosion', 0.74], ['Fireworks', 0.74]]).current.kind).toBe(
      'none',
    );
    expect(labels(pushN(fresh(), 2, [['Gunshot, gunfire', 0.9]]))).toEqual(['Loud bang']);
  });

  it('does not count water when the same inference rates broadband noise higher (contradiction)', () => {
    expect(labels(pushN(fresh(), 3, [['Pink noise', 0.85], ['Waterfall', 0.74]]))).toEqual(['Pink noise']);
    expect(labels(pushN(fresh(), 3, [['Waterfall', 0.85], ['Pink noise', 0.74]]))).toEqual(['Waterfall', 'Pink noise']);
  });
});

describe('EventTracker: simultaneous sounds (REQ-012)', () => {
  it('shows several credible independent sounds: one primary and secondary ones', () => {
    const snap = pushN(fresh(), 2, [
      ['Speech', 0.9],
      ['Music', 0.8],
      ['Traffic noise, roadway noise', 0.7],
    ]);
    expect(snap.current).toMatchObject({
      kind: 'event',
      primary: { label: 'Speech', family: 'voice' },
      secondary: [
        { label: 'Music', family: 'music' },
        { label: 'Traffic', family: 'vehicles' },
      ],
    });
  });

  it('shows at most three, the strongest', () => {
    const snap = pushN(fresh(), 2, [
      ['Speech', 0.95],
      ['Rain', 0.9],
      ['Music', 0.85],
      ['Bark', 0.8],
      ['Car', 0.75],
    ]);
    expect(labels(snap)).toEqual(['Speech', 'Rain', 'Music']);
  });

  it('merges a parent and its child, or two names for one source, into one sound', () => {
    expect(labels(pushN(fresh(), 2, [['Music', 0.9], ['Musical instrument', 0.8], ['Guitar', 0.7]]))).toEqual([
      'Music',
    ]);
    expect(labels(pushN(fresh(), 2, [['Bark', 0.8], ['Dog', 0.7], ['Bow-wow', 0.6]]))).toEqual(['Dog barking']);
    expect(labels(pushN(fresh(), 2, [['Siren', 0.9], ['Police car (siren)', 0.8], ['Emergency vehicle', 0.7]]))).toEqual(
      ['Siren'],
    );
  });

  it('a generic umbrella class gives way to a specific sound of its family', () => {
    expect(labels(pushN(fresh(), 2, [['Animal', 0.9], ['Domestic animals, pets', 0.85], ['Cat', 0.6]]))).toEqual(['Cat']);
    expect(labels(pushN(fresh(), 2, [['Vehicle', 0.9], ['Car', 0.6], ['Speech', 0.55]]))).toEqual(['Car', 'Speech']);
    expect(labels(pushN(fresh(), 2, [['Animal', 0.9]]))).toEqual(['Animal']);
  });

  it('shows one sound per family, so related labels never look like separate sources', () => {
    const snap = pushN(fresh(), 2, [['Car', 0.9], ['Engine', 0.85], ['Traffic noise, roadway noise', 0.8]]);
    expect(labels(snap)).toEqual(['Car']);
  });

  it('breaks equal scores deterministically, whatever order the adapter used', () => {
    const a = labels(pushN(fresh(), 2, [['Music', 0.8], ['Speech', 0.8], ['Rain', 0.8]]));
    const b = labels(pushN(fresh(), 2, [['Rain', 0.8], ['Speech', 0.8], ['Music', 0.8]]));
    expect(a).toEqual(['Speech', 'Music', 'Rain']); // taxonomy order: voice before music before nature
    expect(b).toEqual(a);
  });

  it('keeps the primary unless another sound clearly leads (no swapping)', () => {
    const tracker = fresh();
    pushN(tracker, 2, [['Speech', 0.8], ['Music', 0.75]]);
    expect(primary(pushN(tracker, 4, [['Music', 0.85], ['Speech', 0.8]]))).toBe('Speech');
    expect(primary(pushN(tracker, 3, [['Music', 0.98], ['Speech', 0.6]]))).toBe('Music');
  });

  it('keeps the name of a sound unless another member clearly leads', () => {
    const tracker = fresh();
    pushN(tracker, 2, [['Dog', 0.7], ['Bark', 0.6]]);
    expect(labels(tracker.snapshot())).toEqual(['Dog']);
    expect(labels(pushN(tracker, 4, [['Bark', 0.66], ['Dog', 0.6]]))).toEqual(['Dog']);
    expect(labels(pushN(tracker, 3, [['Bark', 0.95], ['Dog', 0.5]]))).toEqual(['Dog barking']);
  });

  it('starts, holds and releases overlapping sounds independently', () => {
    const tracker = fresh();
    pushN(tracker, 3, [['Speech', 0.9], ['Music', 0.8]]);
    const speechSince = tracker.snapshot().current.sinceMs;
    // Music stops; speech goes on.
    let snap = pushN(tracker, 2, [['Speech', 0.9]]);
    expect(labels(snap)).toEqual(['Speech', 'Music']); // music held
    snap = pushN(tracker, 3, [['Speech', 0.9]]);
    expect(labels(snap)).toEqual(['Speech']); // music released after holdMs
    expect(snap.current.sinceMs).toBe(speechSince);
    // A new sound joins without disturbing the first.
    snap = pushN(tracker, 2, [['Speech', 0.9], ['Bird', 0.7]]);
    expect(labels(snap)).toEqual(['Speech', 'Bird']);
    expect(snap.current.sinceMs).toBe(speechSince);
  });

  it('rapidly alternating classifications do not spam Recent sounds', () => {
    const tracker = fresh();
    for (let i = 0; i < 20; i++) tracker.push(pred([[i % 2 ? 'Music' : 'Speech', 0.9]]));
    const snap = tracker.snapshot();
    expect(snap.events.map((e) => e.label).sort()).toEqual(['Music', 'Speech']);
    expect(currentSounds(snap.current).length).toBeLessThanOrEqual(2);
  });

  it('logs each simultaneous sound, primary first, by its display name', () => {
    const snap = pushN(fresh(), 2, [['Speech', 0.9], ['Bark', 0.8]]);
    expect(snap.events.map((e) => [e.label, e.family, e.rawLabel])).toEqual([
      ['Speech', 'voice', 'Speech'],
      ['Dog barking', 'animals', 'Bark'],
    ]);
    expect(snap.events[0]!.id).toBeGreaterThan(snap.events[1]!.id);
  });

  it('does not log a sound that is present but not shown (a fourth family)', () => {
    const snap = pushN(fresh(), 2, [['Speech', 0.95], ['Rain', 0.9], ['Music', 0.85], ['Bark', 0.8]]);
    expect(snap.events.map((e) => e.label)).not.toContain('Dog barking');
  });

  it('keeps memory bounded however many classes pass through', () => {
    const tracker = fresh();
    for (let i = 0; i < 520; i += 4) tracker.push(pred([[YAMNET_LABELS[i]!, 0.9]]));
    pushN(tracker, 4, [['Silence', 0.9]]);
    const tracks = (tracker as unknown as { tracks: Map<string, unknown> }).tracks;
    expect(tracks.size).toBeLessThanOrEqual(3);
  });
});

describe('EventTracker: hold, release, cooldown and timestamps', () => {
  it('holds a sound, then falls back to "no confident sound" after holdMs', () => {
    const tracker = fresh();
    pushN(tracker, 2, [['Speech', 0.9]]);
    expect(tracker.push(pred([['Siren', 0.1]])).current.kind).toBe('event'); // window still supports
    expect(tracker.push(pred([['Siren', 0.1]])).current.kind).toBe('event'); // hold
    tracker.push(pred([['Siren', 0.1]]));
    tracker.push(pred([['Siren', 0.1]]));
    expect(tracker.push(pred([['Siren', 0.1]])).current.kind).toBe('none');
  });

  it('releases exactly after holdMs, not at it', () => {
    const tracker = fresh({ holdMs: 1000 });
    tracker.push(pred([['Speech', 0.9]], 0));
    tracker.push(pred([['Speech', 0.9]], 500)); // present, support until 500
    tracker.push(pred([['Speech', 0.9]], 1000));
    tracker.push(pred([], 1500)); // still 2 of 3: support until 1500
    tracker.push(pred([], 2000)); // 1 of 3: holding
    expect(tracker.push(pred([], 2500)).current.kind).toBe('event'); // 2500 - 1500 = holdMs: kept
    expect(tracker.push(pred([], 2501)).current.kind).toBe('none');
  });

  it('logs a sustained sound once, not once per inference', () => {
    const tracker = fresh();
    pushN(tracker, 10, [['Rain', 0.8]]);
    expect(tracker.snapshot().events).toHaveLength(1);
  });

  describe('cooldown', () => {
    function bounce(tracker: EventTracker, gapPredictions: number) {
      pushN(tracker, 2, [['Bell', 0.9]]);
      pushN(tracker, gapPredictions, []);
      return pushN(tracker, 2, [['Bell', 0.9]]);
    }

    it('suppresses a repeat entry of the same sound inside cooldownMs', () => {
      const snap = bounce(fresh({ cooldownMs: 4000 }), 4);
      expect(labels(snap)).toEqual(['Bell']); // still shown
      expect(snap.events).toHaveLength(1);
    });

    it('allows the same sound again once the cooldown has elapsed', () => {
      expect(bounce(fresh({ cooldownMs: 1000 }), 4).events).toHaveLength(2);
    });

    it('treats the exact cooldown boundary as elapsed', () => {
      const tracker = fresh({ cooldownMs: 3000, holdMs: 400 });
      tracker.push(pred([['Bell', 0.9]], 0));
      tracker.push(pred([['Bell', 0.9]], 500)); // logged at 500
      for (const at of [1000, 1500, 2000, 2500]) tracker.push(pred([], at));
      tracker.push(pred([['Bell', 0.9]], 3000));
      expect(tracker.push(pred([['Bell', 0.9]], 3500)).events).toHaveLength(2); // 3500 - 500 = cooldownMs
    });

    it('is per sound: another sound is logged at once', () => {
      const tracker = fresh();
      pushN(tracker, 2, [['Bell', 0.9]]);
      expect(pushN(tracker, 2, [['Bell', 0.9], ['Speech', 0.9]]).events.map((e) => e.label)).toEqual(['Speech', 'Bell']);
    });
  });

  it('keeps Recent sounds newest first and capped', () => {
    const tracker = fresh({ maxEvents: 2, cooldownMs: 0, holdMs: 0 });
    for (const label of ['Speech', 'Music', 'Rain']) pushN(tracker, 3, [[label, 0.9]]);
    expect(tracker.snapshot().events.map((e) => e.label)).toEqual(['Rain', 'Music']);
  });
});

describe('EventTracker: quiet, unknown and ended sessions', () => {
  it('reports quiet as its own state, never as a logged sound', () => {
    const snap = pushN(fresh(), 3, [['Silence', 0.8]]);
    expect(snap.current.kind).toBe('silence');
    expect(snap.events).toHaveLength(0);
  });

  it('counts Silence only when it is the best candidate', () => {
    expect(pushN(fresh(), 3, [['Speech', 0.3], ['Silence', 0.25]]).current.kind).toBe('none');
    expect(pushN(fresh(), 3, [['Silence', 0.4]]).current.kind).toBe('none'); // below its threshold
  });

  it('a held sound gives way to quiet only after its release', () => {
    const tracker = fresh();
    pushN(tracker, 2, [['Speech', 0.9]]);
    expect(pushN(tracker, 2, [['Silence', 0.8]]).current.kind).toBe('event');
    expect(pushN(tracker, 4, [['Silence', 0.8]]).current.kind).toBe('silence');
  });

  it('weak, contradictory evidence stays "no confident sound"', () => {
    const tracker = fresh();
    const snap = pushN(tracker, 6, [
      ['Speech', 0.41],
      ['Music', 0.41],
      ['Silence', 0.33],
      ['Inside, small room', 0.33],
    ]);
    expect(snap.current.kind).toBe('none');
  });

  it('endSession drops every present sound and its window, keeping Recent sounds', () => {
    const tracker = fresh();
    pushN(tracker, 2, [['Speech', 0.9], ['Music', 0.8]]);
    tracker.endSession();
    expect(tracker.snapshot().current).toEqual({ kind: 'none', sinceMs: 0 });
    expect(tracker.snapshot().events).toHaveLength(2);
    // Nothing stale carries over: one new inference is not enough to show anything again.
    expect(tracker.push(pred([['Speech', 0.9]])).current.kind).toBe('none');
  });

  it('reset clears current state and Recent sounds', () => {
    const tracker = fresh();
    pushN(tracker, 2, [['Speech', 0.9]]);
    tracker.reset();
    const snap = tracker.snapshot();
    expect(snap.current.kind).toBe('none');
    expect(snap.events).toHaveLength(0);
    expect(snap.lastPrediction).toBeNull();
  });
});
