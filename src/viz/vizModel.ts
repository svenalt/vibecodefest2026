import { currentSounds, type Current } from '../core/eventTracker';
import type { AudioFeatures } from '../core/types';
import { VISUAL_FAMILIES, type VisualFamily } from '../core/yamnet/taxonomy';

export type Motif = 'waves' | 'pulses' | 'particles' | 'forms' | 'ambient';

/** Accent colours the painter knows, per theme. */
export type Tint = 'aqua' | 'amber' | 'lav' | 'mint' | 'gold' | 'shine';

/** Animated, or one still frame. There is no "off": the artwork is always shown. */
export type VizMode = 'animated' | 'reduced';

/** Motion follows the device alone: Reduce Motion gives the still artwork (REQ-010). */
export function vizModeFor(deviceReducesMotion: boolean): VizMode {
  return deviceReducesMotion ? 'reduced' : 'animated';
}
export const MOTIFS: readonly Motif[] = ['waves', 'pulses', 'particles', 'forms', 'ambient'];

/** A visual layer: one per sound family, plus `calm` for quiet, unknown and not listening. */
export type Layer = VisualFamily | 'calm';
export const LAYERS: readonly Layer[] = [...VISUAL_FAMILIES, 'calm'];

/**
 * Broad family -> one of the existing motifs plus an accent tint. The original six sounds keep
 * their accepted look: speech = lavender waves, applause/bark/bell = gold pulses, rain = mint
 * particles, music = aqua forms. Recognition only colours the scene; motion comes from the sound.
 */
export const LAYER_LOOK: Record<Layer, { motif: Motif; tint: Tint }> = {
  voice: { motif: 'waves', tint: 'lav' },
  people: { motif: 'pulses', tint: 'gold' },
  music: { motif: 'forms', tint: 'aqua' },
  animals: { motif: 'pulses', tint: 'gold' },
  nature: { motif: 'particles', tint: 'mint' },
  vehicles: { motif: 'waves', tint: 'amber' },
  household: { motif: 'pulses', tint: 'aqua' },
  machines: { motif: 'waves', tint: 'mint' },
  signals: { motif: 'pulses', tint: 'gold' },
  impacts: { motif: 'pulses', tint: 'amber' },
  other: { motif: 'ambient', tint: 'shine' },
  calm: { motif: 'ambient', tint: 'shine' },
};

/** Target cross-fade weight per layer (missing = 0); the weights sum to 1. */
export type VizScene = Readonly<Partial<Record<Layer, number>>>;

/** Share of the scene each secondary sound takes; the primary keeps the rest (at least 70%). */
export const SECONDARY_SHARE = 0.15;

/**
 * The look the artwork moves toward: the primary sound leads and each secondary sound adds a
 * fixed, restrained share. Quiet, unknown and stopped all give the calm scene.
 */
export function sceneFor(current: Current): VizScene {
  const sounds = currentSounds(current);
  if (sounds.length === 0) return { calm: 1 };
  const scene: Partial<Record<Layer, number>> = {};
  sounds.forEach((s, i) => {
    const share = i === 0 ? 1 - SECONDARY_SHARE * (sounds.length - 1) : SECONDARY_SHARE;
    scene[s.family] = (scene[s.family] ?? 0) + share;
  });
  return scene;
}

/** A stable string for a scene, for effect dependencies. */
export function sceneKey(scene: VizScene): string {
  return LAYERS.filter((l) => (scene[l] ?? 0) > 0)
    .map((l) => `${l}:${scene[l]!.toFixed(3)}`)
    .join(',');
}

/** The layer with the largest share (ties: earlier in LAYERS). */
export function leadLayer(scene: VizScene): Layer {
  let lead: Layer = 'calm';
  let best = -1;
  for (const l of LAYERS) {
    const w = scene[l] ?? 0;
    if (w > best) {
      lead = l;
      best = w;
    }
  }
  return lead;
}

function motifWeights(layers: Readonly<Record<Layer, number>>): Record<Motif, number> {
  const weights: Record<Motif, number> = { waves: 0, pulses: 0, particles: 0, forms: 0, ambient: 0 };
  for (const l of LAYERS) weights[LAYER_LOOK[l].motif] += layers[l];
  return weights;
}

/** Compresses raw RMS (typically 0.001-0.3) into a 0..1 visual intensity. */
export function levelFromRms(rms: number): number {
  if (!(rms > 0)) return 0;
  return Math.min(1, Math.sqrt(rms * 4));
}

