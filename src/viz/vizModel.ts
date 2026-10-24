import type { Current } from '../core/eventTracker';
import type { AudioFeatures, SoundCategory } from '../core/types';

export type Motif = 'waves' | 'pulses' | 'particles' | 'forms' | 'ambient';
export const MOTIFS: readonly Motif[] = ['waves', 'pulses', 'particles', 'forms', 'ambient'];

const MOTIF_FOR_CATEGORY: Record<SoundCategory, Motif> = {
  speech: 'waves',
  applause: 'pulses',
  bell: 'pulses',
  dog_bark: 'pulses',
  rain: 'particles',
  music: 'forms',
};

/** Broad sound class -> visual motif. Unknown and quiet fall back to calm ambient motion. */
export function motifForCurrent(current: Current): Motif {
  return current.kind === 'event' ? MOTIF_FOR_CATEGORY[current.category] : 'ambient';
}

/** Compresses raw RMS (typically 0.001-0.3) into a 0..1 visual intensity. */
export function levelFromRms(rms: number): number {
  if (!(rms > 0)) return 0;
  return Math.min(1, Math.sqrt(rms * 4));
}

export interface VizFrame {
  /** Smoothed 0..1 loudness. */
  level: number;
  bands: { low: number; mid: number; high: number };
  /** Cross-fade weight per motif; sums to 1. */
  weights: Record<Motif, number>;
  /** Seconds of animation clock. */
  time: number;
}

const ATTACK_PER_SECOND = 14; // fast rise so hits feel immediate
const RELEASE_PER_SECOND = 3.5; // slow fall so it never strobes
const BLEND_PER_SECOND = 3;

/** Smooths features and cross-fades motifs. Pure state machine, driven by dt. */
export class VizState {
  private level = 0;
  private bands = { low: 0, mid: 0, high: 0 };
  private weights: Record<Motif, number> = { waves: 0, pulses: 0, particles: 0, forms: 0, ambient: 1 };
  private time = 0;

  step(dtSeconds: number, features: Pick<AudioFeatures, 'rms' | 'bands'> | null, motif: Motif): VizFrame {
    const dt = Math.min(Math.max(dtSeconds, 0), 0.1);
    this.time += dt;

    const targetLevel = features ? levelFromRms(features.rms) : 0;
    const rate = targetLevel > this.level ? ATTACK_PER_SECOND : RELEASE_PER_SECOND;
    this.level += (targetLevel - this.level) * (1 - Math.exp(-rate * dt));

    const targetBands = features?.bands ?? { low: 0, mid: 0, high: 0 };
    const k = 1 - Math.exp(-6 * dt);
    this.bands = {
      low: this.bands.low + (targetBands.low - this.bands.low) * k,
      mid: this.bands.mid + (targetBands.mid - this.bands.mid) * k,
      high: this.bands.high + (targetBands.high - this.bands.high) * k,
    };

    const blend = 1 - Math.exp(-BLEND_PER_SECOND * dt);
    for (const m of MOTIFS) {
      this.weights[m] += ((m === motif ? 1 : 0) - this.weights[m]) * blend;
    }
    return this.frame();
  }

  frame(): VizFrame {
    return {
      level: this.level,
      bands: { ...this.bands },
      weights: { ...this.weights },
      time: this.time,
    };
  }

  /** A fixed composition for Reduce Motion: the current motif, mid intensity, no clock. */
  static staticFrame(motif: Motif): VizFrame {
    const weights = { waves: 0, pulses: 0, particles: 0, forms: 0, ambient: 0 } as Record<Motif, number>;
    weights[motif] = 1;
    return { level: 0.5, bands: { low: 0.4, mid: 0.4, high: 0.2 }, weights, time: 0 };
  }
}
