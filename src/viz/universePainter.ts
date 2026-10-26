import {
  BlendMode,
  PaintStyle,
  Skia,
  StrokeCap,
  StrokeJoin,
  TileMode,
  type SkCanvas,
  type SkColor,
  type SkPaint,
  type SkPath,
  type SkPicture,
  type SkRect,
  type SkShader,
} from '@shopify/react-native-skia';

import type { ThemeMode } from '../ui/theme';
import { burstOrigin, RibbonField, SHEETS } from './ribbonField';
import { BURST_LIFE_S, LAYER_LOOK, LAYERS, type Burst, type Layer, type Tint, type VizFrame } from './vizModel';

type Hue = Tint;
const HUES: readonly Hue[] = ['aqua', 'amber', 'lav', 'mint', 'gold', 'shine'];

interface Look {
  /** Colours along each sheet, left to right (one list per entry in SHEETS). */
  sheets: readonly (readonly string[])[];
  /** Overall opacity of each sheet; the far sheet recedes. */
  sheetAlpha: readonly number[];
  /** Soft glow colours (haze, blooms) and fine line / mote colours. */
  glow: Record<Hue, string>;
  line: Record<Hue, string>;
  /** Thin highlight along each cool sheet's lit edge, and a warmer one for the amber sheets. */
  edge: string;
  edgeWarm: string;
  /** Dark adds light (Screen) so overlaps read as luminous; Light layers tints on pearl. */
  blend: BlendMode;
  fillAlpha: number;
  threadAlpha: number;
  glowAlpha: number;
  edgeAlpha: number;
  hazeAlpha: number;
}

// Dark: aqua/teal and amber/gold silk on a near-black navy void, cream-white highlights.
const DARK: Look = {
  sheets: [
    ['#167A88', '#33C6D2', '#2398AC'],
    ['#FF8A1E', '#FFB232', '#FF9F28', '#FFC24A'],
    ['#FF7A18', '#FFB43A', '#45D4DC'],
    ['#2CC3CF', '#9BFAF6', '#4FD6D2', '#FFB23A'],
    ['#E0601A', '#FF8A24', '#FFB43C'],
  ],
  sheetAlpha: [0.6, 0.95, 0.85, 1, 0.75],
  glow: { aqua: '#3ED8E0', amber: '#FF9226', lav: '#B9A3FF', mint: '#7EEFC8', gold: '#FFC24A', shine: '#FFF4DC' },
  line: { aqua: '#B4FAF6', amber: '#FFD8A0', lav: '#E2D8FF', mint: '#C4FBE8', gold: '#FFE7B0', shine: '#FFFFFF' },
  edge: '#FFF4DC',
  edgeWarm: '#FFD07A',
  blend: BlendMode.Screen,
  fillAlpha: 0.13,
  threadAlpha: 0.62,
  glowAlpha: 0.15,
  edgeAlpha: 0.8,
  hazeAlpha: 0.36,
};

// Light: deeper turquoise, soft honey gold and restrained lavender edges on pearl/lilac.
const LIGHT: Look = {
  sheets: [
    ['#7DB6CF', '#58A6C0', '#8BBFD6'],
    ['#D58A34', '#E5A847', '#D9923F', '#E7B456'],
    ['#DB9440', '#E4B25A', '#2C97A6'],
    ['#17808F', '#24A0AC', '#1D8794', '#C68E33'],
    ['#B2733A', '#D39648', '#DFB060'],
  ],
  sheetAlpha: [0.55, 0.9, 0.8, 1, 0.6],
  glow: { aqua: '#69C6CF', amber: '#EBB060', lav: '#A99AE8', mint: '#7DD3BC', gold: '#ECC274', shine: '#FFFFFF' },
  line: { aqua: '#137483', amber: '#A8691F', lav: '#6E5FC4', mint: '#22856F', gold: '#AD7A1F', shine: '#FFFFFF' },
  edge: '#7C6BD0',
  edgeWarm: '#8C7BD8',
  blend: BlendMode.SrcOver,
  fillAlpha: 0.13,
  threadAlpha: 0.64,
  glowAlpha: 0.075,
  edgeAlpha: 0.5,
  hazeAlpha: 0.34,
};

const TAU = Math.PI * 2;
/** Widths (relative) of the stacked strokes that fake a soft glow without a blur pass. */
const GLOW_STEPS = [1, 0.66, 0.4, 0.18];
const BODY_STEPS = [2.4, 1.8, 1.25, 0.7];
/** Index of the cool foreground sheet that carries highlights, glints and burst glows. */
const FRONT = 3;
const WARM = 1;
const WARM_SHEETS: readonly number[] = [1, 2, 4];

