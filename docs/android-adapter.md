# Android YAMNet adapter (REQ-009)

Status: implemented and tested on devices together with the shared UI (REQ-001–010 acceptance, 2026-10-25). Google Play release readiness is a separate gate and has not been granted.

Android is a second platform adapter, not a different architecture. It reuses the model, label map, taxonomy, tracker, session, listening-intent controller, UI and visualization unchanged. The only Android-specific TypeScript is one branch in `src/native/createSoundInput.ts`.

## What is shared

- The model `assets/model/yamnet.tflite` and `yamnet_class_map.csv` (same bytes and hashes, see `model.md`). Android does not get a copy of the model: `expo-asset` delivers it, and Gradle packages only the label CSV as a module asset.
- The TypeScript contract in `src/core/types.ts` and `NativeSoundInput` in `src/native/nativeSoundInput.ts`: `getPermissionStatus()`, `requestPermission()`, `start(modelPath)`, `stop()`, events `onState`, `onClassification`, `onFeatures`, `onError`, with the same payloads as the Swift module.

## Files

`modules/soundcanvas-audio/android/` (autolinked through `expo-module.config.json`, `android.modules = ["app.soundcanvas.audio.SoundCanvasAudioModule"]`):

| File | Role |
| --- | --- |
| `SoundCanvasAudioModule.kt` | Expo module `SoundCanvasAudio` (classic `ModuleDefinition` DSL, like the Swift module): permissions, start/stop, events, lifecycle hooks |
| `AudioPipeline.kt` | Lifecycle thread, session epochs, capture thread, inference thread, interruptions, teardown |
| `MicrophoneCapture.kt` | `AudioRecord` source/format negotiation and reads |
| `AnalysisConverter.kt` | PCM16/float, any rate and channel count -> 16 kHz mono float32 (downmix + windowed-sinc resampler) |
| `WindowBuffer.kt`, `FeatureExtractor.kt` | Ports of the Swift files (same constants and Float math) |
| `PipelineParts.kt` | `AnalysisStream` (one clock for features and windows), `InferenceSlot` (one in flight, drop extras), `SessionGate` (epochs), model hashing |
| `YamnetContract.kt` | Constants, pinned hashes, label CSV parser, 521-class audit |
| `YamnetClassifier.kt` | MediaPipe Tasks Audio wrapper |
| `src/noTelemetry/` | Release-only no-op stand-ins that disable MediaPipe's usage-stats upload (see below) |
| `src/test/` | JVM unit tests for everything above that does not need Android |

## Pipeline

| Concern | iOS (Swift) | Android (Kotlin) |
| --- | --- | --- |
| Inference | `MediaPipeTasksAudio` 1.0.0, audio-clips mode, `maxResults = -1`, `scoreThreshold = 0` | `com.google.mediapipe:tasks-audio:1.0.0`, `RunningMode.AUDIO_CLIPS`, `maxResults` **unset** (the Android builder rejects values <= 0; unset returns every class), `scoreThreshold = 0f` so model metadata cannot filter |
| Model loading | `modelAssetPath` = file path | The file `expo-asset` put in the app cache is memory-mapped and passed with `setModelAssetBuffer`. `setModelAssetPath` takes an APK asset name, not a file path. The SHA-256 is checked against the pin first. |
| Capture | `AVAudioEngine` tap, `.measurement` mode | One `AudioRecord`. Source: `UNPROCESSED` if the device declares support, else `VOICE_RECOGNITION` (no NS/AGC by default per CDD), else `MIC`. Format: 16 kHz mono float, then 16 kHz PCM16, then 48/44.1 kHz mono, then stereo. Every candidate is re-read after construction (`sampleRate`, `channelCount`, `audioFormat`) and rejected if it differs. |
| Conversion | `AVAudioConverter` | Channels averaged; PCM16 / 32768; non-finite samples -> 0; Kaiser-windowed sinc resampler (cutoff 47% of 16 kHz, flat to ~6.9 kHz, ~80 dB from ~8.1 kHz), exact rational position so 15-minute sessions do not drift and chunking does not change the output |
| Windowing | 15,600 window, 7,800 hop, one inference in flight, extras dropped | Identical (`WindowBuffer` port, `InferenceSlot`) |
| Features | RMS, peak, 3-band energies every 800 samples | Identical (`FeatureExtractor` port) |
| Timestamps | Stream time of the newest sample when the window/feature is handled | Session audio time in ms from the analysed sample count: a window is stamped with its newest sample, a feature frame with its last sample. Monotonic, one clock, reset per session |
| Threads | tap thread, processing queue, inference queue | lifecycle thread (start/stop in order), capture thread (`URGENT_AUDIO` priority: read + convert + features + windowing), single inference thread, callback `HandlerThread` |
| Label check | in JS on the top 10 | **Natively on all 521 classes before filtering** (count 521, each index once, label equals the pinned CSV, finite score), then the top 10 sorted by score with ties by index; JS checks again |
| Label name | `categoryName ?? displayName` | `categoryName`, else `displayName` (same rule) |
| Start check | none | One silent warm-up inference is audited before `listening` is reported, so a wrong model or label map is a start error, not a listening state |
| Permission | `AVAudioApplication` | Expo's permission service: `undetermined` until asked once, then `denied` for any refusal (including "don't ask again" and revocation in Settings), `granted`. The shared layer prompts only from `undetermined` and otherwise offers Settings |
| Foreground only | `OnAppEntersBackground` | `OnActivityEntersBackground` (activity paused) and `OnActivityDestroys` stop capture; `OnDestroy` also ends the lifecycle thread. No foreground service, no background capture |
| Interruptions | session interruption, engine configuration change, conversion and inference failures (one epoch-scoped `fail()` path, REQ-011) | `AudioRecord` routing change (device switched or removed), `AudioRecordingCallback` reporting this client silenced (Android 10+: calls, another app capturing, mic privacy toggle), audio mode `IN_CALL`/`IN_COMMUNICATION` (start check, and a listener on Android 12+), read errors and 2 s without data. Each releases capture and reports a terminal `onState` `error` (REQ-011) |
| Audio focus | n/a (`.record` category) | Not requested. A recorder does not need focus, and requesting it would duck or pause music the user is playing. Calls are caught by the mode and silencing checks instead |
| Cleanup | remove tap, stop engine, deactivate session | remove listeners, `AudioRecord.stop()` (unblocks the read), join the capture thread, `release()`, close the classifier on the inference thread after any inference in flight, shut down executors and the callback thread |

