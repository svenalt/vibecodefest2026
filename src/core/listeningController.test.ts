import { describe, expect, it } from 'vitest';

import { PreferencesStore, type KeyValueStore } from '../app/preferences';
import { isForegroundAppState, ListeningController } from './listeningController';
import { SoundSession } from './soundSession';
import { FakeSoundInput, gate, settle } from './testing/fakeSoundInput';
import { IDLE_CAPTURE_STATE, type PermissionStatus } from './types';

function setup(desired = true, permission: PermissionStatus = 'granted', persist?: (on: boolean) => void) {
  const input = new FakeSoundInput('ios', permission);
  const session = new SoundSession(input);
  const persisted: boolean[] = [];
  const controller = new ListeningController(session, {
    desired,
    persist: (on) => {
      persisted.push(on);
      persist?.(on);
    },
  });
  // Fail loudly if two capture sessions would ever overlap, or a start would race a teardown.
  let stopsInFlight = 0;
  const start = input.start.bind(input);
  input.start = async () => {
    if (input.state.status === 'listening') throw new Error('second capture session');
    if (stopsInFlight > 0 || input.state.status === 'stopping') throw new Error('start during teardown');
    return start();
  };
  const stop = input.stop.bind(input);
  input.stop = async () => {
    stopsInFlight++;
    try {
      await stop();
    } finally {
      stopsInFlight--;
    }
  };
  const status = () => session.getSnapshot().capture.status;
  return { input, session, controller, persisted, status };
}

function memoryKv(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => void data.set(k, v),
  };
}

