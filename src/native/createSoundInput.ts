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

export const NATIVE_MODULE_MISSING =
  'The SoundCanvasAudio native module is missing. Build a development build; Expo Go cannot run it.';

/**
 * The only place that looks at the host platform. Everything above receives a SoundInput.
 * iOS (Swift) and Android (Kotlin) share one native contract; when the module is not present
 * (Expo Go, web, a build without native code) the adapter reports a clear error instead.
 */
export function createSoundInput(): SoundInput {
  const platform = RNPlatform.OS === 'android' ? 'android' : 'ios';
  const native = requireOptionalNativeModule<SoundCanvasAudioModule>('SoundCanvasAudio');
  if ((RNPlatform.OS === 'ios' || RNPlatform.OS === 'android') && native) {
    return new NativeSoundInput(platform, native, resolveModelPath);
  }
  return new UnavailableSoundInput(platform, NATIVE_MODULE_MISSING);
}

export class UnavailableSoundInput implements SoundInput {
  private readonly emitter = new SoundInputEmitter();

  constructor(
    readonly platform: 'ios' | 'android',
    private readonly reason: string,
  ) {}

  async getPermission(): Promise<PermissionStatus> {
    return 'undetermined';
  }

  /** Nothing can be asked without the module; rejecting lets the session show why. */
  async requestPermission(): Promise<PermissionStatus> {
    throw new Error(this.reason);
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