`stop()` is idempotent and resolves only after the microphone is released. Every event is emitted under the session gate, and teardown closes the gate first, so no feature, classification or haptic-triggering event of a stopped session can be emitted afterwards. A stop that arrives while a start is still loading the model makes that start give up before it opens the microphone. A fatal failure (read error, inference error, contract violation, interruption) closes only its own session's gate at once, then tears down on the lifecycle thread and reports `stopping` followed by a terminal `error` state with the message; a stop or a newer session that runs first supersedes it (REQ-011, same contract as iOS). Background stops never touch the persisted listening choice; foreground restart is decided by `ListeningController` in JS, so a deliberate Stop stays stopped.

Logcat (tag `SoundCanvasAudio`) gets one line when listening starts (source, delivered format, device format, model hash prefix) and one when it stops (inference count, median/P95/max inference time, windows, dropped windows). No audio data is logged.

## MediaPipe telemetry is disabled in release builds

Every `tasks-core` version on Google Maven (0.10.14 to 1.1.1) sends usage statistics to Google through `com.google.android.datatransport`: task name and mode, app package and version, latency counters. No audio, but network traffic the privacy policy rules out. There is no API switch, so for release builds `build.gradle` excludes the datatransport group and the release-only source set `src/noTelemetry/` provides no-op versions of the eight types MediaPipe links against. Debug builds keep the real library, because `expo-dev-client`'s ML Kit QR scanner already ships it there and two copies in one APK would load unpredictably; development builds can therefore send MediaPipe telemetry. Details, the upgrade check and how to revert: `modules/soundcanvas-audio/android/src/noTelemetry/README.md`. Whether the iOS pod contains something similar is still an open item in the release checklist.

## Build and run

Requirements (as of RN 0.88 / Expo SDK 58): JDK 17 or newer (JDK 21 used), Android SDK with cmdline-tools; AGP installs platform 37, build-tools 37, NDK 27.1 and CMake on the first build once licences are accepted.

```sh
export JAVA_HOME=<jdk 21> ANDROID_HOME=$HOME/Library/Android/sdk
npx expo prebuild --platform android --no-install    # generates the gitignored android/
cd android
./gradlew :soundcanvas-audio:testDebugUnitTest        # Kotlin unit tests
./gradlew :app:assembleDebug -PreactNativeArchitectures=arm64-v8a
cd .. && npx expo run:android --device               # development build on a connected device
```

A Metro/JS bundle or `expo export --platform android` is not a native build. After any change under `modules/soundcanvas-audio/android/`, rebuild the development client.

For the offline gate use a release-like build (`./gradlew :app:assembleRelease`, signed with the debug key by the generated project), install it with `adb install`, then enable airplane mode.

## Release builds

Expo's generated project minifies release builds with R8. MediaPipe ships no keep rules, so `consumer-rules.pro` keeps `com.google.mediapipe.**` and protobuf-lite messages (JNI and reflection) and silences exactly the five classes R8 reported missing (AutoValue annotations, two graph-profiling/template protos the classifier never uses). `assembleRelease` passes with them; whether the minified classifier runs is part of the device gates.

## Open issues

- Whether `UNPROCESSED` capture is too quiet for YAMNet on some devices (the source order in `MicrophoneCapture.kt` can be changed if device tests show it).
- Before Android 10 the real device format is not available; diagnostics then show the AudioRecord format.
- Android 9 and below have no "client silenced" signal: a call or another recorder may deliver silence there without an error.
- The generated release manifest also requests `INTERNET`, `READ/WRITE_EXTERNAL_STORAGE` and `SYSTEM_ALERT_WINDOW` from Expo defaults. AUVIONA uses none of them in release; decide on `android.blockedPermissions` in `app.json` before a Play Store build.
- The on-device parity test (`./gradlew :soundcanvas-audio:connectedDebugAndroidTest`, `adb logcat -s YamnetParity`) and the REQ-011/REQ-012 device regressions have no recorded results yet.
