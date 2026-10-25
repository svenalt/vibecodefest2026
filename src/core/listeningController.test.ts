import { describe, expect, it } from 'vitest';

import { PreferencesStore, type KeyValueStore } from '../app/preferences';
import { ListeningController } from './listeningController';
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
  // Fail loudly if two capture sessions would ever overlap.
  const start = input.start.bind(input);
  input.start = async () => {
    if (input.state.status === 'listening') throw new Error('second capture session');
    return start();
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
    expect(controller.getState()).toEqual({ desired: false, starting: false });
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
