import { SoundInputEmitter } from '../core/emitter';
import {
  IDLE_CAPTURE_STATE,
  type AudioFeatures,
  type CaptureState,
  type PermissionStatus,
  type Platform,
  type RawClassification,
  type SoundInput,
  type SoundInputEvents,
  type Unsubscribe,
} from '../core/types';

interface NativeSubscription {
  remove(): void;
}

/** The surface of the native SoundCanvasAudio module (Swift on iOS, Kotlin on Android). */
export interface SoundCanvasAudioModule {
  getPermissionStatus(): Promise<PermissionStatus>;
  requestPermission(): Promise<PermissionStatus>;
  start(modelPath: string): Promise<void>;
  stop(): Promise<void>;
  addListener(event: 'onState', listener: (p: NativeState) => void): NativeSubscription;
  addListener(event: 'onClassification', listener: (p: RawClassification) => void): NativeSubscription;
  addListener(event: 'onFeatures', listener: (p: AudioFeatures) => void): NativeSubscription;
  addListener(event: 'onError', listener: (p: { message: string }) => void): NativeSubscription;
}

interface NativeState {
  status: CaptureState['status'];
  hardwareSampleRate?: number | null;
  hardwareChannelCount?: number | null;
  analysisSampleRate?: number | null;
  analysisChannelCount?: number | null;
  error?: string | null;
}

/** SoundInput backed by the native module. The same class serves iOS and Android. */
export class NativeSoundInput implements SoundInput {
  readonly platform: Platform;
  private readonly native: SoundCanvasAudioModule;
  private readonly resolveModelPath: () => Promise<string>;
  private readonly emitter = new SoundInputEmitter();
  private readonly subscriptions: NativeSubscription[];
  private state: CaptureState = IDLE_CAPTURE_STATE;

  constructor(
    platform: Platform,
    native: SoundCanvasAudioModule,
    resolveModelPath: () => Promise<string>,
  ) {
    this.platform = platform;
    this.native = native;
    this.resolveModelPath = resolveModelPath;

    this.subscriptions = [
      native.addListener('onState', (s) => {
        // The class count survives state changes within a session and resets with the session.
        const keepCount = s.status === 'listening' || s.status === 'stopping';
        this.setState({
          status: s.status,
          hardwareSampleRate: s.hardwareSampleRate ?? null,
          hardwareChannelCount: s.hardwareChannelCount ?? null,
          analysisSampleRate: s.analysisSampleRate ?? null,
          analysisChannelCount: s.analysisChannelCount ?? null,
          modelClassCount: keepCount ? this.state.modelClassCount : null,
          error: s.error ?? null,
        });
      }),
      native.addListener('onClassification', (c) => {
        if (this.state.modelClassCount !== c.classCount) {
          this.setState({ ...this.state, modelClassCount: c.classCount });
        }
        this.emitter.emit('classification', c);
      }),
      native.addListener('onFeatures', (f) => this.emitter.emit('features', f)),
      native.addListener('onError', (e) => this.emitter.emit('error', e)),
    ];
  }

  getPermission(): Promise<PermissionStatus> {
    return this.native.getPermissionStatus();
  }

  requestPermission(): Promise<PermissionStatus> {
    return this.native.requestPermission();
  }

  async start(): Promise<void> {
    const modelPath = await this.resolveModelPath();
    await this.native.start(modelPath);
  }

  async stop(): Promise<void> {
    await this.native.stop();
  }

  on<K extends keyof SoundInputEvents>(
    event: K,
    handler: (payload: SoundInputEvents[K]) => void,
  ): Unsubscribe {
    return this.emitter.on(event, handler);
  }

  dispose(): void {
    this.subscriptions.forEach((s) => s.remove());
  }

  private setState(state: CaptureState): void {
    this.state = state;
    this.emitter.emit('state', state);
  }
}
