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
  requestCalls = 0;
  /** When set, requestPermission() waits for it, like a system prompt the user has not answered yet. */
  permissionGate: Promise<void> | null = null;
  /** When set, start() reports `starting` and waits for it, like a slow model load. */
  startGate: Promise<void> | null = null;

  private readonly emitter = new SoundInputEmitter();

  constructor(platform: Platform = 'ios', permission: PermissionStatus = 'granted') {
    this.platform = platform;
    this.permission = permission;
  }

  async getPermission(): Promise<PermissionStatus> {
    return this.permission;
  }

  async requestPermission(): Promise<PermissionStatus> {
    this.requestCalls++;
    if (this.permissionGate) await this.permissionGate;
    this.permission = this.nextPermissionAnswer;
    return this.permission;
  }

  async start(): Promise<void> {
    this.startCalls++;
    if (this.startGate) {
      this.setState({ ...IDLE_CAPTURE_STATE, status: 'starting' });
      await this.startGate;
    }
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

/** A promise plus its resolver, for holding a fake prompt or start-up open in tests. */
export function gate(): { promise: Promise<void>; open: () => void } {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => (open = resolve));
  return { promise, open };
}

/** Lets every pending promise callback run. */
export async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
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
