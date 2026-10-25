import type { SoundSession } from './soundSession';
import type { Unsubscribe } from './types';

export interface ListeningIntent {
  /** The user's choice: listen whenever the app is in the foreground. Persisted by the caller. */
  desired: boolean;
  /** A start (permission prompt or capture start-up) is in flight. */
  starting: boolean;
  /** A stop issued here is still releasing capture. */
  stopping: boolean;
}

interface Options {
  /** Hydrated preference. A clean first install passes true; unreadable storage passes false. */
  desired: boolean;
  /** Called synchronously whenever the user changes `desired`. */
  persist: (desired: boolean) => void;
}

/**
 * Keeps actual capture in line with the user's intent and the app's foreground state.
 * Capture runs only while desired AND foreground. Leaving the foreground always releases the
 * microphone but never changes `desired`; only requestStart/requestStop do.
 *
 * Starts and stops are asynchronous, so at most one of each is in flight and the controller
 * decides again from the latest inputs whenever one settles after the inputs changed. A stop
 * cancels any start still in flight (see SoundSession.stop). A start never begins while capture
 * is still being released, including a release the native side began on its own. Nothing is
 * retried on its own: a failed start or session waits for new input (Start, or a return to the
 * foreground).
 */
export class ListeningController {
  private readonly session: SoundSession;
  private readonly persist: (desired: boolean) => void;
  private readonly listeners = new Set<() => void>();
  private foreground = false;
  private startOp: Promise<void> | null = null;
  private stopOp: Promise<void> | null = null;
  /** Inputs changed while an operation was in flight; reconcile again once it settles. */
  private recheck = false;
  /** Waiting for capture to leave a `stopping` state before starting. */
  private awaitingTeardown = false;
  private state: ListeningIntent;

  constructor(session: SoundSession, { desired, persist }: Options) {
    this.session = session;
    this.persist = persist;
    this.state = { desired, starting: false, stopping: false };
    session.subscribe(() => {
      if (this.awaitingTeardown && this.session.getSnapshot().capture.status !== 'stopping') {
        this.awaitingTeardown = false;
        // Outside the session's notification, which is still running.
        void Promise.resolve().then(() => this.reconcile());
      }
    });
  }

  getState = (): ListeningIntent => this.state;

  subscribe = (listener: () => void): Unsubscribe => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** App came to (true) or left (false) the foreground. Repeated notifications are ignored. */
  setForeground(foreground: boolean): void {
    if (foreground === this.foreground) return;
    this.foreground = foreground;
    this.reconcile();
  }

  /** Explicit Start: the only way `desired` becomes true again after a Stop, and the retry after a failure. */
  requestStart(): void {
    this.setDesired(true);
  }

  /** Explicit Stop: takes effect at once, whether or not saving it succeeds. */
  requestStop(): void {
    this.setDesired(false);
  }

  private setDesired(desired: boolean): void {
    if (desired !== this.state.desired) this.setState({ desired });
    this.persist(desired);
    this.reconcile();
  }

  private reconcile(): void {
    this.awaitingTeardown = false;
    const status = this.session.getSnapshot().capture.status;

    if (!(this.state.desired && this.foreground)) {
      if (this.stopOp) {
        this.recheck = true;
        return;
      }
      if (this.startOp) {
        // Cancels the start in flight; decide again once both have settled.
        this.recheck = true;
        this.runStop();
        return;
      }
      if (status !== 'idle' && status !== 'stopping') this.runStop();
      return;
    }

    if (this.startOp || this.stopOp) {
      this.recheck = true;
      return;
    }
    if (status === 'stopping') {
      this.awaitingTeardown = true;
      return;
    }
    if (status === 'listening' || status === 'starting') return;

    // Permission is requested only here, i.e. only while the user wants to listen.
    this.runStart();
  }

  private runStart(): void {
    this.setState({ starting: true });
    const op = this.session.start().finally(() => {
      this.startOp = null;
      this.setState({ starting: false });
      this.settled();
    });
    this.startOp = op;
  }

  private runStop(): void {
    this.setState({ stopping: true });
    const op = this.session.stop().finally(() => {
      this.stopOp = null;
      this.setState({ stopping: false });
      this.settled();
    });
    this.stopOp = op;
  }

  /** Reconciles once more only if the inputs changed meanwhile, so a persistent failure never loops. */
  private settled(): void {
    if (!this.recheck || this.startOp || this.stopOp) return;
    this.recheck = false;
    this.reconcile();
  }

  private setState(patch: Partial<ListeningIntent>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
}

/**
 * Whether a React Native AppState value means the app is in the foreground. Only `active`
 * counts: `inactive` (system sheets, launch, the app switcher) and `unknown` do not.
 */
export function isForegroundAppState(state: string | null | undefined): boolean {
  return state === 'active';
}
