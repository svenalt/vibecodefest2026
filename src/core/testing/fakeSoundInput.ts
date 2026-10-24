import { SoundInputEmitter } from '../emitter';
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
} from '../types';
import { YAMNET_NUM_CLASSES } from '../yamnet/constants';
import { YAMNET_LABELS } from '../yamnet/labels';

/** In-memory SoundInput used by tests and previews. Can impersonate either platform. */
export class FakeSoundInput implements SoundInput {
  readonly platform: Platform;
  permission: PermissionStatus;
  /** Permission the user "chooses" when requestPermission() is called. */
  nextPermissionAnswer: PermissionStatus = 'granted';
  state: CaptureState = IDLE_CAPTURE_STATE;
  startCalls = 0;
  stopCalls = 0;

  private readonly emitter = new SoundInputEmitter();

  constructor(platform: Platform = 'ios', permission: PermissionStatus = 'granted') {
    this.platform = platform;
    this.permission = permission;
  }

  async getPermission(): Promise<PermissionStatus> {
    return this.permission;
  }

  async requestPermission(): Promise<PermissionStatus> {
    this.permission = this.nextPermissionAnswer;
    return this.permission;
  }

  async start(): Promise<void> {
    this.startCalls++;
    this.setState({
      status: 'listening',
      hardwareSampleRate: 48000,
      hardwareChannelCount: 1,
      analysisSampleRate: 16000,
      analysisChannelCount: 1,
      modelClassCount: YAMNET_NUM_CLASSES,
      error: null,
    });
  }

  async stop(): Promise<void> {
    this.stopCalls++;
    this.setState(IDLE_CAPTURE_STATE);
  }

  on<K extends keyof SoundInputEvents>(
    event: K,
    handler: (payload: SoundInputEvents[K]) => void,
  ): Unsubscribe {
    return this.emitter.on(event, handler);
  }

  setState(state: CaptureState): void {
    this.state = state;
    this.emit('state', state);
  }

  emit<K extends keyof SoundInputEvents>(event: K, payload: SoundInputEvents[K]): void {
    this.emitter.emit(event, payload);
  }

  /** Emits a classification whose top-K is built from `[label, score]` pairs in YAMNet label order. */
  emitScores(timestampMs: number, scores: ReadonlyArray<readonly [label: string, score: number]>): void {
    this.emit('classification', fakeClassification(timestampMs, scores));
  }

  emitFeatures(partial: Partial<AudioFeatures> = {}): void {
    this.emit('features', {
      timestampMs: 0,
      rms: 0.1,
      peak: 0.2,
      bands: { low: 0.4, mid: 0.4, high: 0.2 },
      ...partial,
    });
  }
}

export function fakeClassification(
  timestampMs: number,
  scores: ReadonlyArray<readonly [label: string, score: number]>,
): RawClassification {
  const top = scores.map(([label, score]) => {
    const index = YAMNET_LABELS.indexOf(label);
    if (index < 0) throw new Error(`Unknown YAMNet label in test: ${label}`);
    return { index, label, score };
  });
  top.sort((a, b) => b.score - a.score);
  return { timestampMs, top, classCount: YAMNET_NUM_CLASSES };
}
