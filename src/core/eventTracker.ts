import type { SoundPrediction } from './types';
import { YAMNET_NUM_CLASSES } from './yamnet/constants';
import { GROUP_ORDER, TAXONOMY, type VisualFamily } from './yamnet/taxonomy';

/**
 * Minimum raw score for a class to count as evidence. The most specific value wins:
 * exact raw label, then subtype group, then family, then `default`. Scores are not calibrated
 * probabilities; see docs/model.md for how each value was chosen.
 */
export interface Thresholds {
  default: number;
  families: Partial<Record<VisualFamily, number>>;
  groups: Readonly<Record<string, number>>;
  classes: Readonly<Record<string, number>>;
  /** "Silence" counts only as the best candidate of an inference and at least this score. */
  silence: number;
  /**
   * Contradictory evidence: a group listed here counts only when it outscores every candidate of
   * the named groups in the same inference (e.g. "Waterfall" is not water when "Pink noise" is
   * rated higher: broadband noise reaches both).
   */
  maskedBy: Readonly<Record<string, readonly string[]>>;
}

export interface TrackerConfig {
  thresholds: Thresholds;
  /** Hysteresis: a sound that is already present keeps counting down to this fraction of its threshold. */
  sustainRatio: number;
  /** Number of most recent inferences considered for smoothing. */
  windowSize: number;
  /** Supporting inferences a sound needs inside the window to be present (onset), or to stay present. */
  minVotes: number;
  /** How long a present sound stays after its support ends, before it is released. */
  holdMs: number;
  /** Minimum gap between two Recent sounds entries of the same sound. */
  cooldownMs: number;
  /** Recent sounds length cap (session only, in memory). */
  maxEvents: number;
  /** Sounds shown at once: one primary plus up to `maxDisplayed - 1` secondary. */
  maxDisplayed: number;
  /** Smoothed-score lead a sound needs to displace one already shown (slot, primary or name). */
  switchMargin: number;
}

/**
 * Values chosen against the host evaluation clips (src/core/clipEvaluation.test.ts,
 * docs/model.md). Scores are 8-bit quantized: around these thresholds the only levels are
 * 0.33, 0.41, 0.50, 0.59, 0.67, 0.74, 0.80 and 0.85.
 *
 * - default 0.5: the model's own decision point (logit 0), the lowest level where it leans "present".
 * - The original six keep the values accepted on devices in REQ-001-010 (0.35-0.5).
 * - Bells and signals 0.41: the accepted bell level; no signal class reached it twice on any
 *   clip without a signal. Alarm and siren stay at 0.5 because they make stronger claims.
 * - Bangs and pops 0.85: synthetic rain and applause reach 0.80 for "Explosion" and "Fireworks".
 * - Broadband noise 0.66, so steady fans and rumble do not keep "Pink noise" on screen. Water
 *   0.66 and only when it outscores the noise classes: pure pink noise reaches 0.85 "Waterfall".
 * - Distressing or bodily sounds 0.66 (screaming, heartbeat, body sounds, snake): false labels
 *   there cost more than misses.
 */
export const DEFAULT_THRESHOLDS: Thresholds = {
  default: 0.5,
  families: { signals: 0.41 },
  groups: {
    bang: 0.85,
    pop: 0.85,
    alarm: 0.5,
    siren: 0.5,
    noise: 0.66,
    water: 0.66,
    screaming: 0.66,
    crying: 0.58,
    heartbeat: 0.66,
    snake: 0.66,
    body: 0.66,
  },
  classes: {
    Speech: 0.5,
    'Child speech, kid speaking': 0.5,
    Conversation: 0.5,
    Music: 0.5,
    Dog: 0.45,
    Bark: 0.45,
    Clapping: 0.4,
    Applause: 0.4,
    Rain: 0.4,
    Raindrop: 0.4,
    'Rain on surface': 0.4,
    Bell: 0.35,
    'Church bell': 0.35,
    'Jingle bell': 0.35,
    'Bicycle bell': 0.35,
  },
  silence: 0.5,
  maskedBy: { water: ['noise'] },
};

export const DEFAULT_TRACKER_CONFIG: TrackerConfig = {
  thresholds: DEFAULT_THRESHOLDS,
  sustainRatio: 0.8,
  windowSize: 3,
  minVotes: 2,
  holdMs: 1500,
  cooldownMs: 4000,
  maxEvents: 30,
  maxDisplayed: 3,
  switchMargin: 0.1,
};