/** Deterministic generator so the composition is identical on every launch and frame. */
function seeded(seed: number) {
  let s = seed;
  return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
}

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const fract = (v: number) => v - Math.floor(v);

/** A few motes always drift just above the crests; rain adds the rest. */
const CALM_MOTES = 42;
const MOTES = (() => {
  const r = seeded(424242);
  return Array.from({ length: 62 }, (_, i) => {
    const calm = i < CALM_MOTES;
    return {
      // Calm motes cluster over the middle crests; rain motes spread across the whole width.
      u: calm ? 0.25 + r() * 0.6 : r(),
      lift: -0.04 + r() * 0.26,
      speed: 0.5 + r() * 0.9,
      // Mostly pinpoints, a few larger out-of-focus ones.
      size: i % 7 === 3 ? 2.6 + r() * 1.8 : 0.8 + r() * 1.1,
      phase: r() * TAU,
      sheet: i % 2 === 0 ? WARM : FRONT,
      hue: (calm ? (i % 3 === 0 ? 'aqua' : i % 3 === 1 ? 'amber' : 'gold') : i % 3 === 0 ? 'gold' : 'mint') as Hue,
    };
  });
})();

/** Fixed spots along the foreground and warm crests where high-band glints may appear. */
const GLINTS = (() => {
  const r = seeded(99);
  return Array.from({ length: 6 }, (_, i) => ({ u: 0.1 + r() * 0.8, phase: r() * TAU, sheet: i % 2 ? WARM : FRONT }));
})();

const SPARKS_PER_BURST = 7;

/** Strands woven through the warm and foreground sheets: [sheet, thread position]. */
const STRANDS: readonly (readonly [number, number])[] = [
  [WARM, -0.4],
  [FRONT, 0.35],
  [FRONT, -0.7],
];
/** Layers drawn as strands; each family sits on its own threads so concurrent ones stay apart. */
const STRAND_LAYERS: readonly { layer: Layer; offset: number }[] = LAYERS.filter(
  (l) => LAYER_LOOK[l].motif === 'waves',
).map((layer, i) => ({ layer, offset: i === 0 ? 0 : (i % 2 ? 0.18 : -0.18) * Math.ceil(i / 2) }));

/**
 * Draws the Universe V3 scene (flowing light-ribbon landscape) into one Skia picture per frame.
 * Geometry comes from `RibbonField`; everything drawn with is allocated up front and reused
 * (paints, gradient shaders, sprites, path builder, recorder, the static backdrop). A frame is
 * about 60 path draws plus a few dozen sprites, and a single React prop change.
 */
export class UniversePainter {
  private readonly look: Look;
  private readonly dark: boolean;
  private readonly bounds: SkRect;
  private readonly recorder = Skia.PictureRecorder();
  private readonly backdrop: SkPicture;
  private readonly field: RibbonField;
  private readonly sheetShader: SkShader[];
  private readonly sprite: Record<Hue, SkShader>;
  private readonly glowColor: Record<Hue, SkColor>;
  private readonly lineColor: Record<Hue, SkColor>;
  private readonly edgeColor: SkColor;
  private readonly edgeWarmColor: SkColor;
  private readonly glowPaint: SkPaint;
  private readonly fill: SkPaint;
  private readonly stroke: SkPaint;
  private readonly builder = Skia.PathBuilder.Make();
  private readonly scale: number;
  private canvas!: SkCanvas;

