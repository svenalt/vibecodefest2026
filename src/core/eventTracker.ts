import type { PredictionCategory, SoundCategory, SoundPrediction } from './types';

export interface TrackerConfig {
  /** Minimum raw score for a prediction to count as a vote for its category. */
  thresholds: Record<SoundCategory | 'silence', number>;
  /** Number of most recent predictions considered for smoothing. */
  windowSize: number;
  /** Votes a category needs inside the window to be confirmed. */
  minVotes: number;
  /** How long a confirmed category stays displayed without new supporting votes. */
  holdMs: number;
  /** Minimum gap between two timeline entries of the same category. */
  cooldownMs: number;
  /** Timeline length cap (session only, in memory). */
  maxEvents: number;
}

export const DEFAULT_TRACKER_CONFIG: TrackerConfig = {
  // Raw scores are not calibrated probabilities; these are starting points to tune on device.
  thresholds: {
    speech: 0.5,
    music: 0.5,
    dog_bark: 0.45,
    applause: 0.4,
    rain: 0.4,
    bell: 0.35,
    silence: 0.5,
  },
  windowSize: 3,
  minVotes: 2,
  holdMs: 1500,
  cooldownMs: 4000,
  maxEvents: 30,
};

/** What the UI shows right now. `none` means "no confident event", which is not an error. */
export type Current =
  | { kind: 'event'; category: SoundCategory; score: number; rawLabel: string; sinceMs: number }
  | { kind: 'silence'; sinceMs: number }
  | { kind: 'none'; sinceMs: number };

export interface TimelineEvent {
  id: number;
  timestampMs: number;
  category: SoundCategory;
  rawLabel: string;
  score: number;
}

export interface TrackerSnapshot {
  current: Current;
  events: readonly TimelineEvent[];
  lastPrediction: SoundPrediction | null;
}

function compareKeys(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i++) {
    const d = a[i]! - b[i]!;
    if (d !== 0) return d;
  }
  return 0;
}

interface Vote {
  category: PredictionCategory;
  prediction: SoundPrediction;
}

/**
 * Smooths the per-inference predictions into a stable current state plus a debounced
 * session timeline. Pure and deterministic: time comes from prediction timestamps.
 */
export class EventTracker {
  private readonly config: TrackerConfig;
  private window: Vote[] = [];
  private current: Current = { kind: 'none', sinceMs: 0 };
  private lastSupportMs = 0;
  private events: TimelineEvent[] = [];
  private lastLoggedMs = new Map<SoundCategory, number>();
  private nextId = 1;
  private lastPrediction: SoundPrediction | null = null;

  constructor(config: Partial<TrackerConfig> = {}) {
    this.config = {
      ...DEFAULT_TRACKER_CONFIG,
      ...config,
      thresholds: { ...DEFAULT_TRACKER_CONFIG.thresholds, ...config.thresholds },
    };
  }

  push(prediction: SoundPrediction): TrackerSnapshot {
    const { config } = this;
    this.lastPrediction = prediction;

    // Below-threshold and unknown predictions are votes for "nothing confident".
    const category = this.effectiveCategory(prediction);
    this.window.push({ category, prediction });
    if (this.window.length > config.windowSize) this.window.shift();

    const candidate = this.leadingCandidate();
    const now = prediction.timestampMs;

    if (candidate) {
      this.lastSupportMs = now;
      const supporting = this.window.filter((v) => v.category === candidate);
      const meanScore = supporting.reduce((s, v) => s + v.prediction.score, 0) / supporting.length;
      const latest = supporting[supporting.length - 1]!.prediction;
      const sameAsCurrent =
        (candidate === 'silence' && this.current.kind === 'silence') ||
        (this.current.kind === 'event' && this.current.category === candidate);

      if (candidate === 'silence') {
        if (!sameAsCurrent) this.current = { kind: 'silence', sinceMs: now };
      } else {
        const sinceMs = sameAsCurrent ? (this.current as { sinceMs: number }).sinceMs : now;
        this.current = {
          kind: 'event',
          category: candidate,
          score: meanScore,
          rawLabel: latest.rawLabel,
          sinceMs,
        };
        if (!sameAsCurrent) this.logEvent(candidate, latest.rawLabel, meanScore, now);
      }
    } else if (this.current.kind !== 'none' && now - this.lastSupportMs > config.holdMs) {
      this.current = { kind: 'none', sinceMs: now };
    }

    return this.snapshot();
  }

  reset(): void {
    this.window = [];
    this.current = { kind: 'none', sinceMs: 0 };
    this.lastSupportMs = 0;
    this.events = [];
    this.lastLoggedMs.clear();
    this.lastPrediction = null;
  }

  snapshot(): TrackerSnapshot {
    return {
      current: this.current,
      events: this.events,
      lastPrediction: this.lastPrediction,
    };
  }

  private effectiveCategory(p: SoundPrediction): PredictionCategory {
    if (p.category === 'unknown') return 'unknown';
    return p.score >= this.config.thresholds[p.category] ? p.category : 'unknown';
  }

  /** Category with enough votes in the window; ties go to the higher mean score, then the newest. */
  private leadingCandidate(): SoundCategory | 'silence' | null {
    const tally = new Map<SoundCategory | 'silence', { votes: number; sum: number; last: number }>();
    this.window.forEach((v, i) => {
      if (v.category === 'unknown') return;
      const t = tally.get(v.category) ?? { votes: 0, sum: 0, last: 0 };
      t.votes += 1;
      t.sum += v.prediction.score;
      t.last = i;
      tally.set(v.category, t);
    });

    let best: SoundCategory | 'silence' | null = null;
    let bestKey: [number, number, number] = [-1, -1, -1];
    for (const [category, t] of tally) {
      if (t.votes < this.config.minVotes) continue;
      const key: [number, number, number] = [t.votes, t.sum / t.votes, t.last];
      if (best === null || compareKeys(key, bestKey) > 0) {
        best = category;
        bestKey = key;
      }
    }
    return best;
  }

  private logEvent(category: SoundCategory, rawLabel: string, score: number, now: number): void {
    const last = this.lastLoggedMs.get(category);
    if (last !== undefined && now - last < this.config.cooldownMs) return;
    this.lastLoggedMs.set(category, now);
    const event: TimelineEvent = { id: this.nextId++, timestampMs: now, category, rawLabel, score };
    this.events = [event, ...this.events].slice(0, this.config.maxEvents);
  }
}
