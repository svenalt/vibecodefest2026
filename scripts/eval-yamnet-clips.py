"""Builds AUVIONA's small, locally generated evaluation clip set (REQ-012) and records what the
pinned YAMNet model reports for it, window by window, exactly as the native adapters deliver it
(15,600-sample windows, 7,800-sample hop, top 10 of 521, best first, ties by lower index).

Every clip is generated here: synthesized with numpy, or spoken by the macOS `say` voices. No
recordings or third-party audio are used, so the set is rights-clear and reproducible. Synthetic
sounds are not real-world recordings, so the results are evidence for thresholds, silence/noise
behaviour and simultaneous labels, not an accuracy benchmark.

Optional developer tool (needs `tensorflow`, e.g. 2.16.2, and macOS `say`); the app never runs it.

    python3 scripts/eval-yamnet-clips.py            # writes the fixture
    python3 scripts/eval-yamnet-clips.py --wav DIR  # also writes the clips as WAV files

Outputs:
- src/core/testing/fixtures/yamnet-clips.json, replayed through the shared TypeScript
  normalization and tracker by src/core/clipEvaluation.test.ts.
- modules/soundcanvas-audio/test-fixtures/topk-parity.txt: complete 521-score outputs (real
  windows plus constructed ties) and the top 10 every platform must select from them, checked by
  the Kotlin, Swift and TypeScript tests.
"""

import argparse
import hashlib
import json
import math
import pathlib
import subprocess
import tempfile
import wave

import numpy as np
import tensorflow as tf

ROOT = pathlib.Path(__file__).resolve().parent.parent
MODEL = ROOT / "assets/model/yamnet.tflite"
CLASS_MAP = ROOT / "assets/model/yamnet_class_map.csv"
OUT = ROOT / "src/core/testing/fixtures/yamnet-clips.json"
PARITY = ROOT / "modules/soundcanvas-audio/test-fixtures/topk-parity.txt"
MODEL_SHA256 = "4d8b4a53282dc83ef04e3e7dbc4fbc98082e34e44ed798e16c3a0cdd4c584faf"
RATE = 16000
WINDOW = 15600
HOP = 7800
TOP_K = 10
SECONDS = 5.0
N = int(RATE * SECONDS)

rng = np.random.default_rng(20261026)
t = np.arange(N) / RATE


def rms_normalize(x: np.ndarray, dbfs: float = -20.0) -> np.ndarray:
    r = math.sqrt(float(np.mean(x.astype(np.float64) ** 2)))
    return x if r == 0 else x * (10 ** (dbfs / 20) / r)


def lowpass(x: np.ndarray, hz: float) -> np.ndarray:
    a = math.exp(-2 * math.pi * hz / RATE)
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc = (1 - a) * v + a * acc
        y[i] = acc
    return y


def highpass(x: np.ndarray, hz: float) -> np.ndarray:
    return x - lowpass(x, hz)


def white(n: int = N) -> np.ndarray:
    return rng.standard_normal(n)


def pink(n: int = N) -> np.ndarray:
    spectrum = np.fft.rfft(rng.standard_normal(n))
    f = np.fft.rfftfreq(n, 1 / RATE)
    spectrum[1:] /= np.sqrt(f[1:])
    spectrum[0] = 0
    return np.fft.irfft(spectrum, n)


def brown(n: int = N) -> np.ndarray:
    return highpass(np.cumsum(rng.standard_normal(n)), 20)


def tone(freqs, amps, envelope=None) -> np.ndarray:
    x = sum(a * np.sin(2 * np.pi * f * t) for f, a in zip(freqs, amps))
    return x * (envelope if envelope is not None else 1)


def decaying(start: float, freqs, amps, decay: float, length: float = 2.0) -> np.ndarray:
    x = np.zeros(N)
    i0 = int(start * RATE)
    n = min(int(length * RATE), N - i0)
    if n <= 0:
        return x
    tt = np.arange(n) / RATE
    for f, a in zip(freqs, amps):
        x[i0 : i0 + n] += a * np.sin(2 * np.pi * f * tt) * np.exp(-tt * decay)
    return x