  constructor(
    private readonly w: number,
    private readonly h: number,
    mode: ThemeMode,
    background: readonly [string, string],
  ) {
    this.dark = mode === 'dark';
    this.look = this.dark ? DARK : LIGHT;
    this.bounds = Skia.XYWHRect(0, 0, w, h);
    this.field = new RibbonField(w, h);
    // Line widths and glows follow the composition's size, so card and full screen match.
    this.scale = Math.max(0.75, Math.min(1.6, this.field.layout.unit / 260));

    this.sheetShader = this.look.sheets.map((colors) =>
      Skia.Shader.MakeLinearGradient(
        Skia.Point(0, 0),
        Skia.Point(w, 0),
        colors.map((c) => Skia.Color(c)),
        null,
        TileMode.Clamp,
      ),
    );

    // A unit radial "sprite" per hue: bright centre, long soft falloff, no visible edge.
    const sprite = {} as Record<Hue, SkShader>;
    const glowColor = {} as Record<Hue, SkColor>;
    const lineColor = {} as Record<Hue, SkColor>;
    for (const hue of HUES) {
      const hex = this.look.glow[hue];
      sprite[hue] = Skia.Shader.MakeRadialGradient(
        Skia.Point(0, 0),
        1,
        [rgba(hex, 1), rgba(hex, 0.42), rgba(hex, 0.12), rgba(hex, 0)].map((c) => Skia.Color(c)),
        [0, 0.28, 0.62, 1],
        TileMode.Clamp,
      );
      glowColor[hue] = Skia.Color(hex);
      lineColor[hue] = Skia.Color(this.look.line[hue]);
    }
    this.sprite = sprite;
    this.glowColor = glowColor;
    this.lineColor = lineColor;
    this.edgeColor = Skia.Color(this.look.edge);
    this.edgeWarmColor = Skia.Color(this.look.edgeWarm);

    this.glowPaint = Skia.Paint();
    this.glowPaint.setAntiAlias(true);
    this.glowPaint.setDither(true);
    this.glowPaint.setBlendMode(this.look.blend);
    this.fill = Skia.Paint();
    this.fill.setAntiAlias(true);
    this.fill.setDither(true);
    this.stroke = Skia.Paint();
    this.stroke.setAntiAlias(true);
    this.stroke.setStyle(PaintStyle.Stroke);
    this.stroke.setStrokeCap(StrokeCap.Round);
    this.stroke.setStrokeJoin(StrokeJoin.Round);
    this.builder.setIsVolatile(true);

    this.backdrop = this.recordBackdrop(background);
  }

  draw(f: VizFrame): SkPicture {
    this.field.update(f);
    this.canvas = this.recorder.beginRecording(this.bounds);
    this.canvas.drawPicture(this.backdrop);
    this.haze(f);
    for (let i = 0; i < SHEETS.length; i++) this.sheet(f, i);
    if (f.weights.waves > 0.02) this.strands(f);
    for (const b of f.bursts) this.burst(b);
    this.glints(f);
    this.motes(f);
    return this.recorder.finishRecordingAsPicture();
  }

  private recordBackdrop(background: readonly [string, string]): SkPicture {
    const { w, h } = this;
    const canvas = this.recorder.beginRecording(this.bounds);
    const paint = Skia.Paint();
    paint.setDither(true);
    paint.setShader(
      Skia.Shader.MakeLinearGradient(
        Skia.Point(0, 0),
        Skia.Point(w * 0.25, h),
        background.map((c) => Skia.Color(c)),
        null,
        TileMode.Clamp,
      ),
    );
    canvas.drawRect(this.bounds, paint);

    // Depth: soft dark edges in Dark; in Light a pearl sheen from above and a lilac pool below.
    const r = Math.hypot(w, h) * 0.62;
    const { top, zone } = this.field.layout;
    const v = this.dark ? '#02040A' : '#FFFFFF';
    paint.setShader(
      Skia.Shader.MakeRadialGradient(
        Skia.Point(w / 2, this.dark ? top + zone * 0.5 : h * 0.15),
        r,
        (this.dark ? [rgba(v, 0), rgba(v, 0.1), rgba(v, 0.6)] : [rgba(v, 0.75), rgba(v, 0.25), rgba(v, 0)]).map(
          (c) => Skia.Color(c),
        ),
        [0, 0.5, 1],
        TileMode.Clamp,
      ),
    );
    canvas.drawRect(this.bounds, paint);
    return this.recorder.finishRecordingAsPicture();
  }

  /** Soft glow sprite centred on (cx, cy). */
  private glowAt(cx: number, cy: number, rx: number, ry: number, hue: Hue, alpha: number) {
    if (alpha < 0.004 || rx < 0.5 || ry < 0.5) return;
    this.glowPaint.setShader(this.sprite[hue]);
    this.glowPaint.setAlphaf(Math.min(1, alpha));
    this.canvas.save();
    this.canvas.translate(cx, cy);
    this.canvas.scale(rx, ry);
    this.canvas.drawCircle(0, 0, 1, this.glowPaint);
    this.canvas.restore();
  }

  private dot(x: number, y: number, r: number, color: SkColor, alpha: number) {
    if (alpha < 0.01) return;
    this.fill.setShader(null);
    this.fill.setBlendMode(BlendMode.SrcOver);
    this.fill.setColor(color);
    this.fill.setAlphaf(Math.min(1, alpha));
    this.canvas.drawCircle(x, y, r, this.fill);
  }