/** One recognized sound on screen. */
export interface ActiveSound {
  /** Taxonomy subtype group: the identity this sound is tracked, deduplicated and logged by. */
  group: string;
  /** YAMNet class currently naming it. */
  index: number;
  rawLabel: string;
  /** Plain display name. */
  label: string;
  family: VisualFamily;
  /** Smoothed raw score over the window (missing inferences count as 0). Not a probability. */
  score: number;
  /** When this sound became present. */
  sinceMs: number;
}

/**
 * What the UI shows right now: one primary sound plus up to two secondary ones, quiet, or `none`
 * ("no confident sound", which is not an error). Several sounds are concurrent classifications,
 * not a claim of several physical sources.
 */
export type Current =
  | { kind: 'event'; primary: ActiveSound; secondary: readonly ActiveSound[]; sinceMs: number }
  | { kind: 'silence'; sinceMs: number }
  | { kind: 'none'; sinceMs: number };

export interface TimelineEvent {
  id: number;
  timestampMs: number;
  group: string;
  index: number;
  rawLabel: string;
  label: string;
  family: VisualFamily;
  score: number;
}

export interface TrackerSnapshot {
  current: Current;
  events: readonly TimelineEvent[];
  lastPrediction: SoundPrediction | null;
}

/** Every sound in `current`, primary first. */
export function currentSounds(current: Current): readonly ActiveSound[] {
  return current.kind === 'event' ? [current.primary, ...current.secondary] : [];
}

interface Vote {
  /** Best member above threshold, and its score. */
  index: number;
  score: number;
  /** Score of every member of the group in this inference, for naming the sound. */
  members: ReadonlyMap<number, number>;
}

interface Track {
  group: string;
  family: VisualFamily;
  umbrella: boolean;
  order: number;
  /** One slot per inference in the window, oldest first; null = no evidence above threshold. */
  votes: (Vote | null)[];
  present: boolean;
  sinceMs: number;
  lastSupportMs: number;
  /** Member class that names the sound; changes only with a clear lead (no flicker). */
  labelIndex: number;
  /** This presence was already considered for Recent sounds. */
  logged: boolean;
}

/** Highest first; then the sound present longer, then taxonomy order. Fully deterministic. */
function byRank(a: { rank: number; track: Track }, b: { rank: number; track: Track }): number {
  return b.rank - a.rank || a.track.sinceMs - b.track.sinceMs || a.track.order - b.track.order;
}

/**
 * Smooths per-inference candidates into a stable set of present sounds plus a debounced session
 * list. Each sound (taxonomy group) has its own onset, presence, hold and release; at most one
 * sound per visual family and `maxDisplayed` in total are shown, so a parent and a child class
 * or two names for one source are never shown as separate sounds. Pure and deterministic: time
 * comes from prediction timestamps.
 */
export class EventTracker {
  private readonly config: TrackerConfig;
  /** Threshold per class index, resolved once. */
  private readonly classThreshold: Float64Array;
  private tracks = new Map<string, Track>();
  /** Group keys on screen, primary first. */
  private displayed: string[] = [];
  private silenceVotes: boolean[] = [];
  private silencePresent = false;
  private silenceSinceMs = 0;
  private silenceSupportMs = 0;
  private current: Current = { kind: 'none', sinceMs: 0 };
  private events: TimelineEvent[] = [];
  private lastLoggedMs = new Map<string, number>();
  private nextId = 1;
  private lastPrediction: SoundPrediction | null = null;

  constructor(config: Partial<Omit<TrackerConfig, 'thresholds'>> & { thresholds?: Partial<Thresholds> } = {}) {
    const t = config.thresholds ?? {};
    this.config = {
      ...DEFAULT_TRACKER_CONFIG,
      ...config,
      thresholds: {
        ...DEFAULT_THRESHOLDS,
        ...t,
        families: { ...DEFAULT_THRESHOLDS.families, ...t.families },
        groups: { ...DEFAULT_THRESHOLDS.groups, ...t.groups },
        classes: { ...DEFAULT_THRESHOLDS.classes, ...t.classes },
        maskedBy: { ...DEFAULT_THRESHOLDS.maskedBy, ...t.maskedBy },
      },
    };
    this.classThreshold = resolveThresholds(this.config.thresholds);
  }

  /** The score a class needs to count as evidence when its sound is not yet present. */
  thresholdFor(index: number): number {
    return this.classThreshold[index] ?? Infinity;
  }