/** A short-lived accent emitted by a foreground sound onset. */
export interface Burst {
  /** Seconds since the onset. */
  age: number;
  /** 0..1 strength at the onset. */
  strength: number;
  /** Stable 0..1 value so each burst varies its placement and shape without flicker. */
  seed: number;
  /** Look of the leading layer when the sound arrived; the burst keeps it while it fades. */
  motif: Motif;
  tint: Tint;
}

export interface VizFrame {
  /** Smoothed 0..1 foreground intensity (relative to recent ambience). */
  level: number;
  /** 0..1 transient envelope: jumps on an onset, decays within about a second. */
  accent: number;
  /** Band energy: tone balance scaled by `level`, so all bands are ~0 in silence or steady noise. */
  bands: { low: number; mid: number; high: number };
  /** Cross-fade weight per motif (the sum of its layers); sums to 1. */
  weights: Record<Motif, number>;
  /** Cross-fade weight per layer; sums to 1. */
  layers: Record<Layer, number>;
  /** Seconds of animation clock. Only for gentle breathing, never a substitute for sound. */
  time: number;
  /** Drift phase that advances slowly at rest and faster with foreground sound. */
  flow: number;
  /** Live onset accents, oldest first, at most MAX_BURSTS. */
  bursts: readonly Burst[];
  /** False when no features arrive (not listening): the scene shows its calm idle state. */
  listening: boolean;
  /** 0..1, eases toward 1 while listening and 0 when stopped, so the idle scene fades in gently. */
  presence: number;
}

/** The live features the scene reads; `peak` is optional so older fixtures still work. */
export type VizInput = Pick<AudioFeatures, 'rms' | 'bands'> & { peak?: number };

const MIN_DB = -70;
const NOISE_GATE_DB = 2;
const CONTRAST_SCALE_DB = 10;
const BASELINE_RISE_TAU_S = 3; // sustained loudness becomes the new normal within seconds
const BASELINE_FALL_TAU_S = 1.2; // quieter surroundings regain sensitivity quickly
const BASELINE_MAX_PULL_DB = 12; // a single transient cannot drag the baseline far
const BASELINE_START_OFFSET_DB = 4; // first sound is visible right away, then settles

/** RMS to a compressed dB scale, floored so silence and invalid values are safe. */
export function dbFromRms(rms: number): number {
  if (!(rms > 0)) return MIN_DB;
  return Math.max(MIN_DB, 20 * Math.log10(rms));
}

/** Foreground contrast (dB above the ambient baseline) to a bounded, smooth 0..1 intensity. */
export function intensityFromContrast(contrastDb: number): number {
  const c = contrastDb - NOISE_GATE_DB;
  return c > 0 ? 1 - Math.exp(-c / CONTRAST_SCALE_DB) : 0;
}

/** Slowly adapting ambient level in dB; returns how far a new reading stands out from it. */
class AmbientBaseline {
  private db: number | null = null;

  /** Updates with one reading and returns its intensity relative to the previous baseline. */
  update(db: number, dt: number): number {
    if (this.db === null) this.db = db - BASELINE_START_OFFSET_DB;
    const intensity = intensityFromContrast(db - this.db);
    const diff = Math.min(db - this.db, BASELINE_MAX_PULL_DB);
    const tau = diff > 0 ? BASELINE_RISE_TAU_S : BASELINE_FALL_TAU_S;
    this.db += diff * (1 - Math.exp(-dt / tau));
    return intensity;
  }

  reset(): void {
    this.db = null; // not listening: next session starts fresh, no calibration screen
  }
}

const ATTACK_PER_SECOND = 14; // fast rise so hits feel immediate
const RELEASE_PER_SECOND = 3.5; // slow fall so it never strobes
const BLEND_PER_SECOND = 3;

const PEAK_WEIGHT = 0.85; // a short click shows up through the peak even if RMS barely moves
const ONSET_FOLLOW_TAU_S = 0.35; // what "just now" means when spotting a rise
const ONSET_MIN = 0.2; // rise needed for a burst; keeps steady noise and jitter quiet
const ONSET_COOLDOWN_S = 0.22; // at most ~4 bursts per second, so it never strobes
const ACCENT_DECAY_PER_SECOND = 2.6;
export const BURST_LIFE_S = 1.8;
export const MAX_BURSTS = 6;
const FLOW_REST_PER_SECOND = 0.22;
const FLOW_SOUND_PER_SECOND = 1.5;
const PRESENCE_PER_SECOND = 1.5;