  /** Haze only around the ribbons: a warm pool behind the middle, a cool one by the foreground. */
  private haze(f: VizFrame) {
    const { w } = this;
    const { top, zone } = this.field.layout;
    const a = this.look.hazeAlpha * (0.75 + 0.25 * f.presence) * (1 + 0.6 * f.level + 0.4 * f.bands.low);
    const drift = Math.sin(f.flow * 0.15) * 0.04 * w;
    this.glowAt(w * 0.32 + drift, top + zone * 0.48, w * 0.55, zone * 0.42, 'amber', a * 0.7);
    this.glowAt(w * 0.7 - drift, top + zone * 0.7, w * 0.55, zone * 0.4, 'aqua', a * 0.6);
    this.glowAt(w * 0.5, top + zone * 1.02, w * 0.7, zone * 0.25, 'amber', a * 0.45);
  }

  /** Smooth path through the samples of `ys` (midpoint quadratics, so no corners). */
  private curve(ys: (j: number) => number, from = 0, to = this.field.n - 1): SkPath {
    const b = this.builder;
    const xs = this.field.xs;
    b.reset();
    let px = xs[from]!;
    let py = ys(from);
    b.moveTo(px, py);
    for (let j = from + 1; j <= to; j++) {
      const x = xs[j]!;
      const y = ys(j);
      b.quadTo(px, py, (px + x) / 2, (py + y) / 2);
      px = x;
      py = y;
    }
    b.lineTo(px, py);
    return b.build();
  }

  /** The closed outline between a sheet's two outer threads, for its translucent body. */
  private outline(i: number): SkPath {
    const { field } = this;
    const b = this.builder;
    const xs = field.xs;
    const n = field.n;
    b.reset();
    b.moveTo(xs[0]!, field.threadY(i, -1, 0));
    for (let j = 1; j < n; j++) b.lineTo(xs[j]!, field.threadY(i, -1, j));
    for (let j = n - 1; j >= 0; j--) b.lineTo(xs[j]!, field.threadY(i, 1, j));
    b.close();
    return b.build();
  }

  private sheet(f: VizFrame, i: number) {
    const { look, field } = this;
    const sh = SHEETS[i]!;
    const alpha = look.sheetAlpha[i]! * (0.7 + 0.3 * f.presence);
    const energy = clamp01(f.level * (0.5 + 0.5 * sh.depth) + 0.6 * f.accent * sh.depth);
    const sparkle = 1 + 1.6 * f.bands.high;
    const shader = this.sheetShader[i]!;

    // Translucent body.
    this.fill.setShader(shader);
    this.fill.setBlendMode(look.blend);
    this.fill.setAlphaf(alpha * look.fillAlpha * (1 + 0.5 * energy));
    this.canvas.drawPath(this.outline(i), this.fill);
    this.fill.setShader(null);

    this.stroke.setShader(shader);
    this.stroke.setBlendMode(look.blend);

    // Soft luminous body: the centre line stroked wide, so the sheet glows beyond its outline.
    let thick = 0;
    for (let j = 0; j < field.n; j++) thick += field.half[i]![j]!;
    thick = (2 * thick) / field.n;
    const centre = this.curve((j) => field.centre[i]![j]!);
    for (const k of BODY_STEPS) {
      this.stroke.setStrokeWidth(thick * k);
      this.stroke.setAlphaf(alpha * look.glowAlpha * 0.28 * (1 + 0.6 * energy));
      this.canvas.drawPath(centre, this.stroke);
    }

    // Hairline threads; the outer ones are brightest, the inner ones fade into the body.
    const count = sh.threads;
    // Depth of field: far sheets have softer threads and wider glow.
    const focus = 0.5 + 0.5 * sh.depth;
    let edgePath: SkPath | null = null;
    for (let t = 0; t < count; t++) {
      const s = count === 1 ? 0 : -1 + (2 * t) / (count - 1);
      const path = this.curve((j) => field.threadY(i, s, j));
      if (t === 0) edgePath = path;
      const weight = 0.3 + 0.7 * s * s;
      this.stroke.setStrokeWidth((0.6 + 0.5 * s * s + 0.6 * energy) * this.scale);
      this.stroke.setAlphaf(Math.min(1, alpha * look.threadAlpha * focus * weight * sparkle * (0.85 + 0.35 * energy)));
      this.canvas.drawPath(path, this.stroke);
    }

    // Luminous lit edge: stacked soft strokes that broaden with energy, then a fine highlight.
    if (edgePath) {
      const glowWidth = (16 + 12 * energy + 8 * f.bands.low * sh.lowGain) * this.scale * (1.25 - 0.4 * sh.depth);
      for (const k of GLOW_STEPS) {
        this.stroke.setStrokeWidth(glowWidth * k);
        this.stroke.setAlphaf(Math.min(1, alpha * look.glowAlpha * (1 + 0.8 * energy)));
        this.canvas.drawPath(edgePath, this.stroke);
      }
      this.stroke.setShader(null);
      this.stroke.setBlendMode(look.blend);
      this.stroke.setColor(WARM_SHEETS.includes(i) ? this.edgeWarmColor : this.edgeColor);
      this.stroke.setStrokeWidth((0.7 + 0.6 * energy) * this.scale);
      this.stroke.setAlphaf(Math.min(1, alpha * look.edgeAlpha * sh.depth * (0.65 + 0.35 * energy) * sparkle));
      this.canvas.drawPath(edgePath, this.stroke);
    }
    this.stroke.setShader(null);
  }

