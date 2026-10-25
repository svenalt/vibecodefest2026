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
  /**
   * Bumped by every start, stop and failure. An async step that sees it change gives up, so a
   * cancelled start or a late stop result can never undo or overwrite a later session.
   */
  private generation = 0;
  /**
   * True while the current session may report: from asking capture to start until it is stopped
   * or fails. Classifications, features and errors outside it belong to an ended session.
   */
  private active = false;
  /** The stop still releasing capture. A new start waits for it, so sessions never overlap. */
  private pendingStop: Promise<void> | null = null;

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
      input.on('state', (capture) => this.handleState(capture)),
      input.on('classification', (raw) => {
        if (this.active) this.handleClassification(raw);
      }),
      input.on('features', (features) => {
        if (!this.active) return;
        for (const listener of this.featureListeners) listener(features);
      }),
      // Adapters report fatal failures as a terminal `error` state; a bare error is treated the same.
      input.on('error', ({ message }) => this.fail(message)),
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
    const { status } = this.snapshot.capture;
    if (this.active && (status === 'listening' || status === 'starting')) return;
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
    // Never open a new session while the previous one is still being released.
    while (this.pendingStop) await this.pendingStop;
    const generation = ++this.generation;
    this.update({ error: null });

    let permission: PermissionStatus;
    try {
      permission = await this.input.getPermission();
      if (permission === 'undetermined') permission = await this.input.requestPermission();
    } catch (e) {
      if (generation === this.generation) this.update({ error: errorMessage(e) });
      return;
    }
    this.update({ permission });
    if (permission !== 'granted' || generation !== this.generation) return;

    this.tracker.reset();
    this.startedAt = this.now();
    this.lastArrival = null;
    this.intervalSum = 0;
    this.update({ tracker: this.tracker.snapshot(), diagnostics: emptyDiagnostics() });

    this.active = true;
    try {
      await this.input.start();
    } catch (e) {
      if (generation === this.generation) {
        this.active = false;
        this.update({ error: errorMessage(e) });
      }
      return;
    }
    // stop() or a failure ran while capture was starting up: release what that start just opened.
    if (generation !== this.generation) await this.stopInput();
  }

  /** Releases capture and cancels any start still in flight. */
  async stop(): Promise<void> {
    this.generation++;
    this.active = false;
    await this.stopInput();
  }

  private stopInput(): Promise<void> {
    const generation = this.generation;
    let stopping: Promise<void>;
    try {
      stopping = this.input.stop();
    } catch (e) {
      stopping = Promise.reject(e);
    }
    const settled = stopping
      .catch((e: unknown) => {
        // A late result of an old stop never overwrites a newer session.
        if (generation !== this.generation) return;
        const { capture } = this.snapshot;
        this.update({
          error: errorMessage(e),
          // Releasing failed, so the microphone state is unknown rather than still "stopping".
          capture: capture.status === 'stopping' ? { ...capture, status: 'error', error: errorMessage(e) } : capture,
        });
      })
      .finally(() => {
        if (this.pendingStop === settled) this.pendingStop = null;
      });
    this.pendingStop = settled;
    return settled;
  }

  /**
   * A fatal failure of the running session (pipeline, inference, model contract). Ends it at once:
   * no further results are accepted, the current detection is cleared (the timeline stays as
   * history) and capture is released. Only an explicit start begins a new session.
   */
  private fail(message: string): void {
    if (!this.active) return; // a late error of a session that already ended
    this.active = false;
    this.generation++;
    this.tracker.endSession();
    const { capture } = this.snapshot;
    this.update({
      error: message,
      tracker: this.tracker.snapshot(),
      capture: capture.status === 'listening' || capture.status === 'starting' ? { ...capture, status: 'stopping' } : capture,
    });
    void this.stopInput();
  }

  private handleState(capture: CaptureState): void {
    // A terminal error state is the adapter's own teardown after a fatal failure or failed start.
    const failed = capture.status === 'error' && this.active;
    if (failed) {
      this.active = false;
      this.generation++;
    }
    const ended = capture.status !== 'listening';
    if (ended) this.tracker.endSession();
    this.update({
      capture,
      tracker: ended ? this.tracker.snapshot() : this.snapshot.tracker,
      error: failed ? (capture.error ?? 'Capture error') : this.snapshot.error,
    });
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
      // A model/label contract violation means results cannot be trusted: end the session.
      if (e instanceof ModelContractError) this.fail(errorMessage(e));
      else this.update({ error: errorMessage(e) });
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
