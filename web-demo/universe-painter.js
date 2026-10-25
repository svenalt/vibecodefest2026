// Adapted from AUVIONA's earlier main revision 4285d0389b354519024fcd5d2fe77daa658b9401.
import { Skia, BlendMode, PaintStyle, StrokeCap, StrokeJoin, TileMode } from './canvas-bridge.js';
import { BURST_LIFE_S } from './viz-model.js';
const HUES = [
    'lav',
    'mint',
    'gold',
    'shine'
];
const DARK = {
    glow: {
        lav: '#C5ADFF',
        mint: '#73EDD3',
        gold: '#FBD97A',
        shine: '#F5F8F8'
    },
    line: {
        lav: '#E6DCFF',
        mint: '#BDF8EA',
        gold: '#FFEDB8',
        shine: '#FFFFFF'
    },
    star: '#F5F8F8',
    glowBlend: BlendMode.Screen,
    glowGain: 1,
    nebulaAlpha: 0.3,
    vignette: '#060A16'
};
const LIGHT = {
    glow: {
        lav: '#A897EC',
        mint: '#5EC3CF',
        gold: '#EBC067',
        shine: '#FFFFFF'
    },
    line: {
        lav: '#6F60C6',
        mint: '#23899A',
        gold: '#B98428',
        shine: '#FFFFFF'
    },
    star: '#7A76BC',
    glowBlend: BlendMode.SrcOver,
    glowGain: 0.9,
    nebulaAlpha: 0.5,
    vignette: '#FFFFFF'
};
const TAU = Math.PI * 2;
const RIBBON_POINTS = 28;
const GLOW_STEPS = [
    1,
    0.6,
    0.32,
    0.14
];
function seeded(seed) {
    let s = seed;
    return ()=>(s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
}
function rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16 & 255}, ${n >> 8 & 255}, ${n & 255}, ${a})`;
}
const clamp01 = (v)=>Math.min(1, Math.max(0, v));
function mixInto(out, a, b, t) {
    for(let i = 0; i < 4; i++)out[i] = a[i] + (b[i] - a[i]) * t;
    return out;
}
const easeOut = (u)=>1 - (1 - u) ** 3;
const fract = (v)=>v - Math.floor(v);
const FAR_STARS = (()=>{
    const r = seeded(7);
    return Array.from({
        length: 70
    }, ()=>({
            x: r(),
            y: r(),
            size: 0.35 + r() * 0.7,
            alpha: 0.12 + r() * 0.3
        }));
})();
const NEAR_STARS = (()=>{
    const r = seeded(12345);
    return Array.from({
        length: 34
    }, ()=>({
            x: r(),
            y: r(),
            depth: r(),
            size: 0.6 + r() * 1.1,
            phase: r() * TAU,
            rate: 0.4 + r() * 0.9
        }));
})();
const STRANDS = [
    {
        y: -0.04,
        tilt: 0.2,
        bow: -0.14,
        freq: 0.9,
        speed: 0.55,
        phase: 0.0,
        hue: 'lav',
        alpha: 1,
        width: 1
    },
    {
        y: 0.08,
        tilt: -0.14,
        bow: 0.12,
        freq: 1.3,
        speed: 0.42,
        phase: 2.1,
        hue: 'mint',
        alpha: 0.75,
        width: 0.8
    },
    {
        y: 0.02,
        tilt: 0.06,
        bow: 0.07,
        freq: 0.7,
        speed: 0.3,
        phase: 4.0,
        hue: 'gold',
        alpha: 0.55,
        width: 0.7
    },
    {
        y: -0.1,
        tilt: 0.28,
        bow: -0.04,
        freq: 1.1,
        speed: 0.65,
        phase: 1.2,
        hue: 'lav',
        alpha: 0.85,
        width: 0.9
    },
    {
        y: 0.12,
        tilt: -0.22,
        bow: -0.12,
        freq: 1.6,
        speed: 0.5,
        phase: 3.3,
        hue: 'lav',
        alpha: 0.7,
        width: 0.75
    }
];
const MOTES = (()=>{
    const r = seeded(424242);
    return Array.from({
        length: 40
    }, (_, i)=>({
            x: r(),
            y: r(),
            speed: 0.5 + r() * 0.9,
            size: 0.9 + r() * 1.6,
            sway: r() * TAU,
            hue: i % 3 === 0 ? 'gold' : 'mint'
        }));
})();
const GLINTS = (()=>{
    const r = seeded(99);
    return Array.from({
        length: 6
    }, ()=>({
            x: 0.15 + r() * 0.7,
            y: 0.15 + r() * 0.7,
            phase: r() * TAU
        }));
})();
const BURST_HUE = {
    waves: 'lav',
    pulses: 'gold',
    particles: 'mint',
    forms: 'lav',
    ambient: 'shine'
};
export class UniversePainter {
    w;
    h;
    look;
    bounds;
    recorder = Skia.PictureRecorder();
    backdrop;
    sprite;
    glowColor;
    lineColor;
    starColor;
    glowPaint;
    fill;
    stroke;
    builder = Skia.PathBuilder.Make();
    mixGlow = new Float32Array(4);
    mixLine = new Float32Array(4);
    minDim;
    canvas;
    constructor(w, h, mode, background){
        this.w = w;
        this.h = h;
        this.look = mode === 'dark' ? DARK : LIGHT;
        this.minDim = Math.min(w, h);
        this.bounds = Skia.XYWHRect(0, 0, w, h);
        const sprite = {};
        const glowColor = {};
        const lineColor = {};
        for (const hue of HUES){
            const hex = this.look.glow[hue];
            sprite[hue] = Skia.Shader.MakeRadialGradient(Skia.Point(0, 0), 1, [
                rgba(hex, 1),
                rgba(hex, 0.42),
                rgba(hex, 0.12),
                rgba(hex, 0)
            ].map((c)=>Skia.Color(c)), [
                0,
                0.28,
                0.62,
                1
            ], TileMode.Clamp);
            glowColor[hue] = Skia.Color(hex);
            lineColor[hue] = Skia.Color(this.look.line[hue]);
        }
        this.sprite = sprite;
        this.glowColor = glowColor;
        this.lineColor = lineColor;
        this.starColor = Skia.Color(this.look.star);
        this.glowPaint = Skia.Paint();
        this.glowPaint.setAntiAlias(true);
        this.glowPaint.setDither(true);
        this.glowPaint.setBlendMode(this.look.glowBlend);
        this.fill = Skia.Paint();
        this.fill.setAntiAlias(true);
        this.stroke = Skia.Paint();
        this.stroke.setAntiAlias(true);
        this.stroke.setStyle(PaintStyle.Stroke);
        this.stroke.setStrokeCap(StrokeCap.Round);
        this.stroke.setStrokeJoin(StrokeJoin.Round);
        this.backdrop = this.recordBackdrop(background);
    }
    draw(f) {
        this.canvas = this.recorder.beginRecording(this.bounds);
        this.canvas.drawPicture(this.backdrop);
        this.nebula(f);
        this.stars(f);
        this.halo(f);
        if (f.weights.forms > 0.02) this.forms(f);
        this.ribbons(f);
        if (f.weights.particles > 0.02) this.motes(f);
        if (f.weights.pulses > 0.02) this.glints(f);
        for (const b of f.bursts)this.burst(b);
        return this.recorder.finishRecordingAsPicture();
    }
    recordBackdrop(background) {
        const { w, h } = this;
        const canvas = this.recorder.beginRecording(this.bounds);
        const paint = Skia.Paint();
        paint.setDither(true);
        paint.setShader(Skia.Shader.MakeLinearGradient(Skia.Point(0, 0), Skia.Point(w * 0.6, h), background.map((c)=>Skia.Color(c)), null, TileMode.Clamp));
        canvas.drawRect(this.bounds, paint);
        const star = Skia.Paint();
        star.setAntiAlias(true);
        star.setColor(this.starColor);
        for (const s of FAR_STARS){
            star.setAlphaf(s.alpha * (this.look === DARK ? 1 : 0.6));
            canvas.drawCircle(s.x * w, s.y * h, s.size, star);
        }
        const v = this.look.vignette;
        const dark = this.look === DARK;
        const r = Math.hypot(w, h) * 0.62;
        paint.setShader(Skia.Shader.MakeRadialGradient(Skia.Point(w / 2, dark ? h / 2 : h * 0.3), r, (dark ? [
            rgba(v, 0),
            rgba(v, 0),
            rgba(v, 0.55)
        ] : [
            rgba(v, 0.7),
            rgba(v, 0.2),
            rgba(v, 0)
        ]).map((c)=>Skia.Color(c)), [
            0,
            0.55,
            1
        ], TileMode.Clamp));
        canvas.drawRect(this.bounds, paint);
        return this.recorder.finishRecordingAsPicture();
    }
    glowAt(cx, cy, rx, ry, hue, alpha) {
        const a = alpha * this.look.glowGain;
        if (a < 0.004 || rx < 0.5 || ry < 0.5) return;
        this.glowPaint.setShader(this.sprite[hue]);
        this.glowPaint.setAlphaf(Math.min(1, a));
        this.canvas.save();
        this.canvas.translate(cx, cy);
        this.canvas.scale(rx, ry);
        this.canvas.drawCircle(0, 0, 1, this.glowPaint);
        this.canvas.restore();
    }
    dot(x, y, r, color, alpha) {
        if (alpha < 0.01) return;
        this.fill.setColor(color);
        this.fill.setAlphaf(Math.min(1, alpha));
        this.canvas.drawCircle(x, y, r, this.fill);
    }
    tint(f) {
        const m = f.weights;
        return {
            lav: m.waves + 0.55 * m.ambient + 0.4 * m.forms + 0.2 * m.pulses,
            mint: 0.7 * m.particles + 0.3 * m.ambient + 0.3 * m.forms,
            gold: 0.8 * m.pulses + 0.3 * m.particles + 0.15 * m.ambient + 0.3 * m.forms
        };
    }
    nebula(f) {
        const { w, h } = this;
        const t = this.tint(f);
        const breathe = 1 + 0.035 * Math.sin(f.time * 0.35) + 0.08 * f.level;
        const a = this.look.nebulaAlpha * (0.72 + 0.28 * f.presence) * (1 + 0.35 * f.level);
        const dx = (k)=>Math.sin(f.time * 0.05 + k) * 0.035 * w + Math.sin(f.flow * 0.3 + k) * 0.03 * w;
        const dy = (k)=>Math.cos(f.time * 0.04 + k) * 0.03 * h;
        this.glowAt(w * 0.3 + dx(0), h * 0.42 + dy(0), w * 0.72 * breathe, h * 0.7 * breathe, 'lav', a * (0.55 + t.lav));
        this.glowAt(w * 0.74 + dx(2), h * 0.64 + dy(2), w * 0.58 * breathe, h * 0.6 * breathe, 'mint', a * (0.35 + t.mint));
        this.glowAt(w * 0.58 + dx(4), h * 0.2 + dy(4), w * 0.38 * breathe, h * 0.38 * breathe, 'gold', a * (0.2 + t.gold));
        this.glowAt(w * 0.5, h * 0.5, w * 0.42, h * 0.5, 'shine', a * (this.look === DARK ? 0.18 : 0.9));
    }
    stars(f) {
        const { w, h } = this;
        const pace = 0.45 + 0.55 * f.presence;
        for (const s of NEAR_STARS){
            const x = fract(s.x + f.flow * 0.006 * (0.3 + s.depth)) * w;
            const y = s.y * h;
            const twinkle = 0.55 + 0.45 * Math.sin(f.time * s.rate * pace + s.phase);
            const alpha = (0.18 + 0.5 * s.depth) * twinkle * (0.75 + 0.25 * f.presence) + 0.3 * f.level * s.depth;
            const r = s.size * (0.55 + 0.55 * s.depth);
            this.dot(x, y, r, this.starColor, this.look === DARK ? alpha : alpha * 0.75);
            if (s.depth > 0.78) this.glowAt(x, y, r * 6, r * 6, 'shine', alpha * 0.35);
        }
    }
    halo(f) {
        const { w, h } = this;
        const t = this.tint(f);
        const r = this.minDim * (0.3 + 0.16 * f.level + 0.1 * f.accent + 0.015 * Math.sin(f.time * 0.5));
        const a = 0.05 + 0.24 * f.level + 0.22 * f.accent;
        this.glowAt(w / 2, h / 2, r * 1.25, r, 'lav', a * t.lav);
        this.glowAt(w / 2, h / 2, r * 1.1, r * 0.9, 'mint', a * t.mint);
        this.glowAt(w / 2, h / 2, r, r * 0.85, 'gold', a * t.gold);
        this.glowAt(w / 2, h / 2, r * 0.45, r * 0.4, 'shine', a * 0.6);
    }
    forms(f) {
        const { w, h, minDim } = this;
        const wf = f.weights.forms;
        const orbs = [
            [
                f.bands.low,
                'lav'
            ],
            [
                f.bands.mid,
                'mint'
            ],
            [
                f.bands.high,
                'gold'
            ]
        ];
        orbs.forEach(([e, hue], k)=>{
            const angle = f.flow * 0.22 + k * TAU / 3;
            const x = w / 2 + Math.cos(angle) * w * 0.24;
            const y = h / 2 + Math.sin(angle) * h * 0.18;
            const r = minDim * (0.1 + 0.6 * e + 0.08 * f.accent);
            this.glowAt(x, y, r, r, hue, wf * (0.1 + 1.3 * e));
            this.glowAt(x, y, r * 0.35, r * 0.35, 'shine', wf * (0.05 + 0.9 * e));
        });
    }
    ribbons(f) {
        const { w, h } = this;
        const ww = f.weights.waves;
        const energy = f.level * (0.45 + 0.55 * ww + 0.25 * f.weights.forms);
        const amp = h * (0.03 + 0.17 * energy);
        const presence = 0.6 + 0.4 * f.presence;
        const dark = this.look === DARK;
        STRANDS.forEach((s, i)=>{
            const strandAlpha = s.alpha * (i < 3 ? 1 : ww) * presence;
            if (strandAlpha < 0.02) return;
            const toLav = s.hue === 'lav' ? 0 : ww * 0.85;
            const glowColor = mixInto(this.mixGlow, this.glowColor[s.hue], this.glowColor.lav, toLav);
            const lineColor = mixInto(this.mixLine, this.lineColor[s.hue], this.lineColor.lav, toLav);
            const path = this.ribbonPath(f, s, amp);
            this.stroke.setBlendMode(this.look.glowBlend);
            this.stroke.setColor(glowColor);
            const glowWidth = (12 + 26 * energy) * s.width;
            const glowAlpha = strandAlpha * (0.05 + 0.12 * energy) * this.look.glowGain;
            for (const k of GLOW_STEPS){
                this.stroke.setStrokeWidth(glowWidth * k);
                this.stroke.setAlphaf(glowAlpha);
                this.canvas.drawPath(path, this.stroke);
            }
            this.stroke.setBlendMode(BlendMode.SrcOver);
            this.stroke.setColor(lineColor);
            this.stroke.setStrokeWidth((0.8 + 1.4 * energy) * s.width);
            this.stroke.setAlphaf(strandAlpha * (dark ? 0.3 + 0.55 * energy : 0.38 + 0.45 * energy));
            this.canvas.drawPath(path, this.stroke);
        });
    }
    ribbonPath(f, s, amp) {
        const { w, h } = this;
        const b = this.builder;
        b.reset();
        let px = 0;
        let py = 0;
        for(let j = 0; j <= RIBBON_POINTS; j++){
            const u = j / RIBBON_POINTS;
            const x = -0.05 * w + u * 1.1 * w;
            const flow = f.flow * s.speed;
            const env = Math.sin(Math.PI * u) ** 1.3 * (0.65 + 0.35 * Math.sin(u * 3 + s.phase + f.flow * 0.2));
            const base = h * (0.5 + s.y + s.tilt * (u - 0.5) + s.bow * (Math.sin(Math.PI * u) - 0.64)) + h * 0.02 * Math.sin(f.time * 0.07 + s.phase);
            let y = base + env * (amp * Math.sin(u * s.freq * TAU + flow + s.phase) + amp * 0.45 * Math.sin(u * s.freq * 1.7 * TAU - flow * 0.6 + s.phase * 2));
            for (const burst of f.bursts)y += env * this.ripple(burst, u);
            if (j === 0) b.moveTo(x, y);
            else b.quadTo(px, py, (px + x) / 2, (py + y) / 2);
            px = x;
            py = y;
        }
        b.lineTo(px, py);
        return b.build();
    }
    ripple(b, u) {
        const life = b.age / BURST_LIFE_S;
        const fade = (1 - life) ** 2;
        const gain = b.motif === 'waves' ? 1 : 0.35;
        const origin = 0.38 + 0.24 * b.seed;
        const spread = b.age * 0.45;
        const g = (c)=>Math.exp(-((u - c) ** 2) / 0.012);
        const bump = g(origin - spread) + g(origin + spread);
        return gain * b.strength * fade * this.h * 0.09 * bump * Math.sin(u * 40 - b.age * 9);
    }
    motes(f) {
        const { w, h } = this;
        const wp = f.weights.particles;
        for (const p of MOTES){
            const yu = fract(p.y + f.flow * 0.08 * p.speed);
            const x = (p.x + Math.sin(f.time * 0.5 + p.sway) * 0.012 + Math.sin(f.flow * 0.8 + p.sway) * 0.01) * w;
            const y = yu * h;
            const alpha = wp * (0.2 + 0.6 * f.level + 0.3 * f.accent) * Math.sin(Math.PI * yu);
            const r = p.size * (0.8 + 0.6 * f.level);
            this.glowAt(x, y, r * 4.5, r * 4.5, p.hue, alpha * 0.45);
            this.dot(x, y, r, this.lineColor[p.hue], alpha);
        }
    }
    glints(f) {
        const { w, h } = this;
        const strength = f.weights.pulses * (0.8 * f.level + 0.6 * f.accent);
        if (strength < 0.01) return;
        for (const g of GLINTS){
            const a = strength * (0.6 + 0.4 * Math.sin(f.time * 2 + g.phase));
            this.sparkle(g.x * w, g.y * h, 3 + 5 * f.level, a);
        }
    }
    sparkle(x, y, size, alpha) {
        if (alpha < 0.01) return;
        this.glowAt(x, y, size * 2.2, size * 2.2, 'gold', alpha * 0.5);
        this.stroke.setBlendMode(BlendMode.SrcOver);
        this.stroke.setColor(this.lineColor.gold);
        this.stroke.setAlphaf(Math.min(1, alpha));
        this.stroke.setStrokeWidth(1);
        this.canvas.drawLine(x - size, y, x + size, y, this.stroke);
        this.canvas.drawLine(x, y - size, x, y + size, this.stroke);
    }
    burst(b) {
        const { w, h, minDim } = this;
        const u = clamp01(b.age / BURST_LIFE_S);
        const fade = (1 - u) ** 2;
        const grow = easeOut(u);
        const s = b.strength;
        const x = w * (0.38 + 0.24 * b.seed);
        const y = h * (0.42 + 0.16 * fract(b.seed * 7.3));
        const hue = BURST_HUE[b.motif];
        const r = minDim * (0.1 + 0.32 * grow) * (0.6 + 0.6 * s);
        this.glowAt(x, y, r * 1.15, r, hue, s * fade * 0.55);
        this.glowAt(x, y, r * 0.35, r * 0.3, 'shine', s * fade * 0.35);
        if (b.motif === 'pulses') {
            for(let k = 0; k < 2; k++){
                const ru = clamp01((b.age - k * 0.18) / (BURST_LIFE_S * 0.8));
                if (ru <= 0 || ru >= 1) continue;
                const rr = minDim * (0.06 + 0.6 * easeOut(ru));
                const a = s * (1 - ru) ** 1.6 * 0.5;
                this.stroke.setBlendMode(this.look.glowBlend);
                this.stroke.setColor(this.lineColor[k === 0 ? 'gold' : 'shine']);
                this.stroke.setStrokeWidth(0.5 + 1.2 * s * (1 - ru));
                this.stroke.setAlphaf(Math.min(1, a));
                this.canvas.drawCircle(x, y, rr, this.stroke);
                if (k === 0) {
                    for(let g = 0; g < 4; g++){
                        const angle = b.seed * TAU + g * TAU / 4 + ru;
                        this.sparkle(x + Math.cos(angle) * rr, y + Math.sin(angle) * rr, 1.5 + 2.5 * s, a * 1.2);
                    }
                }
            }
        } else if (b.motif === 'particles') {
            for(let k = 0; k < 8; k++){
                const angle = b.seed * TAU + k * TAU / 8;
                const dist = minDim * 0.22 * grow * (0.6 + 0.4 * fract(b.seed * 13 + k * 0.37));
                const px = x + Math.cos(angle) * dist;
                const py = y + Math.sin(angle) * dist * 0.7 + h * 0.08 * u * u;
                const pHue = k % 3 === 0 ? 'gold' : 'mint';
                this.glowAt(px, py, 6 + 4 * s, 6 + 4 * s, pHue, s * fade * 0.5);
                this.dot(px, py, 1.1 + 1.4 * s, this.lineColor[pHue], s * fade);
            }
        } else if (b.motif === 'ambient') {
            const rr = minDim * (0.08 + 0.4 * grow);
            this.stroke.setBlendMode(this.look.glowBlend);
            this.stroke.setColor(this.lineColor.lav);
            this.stroke.setStrokeWidth(0.8);
            this.stroke.setAlphaf(s * fade * 0.22);
            this.canvas.drawCircle(x, y, rr, this.stroke);
        } else if (b.motif === 'forms') {
            this.glowAt(x, y, r * 1.6, r * 1.4, 'mint', s * fade * 0.25);
        }
    }
}
