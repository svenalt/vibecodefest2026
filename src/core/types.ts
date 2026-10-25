/** Platforms that will host a native YAMNet adapter. Shared code never branches on this. */
export type Platform = 'ios' | 'android';

/** Categories SoundCanvas surfaces. `silence` and `unknown` are valid outputs, never forced into a sound. */
export const SOUND_CATEGORIES = [
  'speech',
  'music',
  'dog_bark',
  'applause',
  'rain',
  'bell',
] as const;

export type SoundCategory = (typeof SOUND_CATEGORIES)[number];
export type PredictionCategory = SoundCategory | 'silence' | 'unknown';

/** One entry of the model's top-K output, as delivered by a native adapter. */
export interface RawScore {
  /** Index into the 521-class YAMNet output. */
  index: number;
  /** Label the native runtime reported for that index (used to verify class order). */
  label: string;
  /** Raw model score. Not a calibrated probability. */
  score: number;
}

/** What a native adapter emits for each inference. Identical shape on iOS and Android. */
export interface RawClassification {
  timestampMs: number;
  /** Highest-scoring classes, best first. */
  top: RawScore[];
  /** Number of classes in the model output (must be 521). */
  classCount: number;
}

/** Normalized, platform-independent prediction. */
export interface SoundPrediction {
  timestampMs: number;
  category: PredictionCategory;
  /** Raw YAMNet label that produced `category` (best raw label when `unknown`). */
  rawLabel: string;
  score: number;
  model: 'yamnet';
  platform: Platform;
}

/** Lightweight acoustic features computed from the same capture stream as classification. */
export interface AudioFeatures {
  timestampMs: number;
  /** 0..1 root-mean-square level of the last feature window. */
  rms: number;
  /** 0..1 peak amplitude of the last feature window. */
  peak: number;
  /** 0..1 energy in broad low / mid / high bands, normalized against each other. */
  bands: { low: number; mid: number; high: number };
}

export type PermissionStatus = 'undetermined' | 'granted' | 'denied';

export type CaptureStatus = 'idle' | 'starting' | 'listening' | 'stopping' | 'error';

export interface CaptureState {
  status: CaptureStatus;
  /** Sample rate / channels the hardware actually delivers. */
  hardwareSampleRate: number | null;
  hardwareChannelCount: number | null;
  /** Format fed to the model (always 16 kHz mono). */
  analysisSampleRate: number | null;
  analysisChannelCount: number | null;
  /** Number of output classes the loaded model reported, once known. */
  modelClassCount: number | null;
  error: string | null;
}

export const IDLE_CAPTURE_STATE: CaptureState = {
  status: 'idle',
  hardwareSampleRate: null,
  hardwareChannelCount: null,
  analysisSampleRate: null,
  analysisChannelCount: null,
  modelClassCount: null,
  error: null,
};

export interface SoundInputEvents {
  state: CaptureState;
  classification: RawClassification;
  features: AudioFeatures;
  error: { message: string };
}

export type Unsubscribe = () => void;

/**
 * The platform adapter contract, implemented by the iOS (Swift) and Android (Kotlin)
 * adapters through one native module. Shared UI and category logic only ever see
 * this interface.
 */
export interface SoundInput {
  readonly platform: Platform;
  getPermission(): Promise<PermissionStatus>;
  requestPermission(): Promise<PermissionStatus>;
  /** Starts one capture pipeline that feeds both classification and features. */
  start(): Promise<void>;
  /** Releases the microphone and all processing. Safe to call when idle. */
  stop(): Promise<void>;
  on<K extends keyof SoundInputEvents>(
    event: K,
    handler: (payload: SoundInputEvents[K]) => void,
  ): Unsubscribe;
}
