import { EventTracker, type TrackerSnapshot } from './eventTracker';
import { ModelContractError, normalizeClassification } from './normalize';
import {
  IDLE_CAPTURE_STATE,
  type AudioFeatures,
  type CaptureState,
  type PermissionStatus,
  type SoundInput,
  type SoundPrediction,
  type Unsubscribe,
} from './types';

export interface Diagnostics {
  inferenceCount: number;
  /** ms from start() to the first classification arriving in JS. */
  firstResultLatencyMs: number | null;
  /** ms between the two most recent classifications. */
  lastIntervalMs: number | null;
  meanIntervalMs: number | null;
  lastPrediction: SoundPrediction | null;
}

export interface SessionSnapshot {
  permission: PermissionStatus;
  capture: CaptureState;
  tracker: TrackerSnapshot;
  diagnostics: Diagnostics;
  /** A real failure (permission, pipeline, model contract). Distinct from "no confident event". */
  error: string | null;
}

type Listener = () => void;

/**
 * Coordinates one SoundInput with the shared tracker. Knows nothing about the platform
 * beyond the SoundInput contract, so iOS, Android and test fakes behave identically.
 */
export class SoundSession {
  private readonly input: SoundInput;
  private readonly tracker: EventTracker;
  private readonly now: () => number;
  private readonly listeners = new Set<Listener>();
  private readonly featureListeners = new Set<(f: AudioFeatures) => void>();
  private readonly subscriptions: Unsubscribe[] = [];

  private startedAt = 0;
  private lastArrival: number | null = null;
  private intervalSum = 0;
  private snapshot: SessionSnapshot;
  /** True from start() until it settles, so a permission prompt or model load cannot be re-entered. */
  private starting = false;

  constructor(input: SoundInput, tracker = new EventTracker(), now: () => number = Date.now) {
    this.input = input;
    this.tracker = tracker;
    this.now = now;
    this.snapshot = {
      permission: 'undetermined',
      capture: IDLE_CAPTURE_STATE,
      tracker: tracker.snapshot(),
      diagnostics: emptyDiagnostics(),
      error: null,
    };

    this.subscriptions.push(
      input.on('state', (capture) => {
        this.update({
          capture,
          error: capture.status === 'error' ? (capture.error ?? 'Capture error') : this.snapshot.error,
        });
      }),
      input.on('classification', (raw) => this.handleClassification(raw)),
      input.on('features', (features) => {
        for (const listener of this.featureListeners) listener(features);
      }),
      input.on('error', ({ message }) => this.update({ error: message })),
    );
  }

  getSnapshot = (): SessionSnapshot => this.snapshot;

  subscribe = (listener: Listener): Unsubscribe => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** High-rate feature stream for visualization; deliberately not part of the React snapshot. */
  onFeatures(listener: (features: AudioFeatures) => void): Unsubscribe {
    this.featureListeners.add(listener);
    return () => this.featureListeners.delete(listener);
  }

  async refreshPermission(): Promise<PermissionStatus> {
    const permission = await this.input.getPermission();
    this.update({ permission });
    return permission;
  }

  /** Starts a listening session. Capture never begins unless permission is granted. */
  async start(): Promise<void> {
    if (this.starting) return;
    if (this.snapshot.capture.status === 'listening' || this.snapshot.capture.status === 'starting') return;
    this.starting = true;
    try {
      await this.startUnguarded();
    } finally {
      this.starting = false;
    }
  }

  /** True while start() is waiting on permission or capture start-up. */
  isStarting(): boolean {
    return this.starting;
  }

  private async startUnguarded(): Promise<void> {
    this.update({ error: null });

    let permission = await this.input.getPermission();
    if (permission === 'undetermined') permission = await this.input.requestPermission();
    this.update({ permission });
    if (permission !== 'granted') return;

    this.tracker.reset();
    this.startedAt = this.now();
    this.lastArrival = null;
    this.intervalSum = 0;
    this.update({ tracker: this.tracker.snapshot(), diagnostics: emptyDiagnostics() });

    try {
      await this.input.start();
    } catch (e) {
      this.update({ error: errorMessage(e) });
    }
  }

  async stop(): Promise<void> {
    try {
      await this.input.stop();
    } catch (e) {
      this.update({ error: errorMessage(e) });
    }
  }

  async dispose(): Promise<void> {
    await this.stop();
    for (const unsubscribe of this.subscriptions) unsubscribe();
    this.subscriptions.length = 0;
    this.listeners.clear();
    this.featureListeners.clear();
  }

  private handleClassification(raw: Parameters<typeof normalizeClassification>[0]): void {
    let prediction: SoundPrediction;
    try {
      prediction = normalizeClassification(raw, this.input.platform);
    } catch (e) {
      // A model/label contract violation means results cannot be trusted: stop and surface it.
      this.update({ error: errorMessage(e) });
      if (e instanceof ModelContractError) void this.stop();
      return;
    }

    const arrival = this.now();
    const d = this.snapshot.diagnostics;
    const interval = this.lastArrival === null ? null : arrival - this.lastArrival;
    if (interval !== null) this.intervalSum += interval;
    this.lastArrival = arrival;
    const count = d.inferenceCount + 1;

    this.update({
      tracker: this.tracker.push(prediction),
      diagnostics: {
        inferenceCount: count,
        firstResultLatencyMs: d.firstResultLatencyMs ?? arrival - this.startedAt,
        lastIntervalMs: interval ?? d.lastIntervalMs,
        meanIntervalMs: count > 1 ? this.intervalSum / (count - 1) : null,
        lastPrediction: prediction,
      },
    });
  }

  private update(patch: Partial<SessionSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }
}

function emptyDiagnostics(): Diagnostics {
  return {
    inferenceCount: 0,
    firstResultLatencyMs: null,
    lastIntervalMs: null,
    meanIntervalMs: null,
    lastPrediction: null,
  };
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
