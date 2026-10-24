import { BURST_LIFE_S, type Burst, type Motif, type VizFrame } from './vizModel';

/**
 * Universe V3 geometry: a landscape of translucent light ribbons ("sheets") flowing across the
 * frame. Pure and Skia-free, so shape, sound response and bounds are unit-tested; the painter
 * only turns these samples into paths.
 *
 * Each sheet is a centre line with a half-thickness and a slow twist. Its hairline threads sit
 * at `centre + half * (s * cos(twist))` for s in [-1, 1], so where the twist turns edge-on the
 * threads converge into a bright fold, like silk seen from the side.
 *
 * Positions are artistic only: nothing here encodes where a sound came from.
 */

const TAU = Math.PI * 2;

export interface Sheet {
  /** Resting centre line within the ribbon zone: 0 = zone top, 1 = zone bottom. */
  pos: number;
  /** Change of `pos` from the left edge to the right edge (diagonal sweep). */
  tilt: number;
  /** Crest height and half-thickness, as fractions of the layout's unit size. */
  amp: number;
  width: number;
  /** Wave cycles across the frame (before the aspect-ratio scale) and phase. */
  freq: number;
  phase: number;
  /** Travel per unit of `flow`: waves move along the ribbon, never reseed. */
  speed: number;
  /** Twists across the frame, and how fast the folds drift. */
  twist: number;
  twistSpeed: number;
  /** 0 = far back, 1 = front. Front sheets answer onsets sooner and more strongly. */
  depth: number;
  /** How much low-band energy thickens this sheet and mid-band energy bends its crests. */
  lowGain: number;
  midGain: number;
  /** Hairline threads drawn across the sheet. */
  threads: number;
}

/** Back to front: far teal, warm middle, warm-to-cool diagonal, cool foreground, low ember glow. */
export const SHEETS: readonly Sheet[] = [
  { pos: 0.22, tilt: -0.24, amp: 0.13, width: 0.08, freq: 1.25, phase: 0.6, speed: 0.35, twist: 0.8, twistSpeed: 0.12, depth: 0.15, lowGain: 0.2, midGain: 0.6, threads: 5 },
  { pos: 0.4, tilt: 0.06, amp: 0.22, width: 0.11, freq: 0.95, phase: 2.2, speed: 0.5, twist: 0.65, twistSpeed: 0.18, depth: 0.45, lowGain: 0.4, midGain: 1, threads: 7 },
  { pos: 0.44, tilt: 0.42, amp: 0.15, width: 0.12, freq: 0.75, phase: 4.1, speed: 0.42, twist: 0.55, twistSpeed: -0.15, depth: 0.6, lowGain: 0.5, midGain: 0.8, threads: 6 },
  { pos: 0.62, tilt: 0.08, amp: 0.18, width: 0.14, freq: 0.85, phase: 5.3, speed: 0.6, twist: 0.7, twistSpeed: 0.22, depth: 0.85, lowGain: 0.6, midGain: 0.9, threads: 9 },
  { pos: 0.86, tilt: 0.12, amp: 0.08, width: 0.13, freq: 0.5, phase: 1.4, speed: 0.3, twist: 0.35, twistSpeed: 0.08, depth: 1, lowGain: 1, midGain: 0.3, threads: 3 },
];

export interface Layout {
  w: number;
  h: number;
  /** Top of the ribbon zone and its height, in pixels. */
  top: number;
  zone: number;
  /** Size that crest heights and thickness scale with. */
  unit: number;
  /** Aspect-ratio scale on wave counts, so a narrow frame shows fewer, not squeezed, waves. */
  cycles: number;
  /** Samples per sheet across the width. */
  samples: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Recomposes the same scene for the actual frame: wide frames keep roughly the upper third as
 * quiet space; tall portrait frames put a taller landscape a little below centre.
 */
export function layoutFor(w: number, h: number): Layout {
  const aspect = w / h;
  const zone = Math.min(h * (aspect > 1.2 ? 0.6 : 0.66), w * 1.35);
  const centre = h * (aspect > 1.2 ? 0.66 : aspect > 0.8 ? 0.62 : 0.56);
  return {
    w,
    h,
    top: centre - zone / 2,
    zone,
    unit: Math.min(zone, w * 0.95),
    cycles: clamp(w / (zone * 1.5), 0.7, 2),
    samples: clamp(Math.round(w / 14), 24, 60),
  };
}

/** How strongly each motif's onsets lift the ribbons; every onset deforms the shape a little. */
const LIFT_GAIN: Record<Motif, number> = { waves: 1, pulses: 0.9, forms: 0.8, ambient: 0.75, particles: 0.6 };
const LIFT_HEIGHT = 0.2; // of the zone, at full strength on the front sheet
const LIFT_ATTACK_S = 0.06;
const LIFT_TRAVEL_PER_S = 0.32; // of the width
const LIFT_DELAY_S = 0.12; // the back sheets answer a beat later, which reads as depth

/** Where along the frame (0..1) a burst rises; stable for the burst's whole life. */
export function burstOrigin(b: Burst): number {
  return 0.22 + 0.56 * b.seed;
}

/**
 * Upward lift (fraction of the zone) at `u` from one onset: a crest rises at the origin, then
 * splits into two deformations that travel outward along the ribbons and release.
 */
export function burstLift(b: Burst, u: number, depth: number): number {
  const age = b.age - (1 - depth) * LIFT_DELAY_S;
  if (age <= 0) return 0;
  const life = age / BURST_LIFE_S;
  if (life >= 1) return 0;
  const attack = 1 - Math.exp(-age / LIFT_ATTACK_S);
  const fade = (1 - life) ** 2;
  const origin = burstOrigin(b);
  const spread = age * LIFT_TRAVEL_PER_S;
  const sigma = 0.07 + age * 0.05;
  const g = (c: number) => Math.exp(-((u - c) ** 2) / (2 * sigma * sigma));
  const crest = g(origin) * Math.exp(-age * 2.4);
  const travel = 0.5 * (g(origin - spread) + g(origin + spread));
  return LIFT_GAIN[b.motif] * b.strength * attack * fade * (0.35 + 0.65 * depth) * LIFT_HEIGHT * (crest + travel);
}

/**
 * Per-frame samples for every sheet, in preallocated arrays (no per-frame allocation).
 * Sound shapes the geometry: `level` and mid-band energy raise crests, low-band energy
 * thickens the lower sheets, onsets lift travelling crests, music adds band-led modulation.
 */
export class RibbonField {
  readonly layout: Layout;
  readonly n: number;
  /** x of each sample, slightly overscanned so ribbons run off both edges. */
  readonly xs: Float32Array;
  readonly centre: Float32Array[];
  readonly half: Float32Array[];
  /** cos(twist): +-1 where the sheet faces the viewer, 0 where it is seen edge-on. */
  readonly face: Float32Array[];
  /** Slow sideways wander of the inner threads, so they fan like silk instead of staying parallel. */
  readonly wander: Float32Array[];