  /**
   * Voices (and the other flowing families): strands woven through the warm and foreground
   * sheets, in the family's tint. Speech keeps its accepted lavender look on the original threads.
   */
  private strands(f: VizFrame) {
    const { field } = this;
    const energy = clamp01(f.level + 0.6 * f.accent);
    this.stroke.setShader(null);
    this.stroke.setBlendMode(this.look.blend);
    for (const { layer, offset } of STRAND_LAYERS) {
      const ww = f.layers[layer];
      if (ww < 0.02) continue;
      const hue = LAYER_LOOK[layer].tint;
      for (const [i, s] of STRANDS) {
        const path = this.curve((j) => field.threadY(i, Math.max(-1, Math.min(1, s + offset)), j));
        this.stroke.setColor(this.glowColor[hue]);
        this.stroke.setStrokeWidth((6 + 10 * energy) * this.scale);
        this.stroke.setAlphaf(ww * (0.06 + 0.1 * energy));
        this.canvas.drawPath(path, this.stroke);
        this.stroke.setColor(this.lineColor[hue]);
        this.stroke.setStrokeWidth((0.8 + 0.8 * energy) * this.scale);
        this.stroke.setAlphaf(ww * (0.45 + 0.4 * energy));
        this.canvas.drawPath(path, this.stroke);
      }
    }
  }

  /** An onset broadens a glowing stretch of the front edge that travels with the lifted crest. */
  private burst(b: Burst) {
    const { field } = this;
    const life = clamp01(b.age / BURST_LIFE_S);
    const fade = (1 - life) ** 2;
    const s = b.strength;
    if (s * fade < 0.02) return;
    const hue = b.tint;
    const n = field.n;
    const origin = burstOrigin(b);
    const spread = b.age * 0.32;
    const halfSpan = Math.max(2, Math.round(n * 0.09));

    this.stroke.setShader(null);
    this.stroke.setBlendMode(this.look.blend);
    for (const c of spread < 0.03 ? [origin] : [origin - spread, origin + spread]) {
      if (c < -0.05 || c > 1.05) continue;
      const mid = Math.round(c * (n - 1));
      const from = Math.max(0, mid - halfSpan);
      const to = Math.min(n - 1, mid + halfSpan);
      if (to - from < 2) continue;
      for (const [sheet, gain] of [
        [FRONT, 1],
        [WARM, b.motif === 'pulses' ? 0.9 : 0.5],
      ] as const) {
        const path = this.curve((j) => field.threadY(sheet, -1, j), from, to);
        for (const k of GLOW_STEPS) {
          this.stroke.setColor(this.glowColor[hue]);
          this.stroke.setStrokeWidth((12 + 14 * s) * k * this.scale);
          this.stroke.setAlphaf(Math.min(1, gain * s * fade * 0.13));
          this.canvas.drawPath(path, this.stroke);
        }
        this.stroke.setColor(this.lineColor[hue]);
        this.stroke.setStrokeWidth((1 + 1.2 * s * fade) * this.scale);
        this.stroke.setAlphaf(Math.min(1, gain * s * fade * 0.8));
        this.canvas.drawPath(path, this.stroke);
      }
      // Bell, bark, applause: a brief gold glint rides the wave.
      if (b.motif === 'pulses') {
        const x = this.xAt(c);
        this.sparkle(x, field.threadY(FRONT, -1, mid), (3 + 5 * s) * this.scale, s * fade);
      }
    }
    this.sparks(b, origin, s, fade);
  }