/** Smooths features, detects onsets and cross-fades motifs. Pure state machine, driven by dt. */
export class VizState {
  private level = 0;
  private accent = 0;
  private tone = { low: 0, mid: 0, high: 0 };
  private layers: Record<Layer, number> = Object.fromEntries(LAYERS.map((l) => [l, l === 'calm' ? 1 : 0])) as Record<
    Layer,
    number
  >;
  private time = 0;
  private flow = 0;
  private rmsBaseline = new AmbientBaseline();
  private peakBaseline = new AmbientBaseline();
  private follow = 0;
  private sinceBurst = Infinity;
  private bursts: Burst[] = [];
  private seed = 0x2f6e2b1;
  private listening = false;
  private presence = 0;

  step(dtSeconds: number, features: VizInput | null, scene: VizScene): VizFrame {
    const dt = Math.min(Math.max(dtSeconds, 0), 0.1);
    this.time += dt;
    this.listening = features !== null;
    this.presence += ((this.listening ? 1 : 0) - this.presence) * (1 - Math.exp(-PRESENCE_PER_SECOND * dt));

    // Artistic only: relative to recent ambience, never feeds classification or alerts.
    let targetLevel = 0;
    let drive = 0;
    if (features) {
      targetLevel = this.rmsBaseline.update(dbFromRms(features.rms), dt);
      const peak = features.peak === undefined ? 0 : this.peakBaseline.update(dbFromRms(features.peak), dt);
      drive = Math.max(targetLevel, peak * PEAK_WEIGHT);
    } else {
      this.rmsBaseline.reset();
      this.peakBaseline.reset();
    }
    const rate = targetLevel > this.level ? ATTACK_PER_SECOND : RELEASE_PER_SECOND;
    this.level += (targetLevel - this.level) * (1 - Math.exp(-rate * dt));

    this.stepOnsets(dt, drive, LAYER_LOOK[leadLayer(scene)]);

    const targetTone = features?.bands ?? { low: 0, mid: 0, high: 0 };
    const k = 1 - Math.exp(-6 * dt);
    this.tone = {
      low: this.tone.low + (targetTone.low - this.tone.low) * k,
      mid: this.tone.mid + (targetTone.mid - this.tone.mid) * k,
      high: this.tone.high + (targetTone.high - this.tone.high) * k,
    };

    this.flow += dt * (FLOW_REST_PER_SECOND + FLOW_SOUND_PER_SECOND * Math.max(this.level, this.accent * 0.6));

    // Every layer eases toward its share at the same rate, so blends stay predictable and sum to 1.
    const blend = 1 - Math.exp(-BLEND_PER_SECOND * dt);
    for (const l of LAYERS) {
      this.layers[l] += ((scene[l] ?? 0) - this.layers[l]) * blend;
    }
    return this.frame();
  }

  private stepOnsets(dt: number, drive: number, look: { motif: Motif; tint: Tint }): void {
    this.sinceBurst += dt;
    for (const b of this.bursts) b.age += dt;
    this.bursts = this.bursts.filter((b) => b.age < BURST_LIFE_S);
    this.accent *= Math.exp(-ACCENT_DECAY_PER_SECOND * dt);

    const rise = drive - this.follow;
    this.follow += (drive - this.follow) * (1 - Math.exp(-dt / ONSET_FOLLOW_TAU_S));
    if (rise < ONSET_MIN || this.sinceBurst < ONSET_COOLDOWN_S) return;

    const strength = Math.min(1, 0.25 + rise * 0.9 + drive * 0.25);
    this.sinceBurst = 0;
    this.accent = Math.max(this.accent, strength);
    this.bursts.push({ age: 0, strength, seed: this.nextSeed(), motif: look.motif, tint: look.tint });
    if (this.bursts.length > MAX_BURSTS) this.bursts.shift();
  }

  private nextSeed(): number {
    this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
    return this.seed / 4294967296;
  }

  frame(): VizFrame {
    return {
      level: this.level,
      accent: this.accent,
      bands: {
        low: this.tone.low * this.level,
        mid: this.tone.mid * this.level,
        high: this.tone.high * this.level,
      },
      weights: motifWeights(this.layers),
      layers: { ...this.layers },
      time: this.time,
      flow: this.flow,
      bursts: this.bursts.map((b) => ({ ...b })),
      listening: this.listening,
      presence: this.presence,
    };
  }

  /** A fixed composition for Reduce Motion: the current scene, gentle intensity, no clock, no bursts. */
  static staticFrame(scene: VizScene): VizFrame {
    const layers = Object.fromEntries(LAYERS.map((l) => [l, scene[l] ?? 0])) as Record<Layer, number>;
    return {
      level: 0.35,
      accent: 0,
      bands: { low: 0.14, mid: 0.14, high: 0.07 },
      weights: motifWeights(layers),
      layers,
      time: 0,
      flow: 0,
      bursts: [],
      listening: true,
      presence: 1,
    };
  }
}