def burst(start: float, length: float, decay: float, color=white) -> np.ndarray:
    x = np.zeros(N)
    i0 = int(start * RATE)
    n = min(int(length * RATE), N - i0)
    if n <= 0:
        return x
    tt = np.arange(n) / RATE
    x[i0 : i0 + n] = color(n) * np.exp(-tt * decay)
    return x


def say(voice: str, text: str) -> np.ndarray:
    with tempfile.TemporaryDirectory() as d:
        path = pathlib.Path(d) / "s.wav"
        subprocess.run(
            ["say", "-v", voice, "-o", str(path), "--file-format=WAVE", "--data-format=LEI16@16000", text],
            check=True,
        )
        with wave.open(str(path)) as w:
            pcm = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float64) / 32768
    reps = int(math.ceil(N / max(1, len(pcm))))
    return np.tile(pcm, reps)[:N]


TEXT = (
    "Good morning. I am walking to the station and the weather is lovely today. "
    "Shall we meet for coffee at ten, or would the afternoon suit you better?"
)


# --- Sources -------------------------------------------------------------------------------------


def speech(voice: str, text: str = TEXT):
    return lambda: say(voice, text)


def piano_chords() -> np.ndarray:
    chords = [[261.6, 329.6, 392.0], [220.0, 261.6, 329.6], [174.6, 220.0, 261.6], [196.0, 246.9, 293.7]]
    x = np.zeros(N)
    for k in range(int(SECONDS / 0.625) + 1):
        for f in chords[k % 4]:
            x += decaying(k * 0.625, [f, 2 * f, 3 * f, 4 * f], [1, 0.5, 0.25, 0.12], 3.0, 1.2)
    return x


def band_groove() -> np.ndarray:
    x = np.zeros(N)
    beat = 0.5
    melody = [523.3, 587.3, 659.3, 784.0, 659.3, 587.3, 523.3, 440.0]
    for k in range(int(SECONDS / beat) + 1):
        s = k * beat
        x += decaying(s, [55 * (1 + 0.5 * (k % 2))], [1.2], 6, 0.4)  # bass
        x += decaying(s, [melody[k % 8], 2 * melody[k % 8]], [0.6, 0.2], 4, 0.45)
        x += decaying(s, [60], [1.5], 18, 0.2)  # kick
        if k % 2:
            x += burst(s, 0.15, 25) * 0.5  # snare
        x += highpass(burst(s + beat / 2, 0.05, 60), 6000) * 0.4  # hi-hat
    return x


def drum_loop() -> np.ndarray:
    x = np.zeros(N)
    for k in range(int(SECONDS / 0.25) + 1):
        s = k * 0.25
        if k % 4 == 0:
            x += decaying(s, [55, 80], [1.5, 0.6], 14, 0.3)
        if k % 4 == 2:
            x += burst(s, 0.18, 20) * 0.7 + decaying(s, [190], [0.5], 20, 0.2)
        x += highpass(burst(s, 0.04, 80), 7000) * 0.35
    return x


def organ() -> np.ndarray:
    env = np.minimum(1, t * 8)
    chord = [130.8, 164.8, 196.0, 261.6]
    return tone([f * h for f in chord for h in (1, 2, 3, 4)], [1 / h for _ in chord for h in (1, 2, 3, 4)], env)


def bell() -> np.ndarray:
    partials = [523, 1250, 1680, 2350, 3010]
    amps = [1, 0.6, 0.45, 0.3, 0.2]
    return decaying(0.2, partials, amps, 1.2, 4.8) + decaying(2.6, partials, amps, 1.2, 2.4)