  push(prediction: SoundPrediction): TrackerSnapshot {
    const { config } = this;
    const now = prediction.timestampMs;
    this.lastPrediction = prediction;

    // 1. Evidence: the best class above threshold per sound group, from this inference only.
    const evidence = new Map<string, Vote>();
    const groupBest = new Map<string, number>();
    const groupMembers = new Map<string, Map<number, number>>();
    for (const c of prediction.candidates) {
      const group = TAXONOMY[c.index]?.group;
      if (group === undefined) continue;
      if (c.score > (groupBest.get(group) ?? -Infinity)) groupBest.set(group, c.score);
      if (!groupMembers.has(group)) groupMembers.set(group, new Map());
      groupMembers.get(group)!.set(c.index, c.score);
    }
    let silence = false;
    prediction.candidates.forEach((c, rank) => {
      const entry = TAXONOMY[c.index];
      if (!entry) return;
      if (entry.role === 'silence') {
        silence = rank === 0 && c.score >= config.thresholds.silence;
        return;
      }
      if (entry.role !== 'sound') return; // room acoustics, recording artefacts: never a sound
      const present = this.tracks.get(entry.group)?.present ?? false;
      const needed = this.thresholdFor(c.index) * (present ? config.sustainRatio : 1);
      if (!(c.score >= needed)) return;
      const maskers = config.thresholds.maskedBy[entry.group] ?? [];
      if (maskers.some((m) => (groupBest.get(m) ?? -Infinity) >= c.score)) return;
      const best = evidence.get(entry.group);
      if (!best || c.score > best.score) {
        evidence.set(entry.group, { index: c.index, score: c.score, members: groupMembers.get(entry.group)! });
      }
    });

    // 2. Per-sound onset, presence, hold and release.
    for (const [group, vote] of evidence) {
      if (!this.tracks.has(group)) this.tracks.set(group, this.newTrack(group, vote.index));
    }
    for (const [group, track] of this.tracks) {
      track.votes.push(evidence.get(group) ?? null);
      if (track.votes.length > config.windowSize) track.votes.shift();
      const support = track.votes.filter((v) => v !== null).length;
      if (support >= config.minVotes) {
        if (!track.present) {
          track.present = true;
          track.sinceMs = now;
          track.logged = false;
          track.labelIndex = this.leadingMember(track);
        }
        track.lastSupportMs = now;
      } else if (track.present && now - track.lastSupportMs > config.holdMs) {
        track.present = false;
      }
      if (track.present) this.updateLabel(track);
      else if (support === 0) this.tracks.delete(group);
    }

    this.silenceVotes.push(silence);
    if (this.silenceVotes.length > config.windowSize) this.silenceVotes.shift();
    if (this.silenceVotes.filter(Boolean).length >= config.minVotes) {
      if (!this.silencePresent) this.silenceSinceMs = now;
      this.silencePresent = true;
      this.silenceSupportMs = now;
    } else if (this.silencePresent && now - this.silenceSupportMs > config.holdMs) {
      this.silencePresent = false;
    }

    // 3. What to show, then what to log.
    this.displayed = this.select();
    const shown = this.displayed.map((group) => this.tracks.get(group)!);
    for (const track of [...shown].reverse()) this.logOnce(track, now);

    if (shown.length > 0) {
      const [primary, ...secondary] = shown.map((track) => this.activeSound(track));
      this.current = { kind: 'event', primary: primary!, secondary, sinceMs: primary!.sinceMs };
    } else if (this.silencePresent) {
      if (this.current.kind !== 'silence') this.current = { kind: 'silence', sinceMs: this.silenceSinceMs };
    } else if (this.current.kind !== 'none') {
      this.current = { kind: 'none', sinceMs: now };
    }
    return this.snapshot();
  }

  /**
   * The session ended (stopped or failed): nothing is being heard any more, so drop every present
   * sound and its smoothing window. Recent sounds stay, as history of what was heard.
   */
  endSession(): void {
    this.tracks.clear();
    this.displayed = [];
    this.silenceVotes = [];
    this.silencePresent = false;
    this.current = { kind: 'none', sinceMs: 0 };
  }

  reset(): void {
    this.endSession();
    this.events = [];
    this.lastLoggedMs.clear();
    this.lastPrediction = null;
  }

  snapshot(): TrackerSnapshot {
    return { current: this.current, events: this.events, lastPrediction: this.lastPrediction };
  }

