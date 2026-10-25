import type { SoundSession } from './soundSession';
import type { Unsubscribe } from './types';

export interface ListeningIntent {
  /** The user's choice: listen whenever the app is in the foreground. Persisted by the caller. */
  desired: boolean;
  /** A start (permission prompt or capture start-up) is in flight. */
  starting: boolean;
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
 * microphone but never changes `desired`; only requestStart/requestStop do. A stop cancels any
 * start still in flight (see SoundSession.stop), and a start that settles after the inputs
 * changed is followed by one more reconcile, so the last state always wins.
 */
export class ListeningController {
  private readonly session: SoundSession;
  private readonly persist: (desired: boolean) => void;
  private readonly listeners = new Set<() => void>();
  private foreground = false;
  /** Inputs changed while a start was in flight; reconcile again once it settles. */
  private recheck = false;
  private state: ListeningIntent;

  constructor(session: SoundSession, { desired, persist }: Options) {
    this.session = session;
    this.persist = persist;
    this.state = { desired, starting: false };
  }

  getState = (): ListeningIntent => this.state;

  subscribe = (listener: () => void): Unsubscribe => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** App came to (true) or left (false) the foreground. Duplicate calls are harmless. */
  setForeground(foreground: boolean): void {
    this.foreground = foreground;
    this.reconcile();
  }

  /** Explicit Start: the only way `desired` becomes true again after a Stop. */
  requestStart(): void {
    this.setDesired(true);
  }

  /** Explicit Stop: persisted at once, so it survives backgrounding and relaunch. */
  requestStop(): void {
    this.setDesired(false);
  }

  private setDesired(desired: boolean): void {
    if (desired !== this.state.desired) this.setState({ desired });
    this.persist(desired);
    this.reconcile();
  }

  private reconcile(): void {
    const status = this.session.getSnapshot().capture.status;

    if (!(this.state.desired && this.foreground)) {
      if (this.state.starting) this.recheck = true;
      if (this.state.starting || status !== 'idle') void this.session.stop();
      return;
    }

    if (this.state.starting) {
      this.recheck = true;
      return;
    }
    if (status === 'listening' || status === 'starting') return;

    // Permission is requested only here, i.e. only while the user wants to listen.
    this.setState({ starting: true });
    void this.session.start().finally(() => {
      this.setState({ starting: false });
      if (this.recheck) {
        this.recheck = false;
        this.reconcile();
      }
    });
  }

  private setState(patch: Partial<ListeningIntent>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
}
