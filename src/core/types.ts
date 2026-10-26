import type { VisualFamily } from './yamnet/taxonomy';

/** Platforms that will host a native YAMNet adapter. Shared code never branches on this. */
export type Platform = 'ios' | 'android';

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
  /** The YAMNET_TOP_K highest-scoring classes, best first (ties by lower index). */
  top: RawScore[];
  /** Number of classes in the model output (must be 521). */
  classCount: number;
}

/** One validated top-K entry of an inference, with its visual family from the shared taxonomy. */
export interface SoundCandidate {
  /** YAMNet output index, 0..520. */
  index: number;
  /** Pinned raw YAMNet label at that index. */
  rawLabel: string;
  /** Raw model score. Not a calibrated probability. */
  score: number;
  family: VisualFamily;
}

/**
 * Normalized, platform-independent result of one inference: every top-K candidate, best first
 * (ties by lower index). Nothing is filtered or collapsed here; confidence gating, smoothing and
 * the choice of what to show belong to the tracker.
 */
export interface SoundPrediction {
  timestampMs: number;
  candidates: readonly SoundCandidate[];
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
 * adapters through one native module. Shared UI and recognition logic only ever see
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