describe('ListeningController: desired listening vs. actual capture', () => {
  it('first install: asks for permission and listens on launch', async () => {
    const { input, controller, status } = setup(true, 'undetermined');
    controller.setForeground(true);
    await settle();
    expect(input.requestCalls).toBe(1);
    expect(status()).toBe('listening');
  });

  it('does nothing before the app is in the foreground', async () => {
    const { input } = setup(true);
    await settle();
    expect(input.startCalls).toBe(0);
  });

  it('Stop -> background -> foreground stays stopped', async () => {
    const { input, controller, persisted, status } = setup(true);
    controller.setForeground(true);
    await settle();
    controller.requestStop();
    await settle();
    expect(persisted).toEqual([false]);
    controller.setForeground(false);
    controller.setForeground(true);
    await settle();
    expect(status()).toBe('idle');
    expect(input.startCalls).toBe(1);
    expect(controller.getState().desired).toBe(false);
  });

  it('Stop survives a process restart through the preference store', async () => {
    const kv = memoryKv();
    const first = new PreferencesStore(kv);
    await first.hydrate();
    const a = setup(first.get().listening, 'granted', (listening) => first.update({ listening }));
    a.controller.setForeground(true);
    await settle();
    a.controller.requestStop();
    await first.flush();

    // Relaunch: fresh store, fresh session, permission still granted.
    const second = new PreferencesStore(kv);
    await second.hydrate();
    expect(second.get().listening).toBe(false);
    const b = setup(second.get().listening);
    b.controller.setForeground(true);
    await settle();
    expect(b.input.startCalls).toBe(0);
    expect(b.input.requestCalls).toBe(0);
    expect(b.status()).toBe('idle');
  });

  it('with listening off, foregrounding never prompts for permission', async () => {
    const { input, controller } = setup(false, 'undetermined');
    controller.setForeground(true);
    controller.setForeground(false);
    controller.setForeground(true);
    await settle();
    expect(input.requestCalls).toBe(0);
    expect(input.startCalls).toBe(0);
  });

  it('explicit Start -> background releases the mic -> foreground resumes', async () => {
    const { input, controller, persisted, status } = setup(false);
    controller.setForeground(true);
    controller.requestStart();
    await settle();
    expect(persisted).toEqual([true]);
    expect(status()).toBe('listening');
    controller.setForeground(false);
    await settle();
    expect(status()).toBe('idle');
    expect(input.stopCalls).toBe(1);
    expect(controller.getState().desired).toBe(true);
    controller.setForeground(true);
    await settle();
    expect(status()).toBe('listening');
    expect(input.startCalls).toBe(2);
  });

  it('Stop during a pending permission prompt never opens the microphone', async () => {
    const { input, controller, status } = setup(true, 'undetermined');
    const prompt = gate();
    input.permissionGate = prompt.promise;
    controller.setForeground(true);
    await settle();
    expect(controller.getState().starting).toBe(true);
    controller.requestStop();
    prompt.open(); // user taps Allow after pressing Stop
    await settle();
    expect(input.startCalls).toBe(0);
    expect(status()).toBe('idle');
    expect(controller.getState()).toEqual({ desired: false, starting: false, stopping: false });
  });

  it('Stop during slow capture start-up leaves the microphone released', async () => {
    const { input, controller, status } = setup(true);
    const startup = gate();
    input.startGate = startup.promise;
    controller.setForeground(true);
    await settle();
    expect(status()).toBe('starting');
    controller.requestStop();
    startup.open();
    await settle();
    expect(status()).toBe('idle');
    expect(input.state.status).toBe('idle');
  });

  it('the iOS prompt making the app inactive does not lose the first start', async () => {
    const { input, controller, status } = setup(true, 'undetermined');
    const prompt = gate();
    input.permissionGate = prompt.promise;
    controller.setForeground(true);
    await settle();
    controller.setForeground(false); // system alert -> inactive
    controller.setForeground(true); // alert dismissed -> active
    prompt.open();
    await settle();
    expect(status()).toBe('listening');
    expect(input.startCalls).toBe(1);
    expect(input.requestCalls).toBe(1);
  });

  it('rapid lifecycle changes end in one session matching the last state', async () => {
    const { input, controller, status } = setup(true);
    const startup = gate();
    input.startGate = startup.promise;
    for (let i = 0; i < 5; i++) {
      controller.setForeground(true);
      controller.setForeground(false);
    }
    controller.setForeground(true);
    input.startGate = null;
    startup.open();
    await settle();
    expect(status()).toBe('listening');
    expect(controller.getState().starting).toBe(false);

    controller.setForeground(false);
    controller.setForeground(true);
    controller.setForeground(false);
    await settle();
    expect(status()).toBe('idle');
  });

  it('duplicate active events start capture once', async () => {
    const { input, controller } = setup(true);
    controller.setForeground(true);
    controller.setForeground(true);
    await settle();
    controller.setForeground(true);
    await settle();
    expect(input.startCalls).toBe(1);
  });

  it('denied permission: no capture and no repeated prompt on foreground', async () => {
    const { input, controller, session } = setup(true, 'undetermined');
    input.nextPermissionAnswer = 'denied';
    controller.setForeground(true);
    await settle();
    controller.setForeground(false);
    controller.setForeground(true);
    await settle();
    expect(input.requestCalls).toBe(1);
    expect(input.startCalls).toBe(0);
    expect(session.getSnapshot().permission).toBe('denied');
  });

  it('permission revoked in the background: stays off, resumes once allowed again', async () => {
    const { input, controller, status } = setup(true);
    controller.setForeground(true);
    await settle();
    controller.setForeground(false);
    input.permission = 'denied';
    controller.setForeground(true);
    await settle();
    expect(status()).toBe('idle');
    expect(controller.getState().desired).toBe(true);
    controller.setForeground(false);
    input.permission = 'granted';
    controller.setForeground(true);
    await settle();
    expect(status()).toBe('listening');
  });

  it('an interruption stops capture without changing the intent; return resumes', async () => {
    const { input, controller, status } = setup(true);
    controller.setForeground(true);
    await settle();
    input.setState(IDLE_CAPTURE_STATE); // e.g. a phone call ended the audio session
    expect(controller.getState().desired).toBe(true);
    controller.setForeground(false);
    controller.setForeground(true);
    await settle();
    expect(status()).toBe('listening');
  });

  it('a failing start is not retried in a loop', async () => {
    const { input, controller, session } = setup(true);
    input.start = async () => {
      input.startCalls++;
      throw new Error('Model failed to load');
    };
    controller.setForeground(true);
    await settle();
    expect(input.startCalls).toBe(1);
    expect(session.getSnapshot().error).toBe('Model failed to load');
    expect(controller.getState().starting).toBe(false);
  });

  it('remount: the old controller releases capture, the new one honours the stored intent', async () => {
    const a = setup(true);
    a.controller.setForeground(true);
    await settle();
    a.controller.setForeground(false); // unmount
    await settle();
    expect(a.status()).toBe('idle');
    const b = setup(true);
    b.controller.setForeground(true);
    await settle();
    expect(b.status()).toBe('listening');
  });
});