  /** A small spray of sparks thrown up from the crest where an onset rose; they drift and fade. */
  private sparks(b: Burst, origin: number, s: number, fade: number) {
    const { field } = this;
    const { zone } = field.layout;
    const grow = 1 - (1 - clamp01(b.age / BURST_LIFE_S)) ** 3;
    const crest = field.threadY(FRONT, -1, Math.round(clamp01(origin) * (field.n - 1)));
    for (let k = 0; k < SPARKS_PER_BURST; k++) {
      const a = fract(b.seed * 7.31 + k * 0.618);
      const c = fract(b.seed * 3.17 + k * 0.382);
      const x = this.xAt(origin + (a - 0.5) * 0.22 * (0.3 + grow));
      const y = crest - zone * (0.02 + (0.08 + 0.2 * c) * grow);
      const hue: Hue = b.motif === 'ambient' ? (k % 2 ? 'amber' : 'aqua') : k % 3 ? b.tint : 'gold';
      const r = (0.8 + 1.1 * c) * this.scale;
      const alpha = s * fade * (0.6 + 0.4 * a);
      this.glowAt(x, y, r * 3.5, r * 3.5, hue, alpha * 0.6);
      this.dot(x, y, r * 0.8, this.lineColor[hue], alpha);
    }
  }

  private xAt(u: number): number {
    return this.w * (-0.04 + 1.08 * u);
  }

  /** Bright filaments catch light at a few crest points with high-band energy (and, briefly, bell/bark/applause). */
  private glints(f: VizFrame) {
    const strength = 1.6 * f.bands.high + f.weights.pulses * (0.7 * f.level + 0.6 * f.accent);
    if (strength < 0.02) return;
    const { field } = this;
    for (const g of GLINTS) {
      const u = fract(g.u + f.flow * 0.01);
      const j = Math.round(u * (field.n - 1));
      const a = Math.min(1, strength) * (0.55 + 0.45 * Math.sin(f.time * 1.6 + g.phase));
      this.sparkle(field.xs[j]!, field.threadY(g.sheet, -1, j), (2.5 + 4 * f.level) * this.scale, a);
    }
  }

  private sparkle(x: number, y: number, size: number, alpha: number) {
    if (alpha < 0.01) return;
    this.glowAt(x, y, size * 2.4, size * 2.4, 'gold', alpha * 0.5);
    this.stroke.setShader(null);
    this.stroke.setBlendMode(BlendMode.SrcOver);
    this.stroke.setColor(this.lineColor[this.dark ? 'shine' : 'gold']);
    this.stroke.setAlphaf(Math.min(1, alpha * 0.9));
    this.stroke.setStrokeWidth(0.8 * this.scale);
    this.canvas.drawLine(x - size, y, x + size, y, this.stroke);
    this.canvas.drawLine(x, y - size * 0.7, x, y + size * 0.7, this.stroke);
  }

  /** Tiny motes drift just above the crests; rain (mint/gold) adds more and livelier ones. */
  private motes(f: VizFrame) {
    const { field } = this;
    const { zone } = field.layout;
    const rain = f.weights.particles;
    const calm = 1.1 * (0.6 + 0.4 * f.presence) * (1 + 1.2 * f.bands.high);
    for (let m = 0; m < MOTES.length; m++) {
      const p = MOTES[m]!;
      const base = m < CALM_MOTES ? calm : 0;
      const weight = base + rain * (0.5 + 0.6 * f.level + 0.4 * f.accent);
      if (weight < 0.02) continue;
      const u = fract(p.u + f.flow * 0.02 * p.speed);
      const rise = fract(p.phase / TAU + f.flow * 0.05 * p.speed);
      const x = this.xAt(u) + Math.sin(f.time * 0.4 + p.phase) * 4;
      const y = field.centreAt(p.sheet, u) - zone * (p.lift + 0.12 * rise);
      const twinkle = 0.7 + 0.3 * Math.sin(f.time * 1.3 + p.phase * 3);
      const alpha = weight * Math.sin(Math.PI * rise) * twinkle;
      const r = p.size * this.scale * (0.8 + 0.5 * f.level);
      if (p.size > 2) {
        this.glowAt(x, y, r * 1.6, r * 1.6, p.hue, alpha * 0.35); // soft bokeh, no core
        continue;
      }
      this.glowAt(x, y, r * 3.5, r * 3.5, p.hue, alpha * 0.7);
      this.dot(x, y, r, this.lineColor[p.hue], alpha);
    }
  }
}