  private newTrack(group: string, index: number): Track {
    const entry = TAXONOMY[index]!;
    return {
      group,
      family: entry.family,
      umbrella: entry.umbrella,
      order: GROUP_ORDER.get(group) ?? Number.MAX_SAFE_INTEGER,
      votes: new Array<Vote | null>(this.config.windowSize - 1).fill(null),
      present: false,
      sinceMs: 0,
      lastSupportMs: 0,
      labelIndex: index,
      logged: false,
    };
  }

  /** Smoothed score: mean over the whole window, so a sound that stops supporting fades in rank. */
  private score(track: Track): number {
    return track.votes.reduce((sum, v) => sum + (v?.score ?? 0), 0) / this.config.windowSize;
  }

  private memberSupport(track: Track, index: number): number {
    return track.votes.reduce((sum, v) => sum + (v?.members.get(index) ?? 0), 0) / this.config.windowSize;
  }

  /** The member with the most support in the window; ties go to the lower index. */
  private leadingMember(track: Track): number {
    let best = track.labelIndex;
    let bestSupport = -1;
    for (const v of track.votes) {
      for (const index of v?.members.keys() ?? []) {
        const support = this.memberSupport(track, index);
        if (support > bestSupport || (support === bestSupport && index < best)) {
          best = index;
          bestSupport = support;
        }
      }
    }
    return best;
  }

  /** Renames a present sound (e.g. Dog -> Dog barking) only when another member clearly leads. */
  private updateLabel(track: Track): void {
    const leader = this.leadingMember(track);
    if (leader === track.labelIndex) return;
    const current = this.memberSupport(track, track.labelIndex);
    if (current === 0 || this.memberSupport(track, leader) > current + this.config.switchMargin) {
      track.labelIndex = leader;
    }
  }

  /**
   * One sound per family (a specific sound always before an umbrella such as "Animal"), then the
   * strongest families. Sounds already shown, and the primary, get a `switchMargin` head start, so
   * near-equal sounds do not take turns.
   */
  private select(): string[] {
    const { switchMargin, maxDisplayed } = this.config;
    const wasShown = new Set(this.displayed);
    const wasPrimary = this.displayed[0];
    const perFamily = new Map<VisualFamily, { rank: number; track: Track }>();
    for (const track of this.tracks.values()) {
      if (!track.present) continue;
      const rank = this.score(track) + (wasShown.has(track.group) ? switchMargin : 0) + (track.umbrella ? 0 : 10);
      const incumbent = perFamily.get(track.family);
      const entry = { rank, track };
      if (!incumbent || byRank(entry, incumbent) < 0) perFamily.set(track.family, entry);
    }
    return [...perFamily.values()]
      .map(({ track }) => ({
        track,
        rank:
          this.score(track) +
          (wasShown.has(track.group) ? switchMargin : 0) +
          (track.group === wasPrimary ? switchMargin : 0),
      }))
      .sort(byRank)
      .slice(0, maxDisplayed)
      .map(({ track }) => track.group);
  }

  private activeSound(track: Track): ActiveSound {
    const entry = TAXONOMY[track.labelIndex]!;
    return {
      group: track.group,
      index: entry.index,
      rawLabel: entry.label,
      label: entry.display,
      family: track.family,
      score: this.score(track),
      sinceMs: track.sinceMs,
    };
  }

  /** Logs a sound once per presence, and not again within its cooldown. */
  private logOnce(track: Track, now: number): void {
    if (track.logged) return;
    track.logged = true;
    const last = this.lastLoggedMs.get(track.group);
    if (last !== undefined && now - last < this.config.cooldownMs) return;
    this.lastLoggedMs.set(track.group, now);
    const sound = this.activeSound(track);
    const event: TimelineEvent = {
      id: this.nextId++,
      timestampMs: now,
      group: sound.group,
      index: sound.index,
      rawLabel: sound.rawLabel,
      label: sound.label,
      family: sound.family,
      score: sound.score,
    };
    this.events = [event, ...this.events].slice(0, this.config.maxEvents);
  }
}

function resolveThresholds(t: Thresholds): Float64Array {
  const out = new Float64Array(YAMNET_NUM_CLASSES);
  for (const entry of TAXONOMY) {
    out[entry.index] =
      t.classes[entry.label] ?? t.groups[entry.group] ?? t.families[entry.family] ?? t.default;
  }
  return out;
}