/** REQ-011 P0-B: a stop that completes later must still be followed by a decision on the latest state. */
describe('ListeningController: asynchronous stop completion', () => {
  async function listeningWithHeldStop(reportStopping = false) {
    const t = setup(true);
    t.controller.setForeground(true);
    await settle();
    expect(t.status()).toBe('listening');
    const teardown = gate();
    t.input.stopGate = teardown.promise;
    t.input.reportStopping = reportStopping;
    return { ...t, teardown };
  }

  it('background -> foreground while the stop is still running resumes exactly once afterwards', async () => {
    const { input, controller, status, teardown } = await listeningWithHeldStop();
    controller.setForeground(false);
    controller.setForeground(true);
    await settle();
    expect(input.startCalls).toBe(1); // nothing starts while the old session is being released
    expect(controller.getState().stopping).toBe(true);
    input.stopGate = null;
    teardown.open();
    await settle();
    expect(status()).toBe('listening');
    expect(input.startCalls).toBe(2);
    expect(input.stopCalls).toBe(1);
    expect(controller.getState()).toEqual({ desired: true, starting: false, stopping: false });
  });

  it('the same ordering with a native `stopping` state', async () => {
    const { input, controller, status, teardown } = await listeningWithHeldStop(true);
    controller.setForeground(false);
    await settle();
    expect(status()).toBe('stopping');
    controller.setForeground(true);
    await settle();
    expect(input.startCalls).toBe(1);
    input.stopGate = null;
    teardown.open();
    await settle();
    expect(status()).toBe('listening');
    expect(input.startCalls).toBe(2);
    expect(input.stopCalls).toBe(1);
  });

  it('waits for a teardown the native side began on its own before starting', async () => {
    const { input, controller, status } = setup(true);
    controller.setForeground(true);
    await settle();
    controller.setForeground(false);
    await settle();
    expect(input.stopCalls).toBe(1);
    // The native module is still releasing after its own background handler, e.g. a slow engine stop.
    input.setState({ ...IDLE_CAPTURE_STATE, status: 'stopping' });
    controller.setForeground(true);
    await settle();
    expect(input.startCalls).toBe(1);
    input.setState(IDLE_CAPTURE_STATE);
    await settle();
    expect(status()).toBe('listening');
    expect(input.startCalls).toBe(2);
  });

  it('rapid transitions during a held stop end in one session matching the last state', async () => {
    const { input, controller, status, teardown } = await listeningWithHeldStop(true);
    for (let i = 0; i < 5; i++) {
      controller.setForeground(false);
      controller.setForeground(true);
    }
    await settle();
    expect(input.stopCalls).toBe(1);
    expect(input.startCalls).toBe(1);
    input.stopGate = null;
    teardown.open();
    await settle();
    expect(status()).toBe('listening');
    expect(input.startCalls).toBe(2);
    expect(input.stopCalls).toBe(1);
  });

  it('explicit Stop while the resume is pending stays stopped', async () => {
    const { input, controller, persisted, status, teardown } = await listeningWithHeldStop();
    controller.setForeground(false);
    controller.setForeground(true);
    controller.requestStop();
    input.stopGate = null;
    teardown.open();
    await settle();
    expect(status()).toBe('idle');
    expect(input.startCalls).toBe(1);
    expect(controller.getState()).toEqual({ desired: false, starting: false, stopping: false });
    expect(persisted).toEqual([false]);
  });

  it('ending in the background stays released', async () => {
    const { input, controller, status, teardown } = await listeningWithHeldStop();
    controller.setForeground(false);
    controller.setForeground(true);
    controller.setForeground(false);
    input.stopGate = null;
    teardown.open();
    await settle();
    expect(status()).toBe('idle');
    expect(input.startCalls).toBe(1);
    expect(controller.getState().desired).toBe(true);
  });

  it('a permission prompt cancelled by a held stop starts once after both settle', async () => {
    const { input, controller, status } = setup(true, 'undetermined');
    const prompt = gate();
    const teardown = gate();
    input.permissionGate = prompt.promise;
    input.stopGate = teardown.promise;
    controller.setForeground(true);
    await settle();
    controller.setForeground(false); // cancels the pending start
    controller.setForeground(true);
    prompt.open();
    await settle();
    expect(input.startCalls).toBe(0);
    input.stopGate = null;
    teardown.open();
    await settle();
    expect(status()).toBe('listening');
    expect(input.startCalls).toBe(1);
    expect(input.requestCalls).toBe(1);
  });

  it('Stop during slow start-up with a held stop leaves everything released', async () => {
    const { input, controller, status } = setup(true);
    const startup = gate();
    const teardown = gate();
    input.startGate = startup.promise;
    controller.setForeground(true);
    await settle();
    input.stopGate = teardown.promise;
    controller.requestStop();
    startup.open();
    await settle();
    input.stopGate = null;
    teardown.open();
    await settle();
    expect(status()).toBe('idle');
    expect(input.startCalls).toBe(1);
    expect(controller.getState()).toEqual({ desired: false, starting: false, stopping: false });
  });
});

