import type { PermissionStatus } from '../../core/types';
import type { SoundCanvasAudioModule } from '../nativeSoundInput';

/** Stand-in for the Swift/Kotlin module: records calls and lets a test fire native events. */
export function fakeNative() {
  const listeners = new Map<string, Array<(p: any) => void>>();
  const calls: string[] = [];
  let permission: PermissionStatus = 'granted';
  let requestAnswer: PermissionStatus = 'granted';
  let startError: Error | null = null;
  const native = {
    getPermissionStatus: async () => permission,
    requestPermission: async () => {
      calls.push('requestPermission');
      return (permission = requestAnswer);
    },
    start: async (modelPath: string) => {
      calls.push(`start:${modelPath}`);
      if (startError) throw startError;
    },
    stop: async () => {
      calls.push('stop');
    },
    addListener(event: string, listener: (p: any) => void) {
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
      return { remove: () => listeners.set(event, (listeners.get(event) ?? []).filter((l) => l !== listener)) };
    },
  } as unknown as SoundCanvasAudioModule;
  const fire = (event: string, payload: unknown) => listeners.get(event)?.forEach((l) => l(payload));
  return {
    native,
    calls,
    fire,
    setPermission: (p: PermissionStatus) => (permission = p),
    /** What the user picks in the system prompt. */
    answerPermissionWith: (p: PermissionStatus) => (requestAnswer = p),
    failStartWith: (e: Error | null) => (startError = e),
  };
}
