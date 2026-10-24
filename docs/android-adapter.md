# Android YAMNet adapter design (not implemented)

Status: specified for REQ-001, **not built and not tested on any Android device.** Android audio classification must not be described as working until YAMNet runs on a physical Android device.

Android is a second platform adapter, not a different architecture. It reuses the model, label map, taxonomy, tracker, session, UI and visualization unchanged.

## What is shared

- The model file `assets/model/yamnet.tflite` and `yamnet_class_map.csv` (identical bytes, same hashes, see `model.md`).
- The TypeScript contract in `src/core/types.ts` (`SoundInput`, `RawClassification`, `AudioFeatures`, `CaptureState`) and everything above it.
- The native module name and surface used by `src/native/nativeSoundInput.ts`: `getPermissionStatus()`, `requestPermission()`, `start(modelPath)`, `stop()`, and events `onState`, `onClassification`, `onFeatures`, `onError` with the same payload shapes as the Swift module.

## What Android has to build

A Kotlin Expo module named `SoundCanvasAudio`, in `modules/soundcanvas-audio/android/`, plus `"android"` added to `platforms` in `expo-module.config.json`.

| Concern | iOS (built) | Android (planned) |
| --- | --- | --- |
| Inference | MediaPipe Tasks Audio (`MediaPipeTasksAudio` pod 1.0.0), audio-clips mode | MediaPipe Tasks Audio (`com.google.mediapipe:tasks-audio`), `RunningMode.AUDIO_CLIPS`. Google Maven lists 1.1.1 as latest; pin one version and re-check the I/O contract. |
| Capture | `AVAudioEngine` input tap | `AudioRecord` (`AudioSource.UNPROCESSED` if supported, else `MIC`), `ENCODING_PCM_FLOAT`, mono |
| Resampling | `AVAudioConverter` to 16 kHz mono | Request 16 kHz mono directly from `AudioRecord`. If the device refuses it, capture at the hardware rate and resample natively (linear or polyphase) before the shared buffering. |
| Windowing | 15,600-sample window, 7,800-sample hop, one inference in flight, extra windows dropped | Identical logic (port `WindowBuffer`) |
| Features | RMS, peak, 3-band energies every 50 ms | Identical (port `FeatureExtractor`; same one-pole filter coefficients) |
| Threads | tap thread, processing queue, inference queue | one read thread feeding a processing executor and a single-thread inference executor |
| Permission | `AVAudioApplication` / `AVAudioSession` | `RECORD_AUDIO` runtime permission via the Expo permissions API. `app.json` already declares it. |
| Foreground only | `OnAppEntersBackground` stops capture | `OnActivityEntersBackground` stops capture. No foreground service, no background recording. |
| Interruptions | session interruption and route-change notifications | `AudioManager` focus loss and device-change callbacks, reported through `onError` |
| Cleanup | `removeTap`, `engine.stop`, session deactivate, classifier released | `AudioRecord.stop/release`, classifier `close()`, executors shut down |
| Offline | model passed as a local file path | same: `modelPath` from `expo-asset`; load with `BaseOptions.setModelAssetPath`. No network fallback. |

## Model path on Android

`src/native/modelAsset.ts` already resolves the bundled asset to a file path through `expo-asset`. In a release build the asset is embedded in the APK; Android's native side must be able to read that file path (otherwise copy it to `cacheDir` once and pass that path).

## Wiring

`src/native/createSoundInput.ts` is the only place that checks the host platform. Today it returns an "unavailable" adapter on Android. Once the Kotlin module exists, return `new NativeSoundInput('android', native, resolveModelPath)` for Android as well.

## Acceptance for the follow-up REQ

- The Kotlin module compiles in an Expo development build and loads the same `.tflite`.
- The runtime contract checks pass on device (521 classes, label order).
- At least three categories demonstrated on a physical Android phone, with first-result and update latency measured and recorded next to the iPhone numbers.
- Matching weights do not guarantee matching latency or recognition quality; record any differences instead of assuming parity.
- Add an Android row to the device checklist in `implementation-notes.md`.

## Cross-platform tests that already exist

`src/core/soundSession.test.ts` runs the same speech-then-music scenario through a `FakeSoundInput` impersonating `ios` and `android`, and `src/core/normalize.test.ts` checks that normalization is identical apart from the `platform` field. These guard against iOS-only assumptions leaking into shared code.
