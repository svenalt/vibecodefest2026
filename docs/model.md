# Pinned model: YAMNet (TFLite, fixed window)

One model artifact and one label map are shared by iOS and Android. Nothing is downloaded at runtime.

| File | Bytes | SHA-256 |
| --- | --- | --- |
| `assets/model/yamnet.tflite` | 4,126,810 | `4d8b4a53282dc83ef04e3e7dbc4fbc98082e34e44ed798e16c3a0cdd4c584faf` |
| `assets/model/yamnet_class_map.csv` | 14,096 | `cdf24d193e196d9e95912a2667051ae203e92a2ba09449218ccb40ef787c6df2` |

Check them with `npm run verify-model`.

## Sources

- Model: `https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite` (MediaPipe's model bucket, the YAMNet classification variant with embedded metadata and labels). Re-downloading on 2026-10-24 gave the same hash.
- Labels: `https://raw.githubusercontent.com/tensorflow/models/master/research/audioset/yamnet/yamnet_class_map.csv`, same hash.
- Upstream: https://github.com/tensorflow/models/tree/master/research/audioset/yamnet and https://www.kaggle.com/models/google/yamnet/tfLite/classification-tflite/1

## Model I/O

- Input: 15,600 samples = 0.975 s of mono, 16 kHz, float32 audio in [-1, 1].
- Output: 521 scores, in the order of `yamnet_class_map.csv` (and of `src/core/yamnet/labels.ts`, generated from it by `npm run gen-labels`).
- Scores are per-class sigmoid outputs. They are **not calibrated probabilities**.

How the contract is checked:

- Automated (`src/core/yamnet/yamnet.test.ts`): the bundled label list equals the CSV in count and order; every taxonomy entry's index carries the expected label.
- Offline, done once: the 521 labels embedded in the `.tflite` metadata matched the CSV, in order, with no mismatches.
- At runtime, on every result (`src/core/normalize.ts`): the class count must be 521, and every returned `(index, label)` pair must equal the pinned label at that index. A mismatch stops capture and shows an error instead of guessing.

## Licence

- The YAMNet implementation in `tensorflow/models` is Apache-2.0.
- The bundled `.tflite` model embeds: "Apache License. Version 2.0 ... Copyright 2022 Google LLC."
- The [official Google/Kaggle model card](https://www.kaggle.com/models/google/yamnet/tfLite/classification-tflite/1) lists **Apache 2.0** for the TensorFlow Lite classification model, confirming the model-weight licence.
- The original AudioSet training annotations have separate CC BY 4.0 terms; they are **not included** in this repository.

For redistributed model artifacts retain the attribution and the Apache-2.0 licence text in [LICENSES/Apache-2.0.txt](../LICENSES/Apache-2.0.txt). This model and the upstream labels are not part of the MIT grant for AUVIONA's original source code.

## Taxonomy

`src/core/yamnet/taxonomy.ts` holds the single versioned mapping (`TAXONOMY_VERSION = 1`) from YAMNet classes to the surfaced categories: speech, music, dog bark, applause, rain, bell, plus silence. Everything else is `unknown`. The mapping is deliberately conservative; extend it only after testing on a device.
