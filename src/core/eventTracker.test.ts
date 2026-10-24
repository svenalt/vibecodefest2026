import { describe, expect, it } from 'vitest';
import { EventTracker } from './eventTracker';
import type { PredictionCategory, SoundPrediction } from './types';

let t = 0;
const STEP = 490;

function pred(category: PredictionCategory, score: number, at?: number): SoundPrediction {
  t = at ?? t + STEP;
  return { timestampMs: t, category, rawLabel: category, score, model: 'yamnet', platform: 'ios' };
}

function fresh(config = {}) {
  t = 0;
  return new EventTracker(config);
}

describe('EventTracker', () => {
  it('starts with no confident event', () => {
    expect(fresh().snapshot().current.kind).toBe('none');
  });

  it('needs minVotes predictions before confirming (debounce)', () => {
    const tracker = fresh();
    expect(tracker.push(pred('speech', 0.9)).current.kind).toBe('none');
    const snap = tracker.push(pred('speech', 0.9));
    expect(snap.current).toMatchObject({ kind: 'event', category: 'speech' });
    expect(snap.events).toHaveLength(1);
  });

  it('ignores a single stray prediction between stable ones (no flicker)', () => {
    const tracker = fresh();
    tracker.push(pred('speech', 0.9));
    tracker.push(pred('speech', 0.9));
    const snap = tracker.push(pred('music', 0.9));
    expect(snap.current).toMatchObject({ kind: 'event', category: 'speech' });
    expect(snap.events).toHaveLength(1);
  });

  it('treats below-threshold predictions as no confident event', () => {
    const tracker = fresh();
    tracker.push(pred('speech', 0.2));
    const snap = tracker.push(pred('speech', 0.3));
    expect(snap.current.kind).toBe('none');
    expect(snap.events).toHaveLength(0);
  });

  it('never forces a category for unknown predictions', () => {
    const tracker = fresh();
    for (let i = 0; i < 6; i++) tracker.push(pred('unknown', 0.9));
    const snap = tracker.snapshot();
    expect(snap.current.kind).toBe('none');
    expect(snap.events).toHaveLength(0);
  });

  it('holds a confirmed event, then falls back to none after holdMs', () => {
    const tracker = fresh();
    tracker.push(pred('speech', 0.9));
    tracker.push(pred('speech', 0.9));
    expect(tracker.push(pred('unknown', 0.9)).current.kind).toBe('event'); // within hold
    expect(tracker.push(pred('unknown', 0.9)).current.kind).toBe('event');
    tracker.push(pred('unknown', 0.9));
    tracker.push(pred('unknown', 0.9));
    expect(tracker.push(pred('unknown', 0.9)).current.kind).toBe('none');
  });

  it('switches categories once the new one is confirmed', () => {
    const tracker = fresh();
    tracker.push(pred('speech', 0.9));
    tracker.push(pred('speech', 0.9));
    tracker.push(pred('music', 0.9));
    const snap = tracker.push(pred('music', 0.9));
    expect(snap.current).toMatchObject({ kind: 'event', category: 'music' });
    expect(snap.events.map((e) => e.category)).toEqual(['music', 'speech']);
  });

  it('reports silence as its own state without logging a timeline event', () => {
    const tracker = fresh();
    tracker.push(pred('silence', 0.9));
    const snap = tracker.push(pred('silence', 0.9));
    expect(snap.current.kind).toBe('silence');
    expect(snap.events).toHaveLength(0);
  });

  it('logs a sustained sound once, not once per inference', () => {
    const tracker = fresh();
    for (let i = 0; i < 10; i++) tracker.push(pred('rain', 0.8));
    expect(tracker.snapshot().events).toHaveLength(1);
  });

  describe('cooldown', () => {
    function bounce(tracker: EventTracker, gapPredictions: number) {
      tracker.push(pred('bell', 0.9));
      tracker.push(pred('bell', 0.9));
      for (let i = 0; i < gapPredictions; i++) tracker.push(pred('unknown', 0.9));
      tracker.push(pred('bell', 0.9));
      return tracker.push(pred('bell', 0.9));
    }

    it('suppresses a repeat timeline entry of the same category inside cooldownMs', () => {
      const snap = bounce(fresh({ cooldownMs: 4000 }), 4);
      expect(snap.current).toMatchObject({ kind: 'event', category: 'bell' }); // still displayed
      expect(snap.events).toHaveLength(1);
    });

    it('allows the same category again once the cooldown has elapsed', () => {
      const snap = bounce(fresh({ cooldownMs: 1000 }), 4);
      expect(snap.events).toHaveLength(2);
    });
  });

  it('keeps the timeline newest-first and capped', () => {
    const tracker = fresh({ maxEvents: 2, cooldownMs: 0 });
    for (const c of ['speech', 'music', 'rain'] as const) {
      tracker.push(pred(c, 0.9));
      tracker.push(pred(c, 0.9));
    }
    expect(tracker.snapshot().events.map((e) => e.category)).toEqual(['rain', 'music']);
  });

  it('honours configured thresholds', () => {
    const tracker = fresh({ thresholds: { speech: 0.95 } });
    tracker.push(pred('speech', 0.9));
    expect(tracker.push(pred('speech', 0.9)).current.kind).toBe('none');
  });

  it('reset clears current state and timeline', () => {
    const tracker = fresh();
    tracker.push(pred('speech', 0.9));
    tracker.push(pred('speech', 0.9));
    tracker.reset();
    const snap = tracker.snapshot();
    expect(snap.current.kind).toBe('none');
    expect(snap.events).toHaveLength(0);
  });
});
