import type { SoundInputEvents, Unsubscribe } from './types';

/** Minimal typed event fan-out shared by SoundInput implementations. */
export class SoundInputEmitter {
  private handlers: { [K in keyof SoundInputEvents]: Set<(p: SoundInputEvents[K]) => void> } = {
    state: new Set(),
    classification: new Set(),
    features: new Set(),
    error: new Set(),
  };

  on<K extends keyof SoundInputEvents>(
    event: K,
    handler: (payload: SoundInputEvents[K]) => void,
  ): Unsubscribe {
    const set = this.handlers[event] as Set<(p: SoundInputEvents[K]) => void>;
    set.add(handler);
    return () => {
      set.delete(handler);
    };
  }

  emit<K extends keyof SoundInputEvents>(event: K, payload: SoundInputEvents[K]): void {
    for (const handler of [...(this.handlers[event] as Set<(p: SoundInputEvents[K]) => void>)]) {
      handler(payload);
    }
  }
}