  constructor(w: number, h: number) {
    this.layout = layoutFor(w, h);
    this.n = this.layout.samples;
    this.xs = new Float32Array(this.n);
    for (let j = 0; j < this.n; j++) this.xs[j] = -0.04 * w + (j / (this.n - 1)) * 1.08 * w;
    const arrays = () => SHEETS.map(() => new Float32Array(this.n));
    this.centre = arrays();
    this.half = arrays();
    this.face = arrays();
    this.wander = arrays();
  }

  update(f: VizFrame): void {
    const { top, zone, unit, cycles } = this.layout;
    const { low, mid } = f.bands;
    const music = f.weights.forms;
    // Stopped: a slightly flatter, calmer landscape that fades back in when listening resumes.
    const calm = 0.8 + 0.2 * f.presence;

    SHEETS.forEach((sh, i) => {
      const swell = 1 + 0.9 * f.level + sh.midGain * mid * (2.2 + 2 * music);
      const amp = unit * sh.amp * swell * calm;
      const thick = unit * sh.width * (1 + 0.25 * f.level + sh.lowGain * low * (2.5 + 2 * music));
      const organic = unit * 0.05 * music * (low + mid);
      const ph = f.flow * sh.speed + sh.phase;
      const tw = f.flow * sh.twistSpeed + sh.phase * 1.7;
      const breathe = zone * 0.015 * Math.sin(f.time * 0.11 + sh.phase);
      const centre = this.centre[i]!;
      const half = this.half[i]!;
      const face = this.face[i]!;
      const wander = this.wander[i]!;

      for (let j = 0; j < this.n; j++) {
        const u = j / (this.n - 1);
        const k = u * cycles * sh.freq * TAU;
        // Crest heights vary along the length, so it reads as a landscape, not a sine graph.
        const env = 0.55 + 0.45 * Math.sin(u * Math.PI * 1.3 + sh.phase);
        let y =
          top +
          zone * (sh.pos + sh.tilt * (u - 0.5)) +
          breathe -
          amp * env * (Math.sin(k + ph) + 0.38 * Math.sin(2.3 * k - 0.7 * ph + sh.phase));
        if (organic > 0) y += organic * Math.sin(3.1 * k + f.flow * 1.3 + i);
        for (const b of f.bursts) y -= zone * burstLift(b, u, sh.depth);
        centre[j] = y;
        half[j] = thick * (0.75 + 0.25 * Math.sin(1.6 * k - 0.4 * ph + i));
        face[j] = Math.cos(u * cycles * sh.twist * TAU + tw);
        wander[j] = Math.sin(2.1 * k + f.flow * 0.5 + sh.phase * 3);
      }
    });
  }

  /** y of thread `s` (-1..1 across the sheet) on sheet `i` at sample `j`. */
  threadY(i: number, s: number, j: number): number {
    return this.centre[i]![j]! + this.half[i]![j]! * (s * this.face[i]![j]! + 0.22 * (1 - s * s) * this.wander[i]![j]!);
  }

  /** Centre-line y on sheet `i` at a fractional position `u` (0..1), interpolated. */
  centreAt(i: number, u: number): number {
    const p = clamp(u, 0, 1) * (this.n - 1);
    const j = Math.min(this.n - 2, Math.floor(p));
    const c = this.centre[i]!;
    return c[j]! + (c[j + 1]! - c[j]!) * (p - j);
  }
}