/** REQ-011 P0-A: a fatal failure ends the session; only an explicit Start (or a real return) retries. */
describe('ListeningController: fatal session failures', () => {
  it('stops capture, does not restart on its own, and an explicit Start retries once', async () => {
    const { input, controller, session, status } = setup(true);
    controller.setForeground(true);
    await settle();
    input.emit('error', { message: 'Inference failed: model error' });
    await settle();
    expect(status()).toBe('idle');
    expect(input.stopCalls).toBe(1);
    expect(session.getSnapshot().error).toBe('Inference failed: model error');

    controller.setForeground(true); // duplicate notification
    await settle();
    expect(input.startCalls).toBe(1);

    controller.requestStart();
    await settle();
    expect(status()).toBe('listening');
    expect(session.getSnapshot().error).toBeNull();
    expect(input.startCalls).toBe(2);
  });

  it('a persistent start failure is tried once per Start, never in a loop', async () => {
    const { input, controller } = setup(true);
    const realStart = input.start;
    input.start = async () => {
      input.startCalls++;
      input.setState({ ...IDLE_CAPTURE_STATE, status: 'error', error: 'Model failed to load' });
      throw new Error('Model failed to load');
    };
    controller.setForeground(true);
    await settle();
    controller.requestStart();
    await settle();
    controller.setForeground(true);
    await settle();
    expect(input.startCalls).toBe(2);
    input.start = realStart;
  });
});

describe('isForegroundAppState', () => {
  it('only an active app counts as foreground', () => {
    expect(isForegroundAppState('active')).toBe(true);
    for (const s of ['background', 'inactive', 'unknown', 'extension', null, undefined]) {
      expect(isForegroundAppState(s)).toBe(false);
    }
  });
});

/** REQ-011 P1-C: Stop works at once even when it cannot be saved, and is never undone by that. */
describe('ListeningController with unavailable storage', () => {
  it('Stop releases the microphone immediately and stays off although saving fails', async () => {
    const kv = memoryKv();
    const store = new PreferencesStore(
      {
        getItem: kv.getItem,
        setItem: async () => {
          throw new Error('storage unavailable');
        },
      },
      { retryDelaysMs: [1] },
    );
    await store.hydrate();
    const { input, controller, status } = setup(store.get().listening, 'granted', (listening) =>
      store.update({ listening }),
    );
    controller.setForeground(true);
    await settle();
    expect(status()).toBe('listening');

    controller.requestStop();
    await settle();
    expect(status()).toBe('idle');
    expect(input.stopCalls).toBe(1);
    await store.flush();
    expect(store.getSaveState()).toBe('failed');
    expect(controller.getState().desired).toBe(false);
    expect(store.get().listening).toBe(false);

    controller.setForeground(false);
    controller.setForeground(true);
    await settle();
    expect(status()).toBe('idle');
    expect(input.startCalls).toBe(1);
  });
});