def doorbell() -> np.ndarray:
    ding = [659, 1318, 1980]
    dong = [523, 1046, 1570]
    x = np.zeros(N)
    for s in (0.1, 2.6):
        x += decaying(s, ding, [1, 0.3, 0.1], 2.0, 1.2) + decaying(s + 0.8, dong, [1, 0.3, 0.1], 1.5, 1.6)
    return x


def siren(period: float, lo: float, hi: float) -> np.ndarray:
    f = lo + (hi - lo) * (0.5 - 0.5 * np.cos(2 * np.pi * t / period))
    phase = 2 * np.pi * np.cumsum(f) / RATE
    return np.sin(phase) + 0.3 * np.sin(3 * phase)


def phone_ring() -> np.ndarray:
    gate = ((t % 3.0) < 2.0).astype(float) * ((t * 20) % 1 < 0.5)
    return tone([440, 480], [1, 1]) * gate


def beeps(hz: float, on: float, period: float) -> np.ndarray:
    gate = ((t % period) < on).astype(float)
    return np.sign(np.sin(2 * np.pi * hz * t)) * gate * 0.5


def rain() -> np.ndarray:
    x = highpass(pink(), 400) * 0.4
    for s in rng.uniform(0, SECONDS - 0.05, 900):
        x += highpass(burst(s, 0.012, 300), 1500) * rng.uniform(0.2, 1.0)
    return x


def wind() -> np.ndarray:
    gust = 0.6 + 0.4 * np.sin(2 * np.pi * t / 2.3) * np.sin(2 * np.pi * t / 0.9 + 1)
    return lowpass(white(), 500) * gust


def stream() -> np.ndarray:
    x = highpass(pink(), 300) * 0.3
    for s in rng.uniform(0, SECONDS - 0.05, 260):
        f0 = rng.uniform(400, 1400)
        n = int(0.03 * RATE)
        i0 = int(s * RATE)
        tt = np.arange(n) / RATE
        x[i0 : i0 + n] += np.sin(2 * np.pi * (f0 * tt + 4000 * tt * tt)) * np.exp(-tt * 90) * 0.6
    return x


def engine_idle() -> np.ndarray:
    f = 32 * (1 + 0.02 * np.sin(2 * np.pi * 0.7 * t))
    phase = 2 * np.pi * np.cumsum(f) / RATE
    x = sum((1 / h) * np.sin(h * phase) for h in range(1, 12))
    return x + 0.5 * lowpass(white(), 300)


def traffic() -> np.ndarray:
    x = brown() * 0.6 + lowpass(white(), 1200) * 0.4
    for centre in (1.2, 3.6):
        swell = np.exp(-((t - centre) ** 2) / 0.5)
        x += lowpass(white(), 2500) * swell * 1.5
    return x


def car_horn() -> np.ndarray:
    gate = ((t % 1.6) < 0.7).astype(float)
    return (np.sign(np.sin(2 * np.pi * 400 * t)) + np.sign(np.sin(2 * np.pi * 500 * t))) * gate * 0.4


def birds() -> np.ndarray:
    x = np.zeros(N)
    for s in np.arange(0.1, SECONDS - 0.2, 0.33):
        n = int(0.09 * RATE)
        i0 = int(s * RATE)
        tt = np.arange(n) / RATE
        f = 3500 + 1800 * np.sin(2 * np.pi * 22 * tt)
        x[i0 : i0 + n] += np.sin(2 * np.pi * np.cumsum(f) / RATE) * np.sin(np.pi * tt / tt[-1])
    return x


def crickets() -> np.ndarray:
    gate = ((t * 30) % 1 < 0.5) * ((t % 0.8) < 0.35)
    return np.sin(2 * np.pi * 4600 * t) * gate


def knocks() -> np.ndarray:
    x = np.zeros(N)
    for s in (0.3, 0.55, 0.8, 2.5, 2.75, 3.0):
        x += decaying(s, [180, 410, 730], [1, 0.5, 0.25], 40, 0.2) + burst(s, 0.01, 400) * 0.3
    return x


