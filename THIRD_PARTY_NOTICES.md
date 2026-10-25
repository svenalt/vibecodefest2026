# Third-party notices

The project's own source code is MIT licensed; the files below are **not relicensed as MIT**.

## YAMNet model and labels

- `assets/model/yamnet.tflite` — Google YAMNet audio classification model (MediaPipe/TFLite), Copyright 2022 Google LLC. Apache License 2.0; the license is embedded in the model metadata and the official [Google YAMNet model card](https://www.kaggle.com/models/google/yamnet/tfLite/classification-tflite/1) identifies Apache 2.0.
- `assets/model/yamnet_class_map.csv` and the generated `src/core/yamnet/labels.ts` — sourced from the [TensorFlow YAMNet research repository](https://github.com/tensorflow/models/tree/master/research/audioset/yamnet); retain Google/TensorFlow attribution and upstream terms.

The full Apache License 2.0 text is included in [LICENSES/Apache-2.0.txt](LICENSES/Apache-2.0.txt). See [docs/model.md](docs/model.md) for provenance and SHA-256 verification.

Other npm, Expo, React Native, MediaPipe and platform dependencies are provided under their respective licenses. Consult upstream package metadata when redistributing binary builds.
