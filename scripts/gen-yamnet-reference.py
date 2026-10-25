"""Generates YAMNet reference scores for the deterministic fixtures used by the Android
on-device parity test (modules/soundcanvas-audio/android/src/androidTest).

Runs the pinned assets/model/yamnet.tflite with the TensorFlow Lite interpreter on the host and
writes all 521 scores per fixture. Optional developer tool (needs `tensorflow`, e.g. 2.16.2);
the app never runs it. Usage:

    python3 scripts/gen-yamnet-reference.py

The fixture formulas must stay identical to YamnetFixtures.kt.
"""

import hashlib
import json
import math
import pathlib

import numpy as np
import tensorflow as tf

ROOT = pathlib.Path(__file__).resolve().parent.parent
MODEL = ROOT / "assets/model/yamnet.tflite"
OUT = ROOT / "modules/soundcanvas-audio/android/src/androidTest/assets/yamnet_reference.json"
MODEL_SHA256 = "4d8b4a53282dc83ef04e3e7dbc4fbc98082e34e44ed798e16c3a0cdd4c584faf"
N = 15600
RATE = 16000


def lcg_noise(amplitude: float) -> np.ndarray:
    state = 12345
    out = np.empty(N, dtype=np.float32)
    for i in range(N):
        state = (state * 1103515245 + 12345) % 2**31
        out[i] = np.float32((state / 2**31 * 2 - 1) * amplitude)
    return out


def fixtures() -> dict:
    return {
        "silence": np.zeros(N, dtype=np.float32),
        "tone_440hz": np.array([0.5 * math.sin(2 * math.pi * 440 * i / RATE) for i in range(N)], dtype=np.float32),
        "noise_lcg": lcg_noise(0.3),
        # A 2 kHz tone burst every 250 ms with an exponential decay, bell/beep-like.
        "beeps_2khz": np.array(
            [0.6 * math.exp(-((i % 4000) / RATE) * 30) * math.sin(2 * math.pi * 2000 * i / RATE) for i in range(N)],
            dtype=np.float32,
        ),
    }


def main() -> None:
    data = MODEL.read_bytes()
    assert hashlib.sha256(data).hexdigest() == MODEL_SHA256, "assets/model/yamnet.tflite is not the pinned file"
    interpreter = tf.lite.Interpreter(model_path=str(MODEL))
    interpreter.allocate_tensors()
    (inp,) = interpreter.get_input_details()
    outputs = interpreter.get_output_details()
    assert list(inp["shape"]) == [N], inp["shape"]

    result = {
        "model_sha256": MODEL_SHA256,
        "runtime": f"tensorflow {tf.__version__} tf.lite.Interpreter (host)",
        "fixtures": {},
    }
    for name, samples in fixtures().items():
        interpreter.set_tensor(inp["index"], samples)
        interpreter.invoke()
        scores = interpreter.get_tensor(outputs[0]["index"]).reshape(-1)
        assert scores.shape == (521,), scores.shape
        result["fixtures"][name] = [round(float(s), 6) for s in scores]
        top = np.argsort(-scores, kind="stable")[:3]
        print(name, [(int(i), round(float(scores[i]), 4)) for i in top])

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, indent=1) + "\n")
    print("wrote", OUT.relative_to(ROOT))


if __name__ == "__main__":
    main()