def claps(count: int) -> np.ndarray:
    x = np.zeros(N)
    for s in rng.uniform(0, SECONDS - 0.05, count):
        x += highpass(burst(s, 0.03, 120), 800) * rng.uniform(0.4, 1.0)
    return x


def glass() -> np.ndarray:
    x = np.zeros(N)
    for s in (0.2, 1.4, 2.6, 3.8):
        x += decaying(s, [2650, 4120, 5630, 6900], [1, 0.7, 0.4, 0.2], 9, 0.9)
    return x


def ticking() -> np.ndarray:
    x = np.zeros(N)
    for k, s in enumerate(np.arange(0.05, SECONDS, 0.5)):
        x += highpass(burst(s, 0.006, 900), 2000) * (1 if k % 2 else 0.6)
    return x


def typing() -> np.ndarray:
    x = np.zeros(N)
    s = 0.05
    while s < SECONDS - 0.05:
        x += highpass(burst(s, 0.02, 250), 1200) * rng.uniform(0.5, 1)
        s += rng.uniform(0.08, 0.25)
    return x


def mains_hum() -> np.ndarray:
    return tone([50, 100, 150, 200, 250], [1, 0.5, 0.3, 0.2, 0.1])


# --- Clip set ------------------------------------------------------------------------------------

ISOLATED = [
    # id, source, level dBFS, expected broad families (empty = no foreground sound expected)
    ("speech_alex", speech("Alex"), -20, ["voice"]),
    ("speech_samantha", speech("Samantha"), -20, ["voice"]),
    ("speech_daniel", speech("Daniel"), -20, ["voice"]),
    ("speech_karen", speech("Karen"), -22, ["voice"]),
    ("speech_anna_de", speech("Anna", "Guten Morgen. Ich gehe zum Bahnhof, und das Wetter ist heute wunderbar."), -20, ["voice"]),
    ("speech_kyoko_ja", speech("Kyoko", "おはようございます。今日はとても良い天気ですね。駅まで歩いて行きます。"), -20, ["voice"]),
    ("speech_quiet_tessa", speech("Tessa"), -38, ["voice"]),
    ("music_piano_chords", piano_chords, -20, ["music"]),
    ("music_band_groove", band_groove, -20, ["music"]),
    ("music_drum_loop", drum_loop, -20, ["music"]),
    ("music_organ", organ, -20, ["music"]),
    ("bell_strikes", bell, -20, ["signals"]),
    ("doorbell_ding_dong", doorbell, -20, ["signals"]),
    ("siren_wail", lambda: siren(3.0, 600, 1300), -20, ["signals"]),
    ("siren_yelp", lambda: siren(0.35, 700, 1500), -20, ["signals"]),
    ("phone_ring", phone_ring, -20, ["signals"]),
    ("beeps_1khz", lambda: beeps(1000, 0.12, 0.5), -20, ["signals"]),
    ("alarm_3khz", lambda: beeps(3100, 0.5, 1.0), -20, ["signals"]),
    ("car_horn", car_horn, -20, ["signals", "vehicles"]),
    ("rain_synth", rain, -20, ["nature"]),
    ("wind_synth", wind, -20, ["nature"]),
    ("stream_synth", stream, -20, ["nature"]),
    ("engine_idle", engine_idle, -20, ["vehicles", "machines"]),
    ("traffic_synth", traffic, -20, ["vehicles"]),
    ("birds_synth", birds, -20, ["animals"]),
    ("crickets_synth", crickets, -24, ["animals"]),
    ("knocks", knocks, -20, ["household", "impacts"]),
    ("claps_sparse", lambda: claps(14), -20, ["people", "impacts"]),
    ("applause_synth", lambda: claps(260), -20, ["people"]),
    ("glass_clinks", glass, -20, ["impacts", "signals"]),
    ("clock_ticking", ticking, -24, ["machines", "household"]),
    ("typing_synth", typing, -22, ["household"]),
    # Quiet, noise and tones: nothing should be claimed as a foreground source except honest noise/tone labels.
    ("silence", lambda: np.zeros(N), None, []),
    ("near_silence", lambda: white(), -72, []),
    ("room_tone", lambda: pink() + 0.2 * mains_hum(), -52, []),
    ("white_noise", white, -20, ["other"]),
    ("pink_noise", pink, -20, ["other"]),
    ("brown_rumble", brown, -24, ["other", "vehicles", "nature", "machines"]),
    ("mains_hum", mains_hum, -24, ["machines", "other"]),
    ("sine_1khz", lambda: tone([1000], [1]), -20, ["other", "signals"]),
]

