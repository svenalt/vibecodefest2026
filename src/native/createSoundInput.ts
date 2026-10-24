import { requireOptionalNativeModule } from 'expo';
import { Platform as RNPlatform } from 'react-native';

import { SoundInputEmitter } from '../core/emitter';
import {
  IDLE_CAPTURE_STATE,
  type PermissionStatus,
  type SoundInput,
  type SoundInputEvents,
  type Unsubscribe,
} from '../core/types';
import { resolveModelPath } from './modelAsset';
import { NativeSoundInput, type SoundCanvasAudioModule } from './nativeSoundInput';

/**
 * The only place that looks at the host platform. Everything above receives a SoundInput.
 * Returns an adapter that reports a clear error when the native module is not present
 * (Expo Go, web, or Android before its Kotlin adapter exists).
 */
export function createSoundInput(): SoundInput {
  const platform = RNPlatform.OS === 'android' ? 'android' : 'ios';
  const native = requireOptionalNativeModule<SoundCanvasAudioModule>('SoundCanvasAudio');
  if (RNPlatform.OS === 'ios' && native) {
    return new NativeSoundInput('ios', native, resolveModelPath);
  }

  const reason =
    RNPlatform.OS === 'android'
      ? 'The Android YAMNet adapter is not implemented yet (see docs/android-adapter.md).'
      : 'The SoundCanvasAudio native module is missing. Build a development build; Expo Go cannot run it.';
  return new UnavailableSoundInput(platform, reason);
}

class UnavailableSoundInput implements SoundInput {
  private readonly emitter = new SoundInputEmitter();

  constructor(
    readonly platform: 'ios' | 'android',
    private readonly reason: string,
  ) {}

  async getPermission(): Promise<PermissionStatus> {
    return 'undetermined';
  }

  async requestPermission(): Promise<PermissionStatus> {
    return 'undetermined';
  }

  async start(): Promise<void> {
    this.emitter.emit('state', { ...IDLE_CAPTURE_STATE, status: 'error', error: this.reason });
    throw new Error(this.reason);
  }

  async stop(): Promise<void> {
    this.emitter.emit('state', IDLE_CAPTURE_STATE);
  }

  on<K extends keyof SoundInputEvents>(
    event: K,
    handler: (payload: SoundInputEvents[K]) => void,
  ): Unsubscribe {
    return this.emitter.on(event, handler);
  }
}
