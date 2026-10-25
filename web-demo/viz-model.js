// Adapted from AUVIONA's earlier main revision 4285d0389b354519024fcd5d2fe77daa658b9401.
export const MOTIFS = [
    'waves',
    'pulses',
    'particles',
    'forms',
    'ambient'
];
const MOTIF_FOR_CATEGORY = {
    speech: 'waves',
    applause: 'pulses',
    bell: 'pulses',
    dog_bark: 'pulses',
    rain: 'particles',
    music: 'forms'
};
export function motifForCurrent(current) {
    return current.kind === 'event' ? MOTIF_FOR_CATEGORY[current.category] : 'ambient';
}
export function levelFromRms(rms) {
    if (!(rms > 0)) return 0;
    return Math.min(1, Math.sqrt(rms * 4));
}
const MIN_DB = -70;
const NOISE_GATE_DB = 2;
const CONTRAST_SCALE_DB = 10;
const BASELINE_RISE_TAU_S = 3;
const BASELINE_FALL_TAU_S = 1.2;
const BASELINE_MAX_PULL_DB = 12;
const BASELINE_START_OFFSET_DB = 4;
export function dbFromRms(rms) {
    if (!(rms > 0)) return MIN_DB;
    return Math.max(MIN_DB, 20 * Math.log10(rms));
}
export function intensityFromContrast(contrastDb) {
    const c = contrastDb - NOISE_GATE_DB;
    return c > 0 ? 1 - Math.exp(-c / CONTRAST_SCALE_DB) : 0;
}
class AmbientBaseline {
    db = null;
    update(db, dt) {
        if (this.db === null) this.db = db - BASELINE_START_OFFSET_DB;
        const intensity = intensityFromContrast(db - this.db);
        const diff = Math.min(db - this.db, BASELINE_MAX_PULL_DB);
        const tau = diff > 0 ? BASELINE_RISE_TAU_S : BASELINE_FALL_TAU_S;
        this.db += diff * (1 - Math.exp(-dt / tau));
        return intensity;
    }
    reset() {
        this.db = null;
    }
}
const ATTACK_PER_SECOND = 14;
const RELEASE_PER_SECOND = 3.5;
const BLEND_PER_SECOND = 3;
const PEAK_WEIGHT = 0.85;
const ONSET_FOLLOW_TAU_S = 0.35;
const ONSET_MIN = 0.2;
const ONSET_COOLDOWN_S = 0.22;
const ACCENT_DECAY_PER_SECOND = 2.6;
export const BURST_LIFE_S = 1.8;
export const MAX_BURSTS = 6;
const FLOW_REST_PER_SECOND = 0.22;
const FLOW_SOUND_PER_SECOND = 1.5;
const PRESENCE_PER_SECOND = 1.5;
export class VizState {
    level = 0;
    accent = 0;
    tone = {
        low: 0,
        mid: 0,
        high: 0
    };
    weights = {
        waves: 0,
        pulses: 0,
        particles: 0,
        forms: 0,
        ambient: 1
    };
    time = 0;
    flow = 0;
    rmsBaseline = new AmbientBaseline();
    peakBaseline = new AmbientBaseline();
    follow = 0;
    sinceBurst = Infinity;
    bursts = [];
    seed = 0x2f6e2b1;
    listening = false;
    presence = 0;
    step(dtSeconds, features, motif) {
        const dt = Math.min(Math.max(dtSeconds, 0), 0.1);
        this.time += dt;
        this.listening = features !== null;
        this.presence += ((this.listening ? 1 : 0) - this.presence) * (1 - Math.exp(-PRESENCE_PER_SECOND * dt));
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
        this.stepOnsets(dt, drive, motif);
        const targetTone = features?.bands ?? {
            low: 0,
            mid: 0,
            high: 0
        };
        const k = 1 - Math.exp(-6 * dt);
        this.tone = {
            low: this.tone.low + (targetTone.low - this.tone.low) * k,
            mid: this.tone.mid + (targetTone.mid - this.tone.mid) * k,
            high: this.tone.high + (targetTone.high - this.tone.high) * k
        };
        this.flow += dt * (FLOW_REST_PER_SECOND + FLOW_SOUND_PER_SECOND * Math.max(this.level, this.accent * 0.6));
        const blend = 1 - Math.exp(-BLEND_PER_SECOND * dt);
        for (const m of MOTIFS){
            this.weights[m] += ((m === motif ? 1 : 0) - this.weights[m]) * blend;
        }
        return this.frame();
    }
    stepOnsets(dt, drive, motif) {
        this.sinceBurst += dt;
        for (const b of this.bursts)b.age += dt;
        this.bursts = this.bursts.filter((b)=>b.age < BURST_LIFE_S);
        this.accent *= Math.exp(-ACCENT_DECAY_PER_SECOND * dt);
        const rise = drive - this.follow;
        this.follow += (drive - this.follow) * (1 - Math.exp(-dt / ONSET_FOLLOW_TAU_S));
        if (rise < ONSET_MIN || this.sinceBurst < ONSET_COOLDOWN_S) return;
        const strength = Math.min(1, 0.25 + rise * 0.9 + drive * 0.25);
        this.sinceBurst = 0;
        this.accent = Math.max(this.accent, strength);
        this.bursts.push({
            age: 0,
            strength,
            seed: this.nextSeed(),
            motif
        });
        if (this.bursts.length > MAX_BURSTS) this.bursts.shift();
    }
    nextSeed() {
        this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
        return this.seed / 4294967296;
    }
    frame() {
        return {
            level: this.level,
            accent: this.accent,
            bands: {
                low: this.tone.low * this.level,
                mid: this.tone.mid * this.level,
                high: this.tone.high * this.level
            },
            weights: {
                ...this.weights
            },
            time: this.time,
            flow: this.flow,
            bursts: this.bursts.map((b)=>({
                    ...b
                })),
            listening: this.listening,
            presence: this.presence
        };
    }
    static staticFrame(motif) {
        const weights = {
            waves: 0,
            pulses: 0,
            particles: 0,
            forms: 0,
            ambient: 0
        };
        weights[motif] = 1;
        return {
            level: 0.35,
            accent: 0,
            bands: {
                low: 0.14,
                mid: 0.14,
                high: 0.07
            },
            weights,
            time: 0,
            flow: 0,
            bursts: [],
            listening: true,
            presence: 1
        };
    }
}