MIXTURES = [
    # id, [(isolated id, gain dB)], expected families that should be present at some point
    ("speech+music", [("speech_alex", 0), ("music_piano_chords", -3)], ["voice", "music"]),
    ("speech+groove", [("speech_samantha", 0), ("music_band_groove", -4)], ["voice", "music"]),
    ("speech+traffic", [("speech_daniel", 0), ("traffic_synth", -6)], ["voice", "vehicles"]),
    ("rain+traffic", [("rain_synth", 0), ("traffic_synth", -3)], ["nature", "vehicles"]),
    ("speech+rain", [("speech_karen", 0), ("rain_synth", -6)], ["voice", "nature"]),
    ("music+birds", [("music_organ", 0), ("birds_synth", -3)], ["music", "animals"]),
    ("speech+siren", [("speech_alex", 0), ("siren_wail", -6)], ["voice", "signals"]),
    ("speech+music+traffic", [("speech_samantha", 0), ("music_piano_chords", -4), ("traffic_synth", -8)], ["voice", "music", "vehicles"]),
    ("rain+wind+birds", [("rain_synth", 0), ("wind_synth", -3), ("birds_synth", -3)], ["nature", "animals"]),
    ("applause+music", [("applause_synth", 0), ("music_band_groove", -3)], ["people", "music"]),
    ("doorbell+speech", [("speech_daniel", 0), ("doorbell_ding_dong", -2)], ["voice", "signals"]),
    ("speech+white_noise", [("speech_alex", 0), ("white_noise", -10)], ["voice"]),
    ("music+engine", [("music_band_groove", 0), ("engine_idle", -4)], ["music", "vehicles"]),
    ("speech+typing", [("speech_karen", 0), ("typing_synth", -4)], ["voice", "household"]),
    ("birds+stream", [("birds_synth", 0), ("stream_synth", -3)], ["animals", "nature"]),
    ("phone+music", [("phone_ring", 0), ("music_piano_chords", -4)], ["signals", "music"]),
    ("two_voices", [("speech_daniel", 0), ("speech_anna_de", -2)], ["voice"]),
    ("speech+room_tone", [("speech_alex", 0), ("room_tone", 0)], ["voice"]),
]


def top_k(scores) -> list:
    """The shared selection rule: best first, ties by lower index."""
    return sorted(range(len(scores)), key=lambda i: (-float(scores[i]), i))[:TOP_K]


def infer(interpreter, window: np.ndarray) -> np.ndarray:
    (inp,) = interpreter.get_input_details()
    scores_out = next(d for d in interpreter.get_output_details() if int(np.prod(d["shape"])) == 521)
    interpreter.set_tensor(inp["index"], window.astype(np.float32))
    interpreter.invoke()
    scores = interpreter.get_tensor(scores_out["index"]).reshape(-1)
    assert scores.shape[0] == 521 and np.all(np.isfinite(scores))
    return scores


def run(interpreter, clip: np.ndarray):
    windows = []
    for start in range(0, N - WINDOW + 1, HOP):
        scores = infer(interpreter, clip[start : start + WINDOW])
        order = top_k(scores)
        windows.append(
            {
                # Same clock as the adapters: stream time of the window's newest sample.
                "timestampMs": (start + WINDOW) * 1000 // RATE,
                "top": [[i, round(float(scores[i]), 4)] for i in order],
            }
        )
    return windows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--wav", type=pathlib.Path, help="also write the generated clips as 16-bit WAV here")
    args = parser.parse_args()

    data = MODEL.read_bytes()
    assert hashlib.sha256(data).hexdigest() == MODEL_SHA256, "assets/model/yamnet.tflite is not the pinned file"
    interpreter = tf.lite.Interpreter(model_path=str(MODEL))
    interpreter.allocate_tensors()

    audio = {}
    for cid, source, level, _ in ISOLATED:
        x = source()
        audio[cid] = x if level is None else rms_normalize(x, level)
    for cid, parts, _ in MIXTURES:
        audio[cid] = sum(audio[src] * 10 ** (gain / 20) for src, gain in parts)
    for cid, x in audio.items():
        peak = float(np.max(np.abs(x)))
        if peak > 0.99:
            audio[cid] = x * (0.99 / peak)

    if args.wav:
        args.wav.mkdir(parents=True, exist_ok=True)
        for cid, x in audio.items():
            with wave.open(str(args.wav / f"{cid}.wav"), "wb") as w:
                w.setnchannels(1)
                w.setsampwidth(2)
                w.setframerate(RATE)
                w.writeframes((np.clip(x, -1, 1) * 32767).astype("<i2").tobytes())

    clips = []
    for cid, _, level, expect in ISOLATED:
        clips.append({"id": cid, "kind": "isolated", "levelDbfs": level, "expect": expect, "windows": run(interpreter, audio[cid])})
    for cid, parts, expect in MIXTURES:
        clips.append(
            {
                "id": cid,
                "kind": "mixture",
                "parts": [{"clip": s, "gainDb": g} for s, g in parts],
                "expect": expect,
                "windows": run(interpreter, audio[cid]),
            }
        )

    write_parity(interpreter, audio)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {
                "generator": "scripts/eval-yamnet-clips.py",
                "model_sha256": MODEL_SHA256,
                "class_map_sha256": hashlib.sha256(CLASS_MAP.read_bytes()).hexdigest(),
                "tensorflow": tf.__version__,
                "sampleRate": RATE,
                "windowSamples": WINDOW,
                "hopSamples": HOP,
                "topK": TOP_K,
                "clipSeconds": SECONDS,
                "clips": clips,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        )
        + "\n"
    )
    print(f"wrote {len(clips)} clips to {OUT.relative_to(ROOT)}")


def write_parity(interpreter, audio) -> None:
    quantized = [0.0039, 0.1484, 0.332, 0.4141, 0.5, 0.5859, 0.668, 0.8008]
    cases = {
        "all_equal": np.full(521, 0.5, dtype=np.float32),
        "quantized_ties": np.array([quantized[(i * 7) % 8] for i in range(521)], dtype=np.float32),
        "speech_and_music": infer(interpreter, audio["speech+groove"][HOP * 2 : HOP * 2 + WINDOW]),
        "pink_noise": infer(interpreter, audio["pink_noise"][:WINDOW]),
        "silence": infer(interpreter, audio["silence"][:WINDOW]),
    }
    lines = [
        "# REQ-012 top-K parity fixture, generated by scripts/eval-yamnet-clips.py. Do not edit.",
        "# One case per line: name|expected top-10 indices (best first, ties by lower index)|521 float32 scores",
    ]
    for name, scores in cases.items():
        values = ",".join(repr(float(np.float32(v))) for v in scores)
        lines.append(f"{name}|{','.join(map(str, top_k(scores)))}|{values}")
    PARITY.parent.mkdir(parents=True, exist_ok=True)
    PARITY.write_text("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
