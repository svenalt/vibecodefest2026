# REQ-001 implementation notes

Last updated: 2026-10-24. Automated checks were run on a Mac without Xcode, so nothing below marked "not verified" has been built or run on an iPhone.

## Status against the acceptance criteria

| Criterion | Status |
| --- | --- |
| Fresh checkout installs; documented iOS build succeeds | `npm install` works. The iOS build is **not verified** (no Xcode here). `expo prebuild --platform ios --no-install` succeeds and writes the microphone usage string into `Info.plist`; `expo-modules-autolinking` finds the `SoundCanvasAudio` pod. `pod install` and the Xcode build have not run. |
| Expo project targets iOS and Android; platform code isolated | Done. One Expo app with `ios` and `android` config. Only `src/native/createSoundInput.ts` checks the platform; Swift lives in `modules/soundcanvas-audio/ios`. |
| Pinned YAMNet model and labels; I/O documented; Android design | Done. See `model.md` and `android-adapter.md`. Licence of the weights: Apache-2.0 text is embedded in the model metadata; the Kaggle page itself is **not confirmed**. |
| Development build launches on an iPhone 13 Pro Max | **Not verified.** |
| Permission granted and denied paths usable | Logic covered by unit tests with fakes. The real iOS prompt and denial UI are **not verified on a device**. |
| Start activates a live stream; Stop releases it | Logic and ordering covered by tests with fakes; the Swift teardown has not run. **Not verified on a device.** |
| Three categories demonstrated live on an iPhone | **Not verified.** |
| Live classification runs bundled YAMNet | The code path uses the bundled model through MediaPipe; **not run**. |
| Visualization responds to live energy and two categories; can be reduced | Implemented (animated, reduced, off, follows the device's Reduce Motion). Its state model is unit-tested; the Skia rendering has **not been seen on a screen**. |
| Labels and icons legible independent of the visualization | By construction: the visualization is hidden from accessibility and the text card does not depend on it. Not checked with VoiceOver. |
| Runs offline; no audio persisted or uploaded | By construction: no network calls or storage in the code; model is bundled. **Not verified** with networking disabled on a device. |
| Automated tests for mapping, ordering, schema, smoothing, cooldown, unknown | Done: 57 tests in 7 files (`npm test`), using fake adapters impersonating iOS and Android. |
| Type checking and tests pass; latency recorded | `npm run typecheck` and `npm test` pass. **Latency has not been measured** (see below). |

Also checked on this Mac: the pure-Swift `WindowBuffer` and `FeatureExtractor` were compiled with `swiftc` and exercised with a throwaway harness (window size, average hop of about 7,850 samples with 1,365-sample chunks, 20 feature frames per second, band split for 100 Hz / 800 Hz / 5 kHz tones, RMS of a sine, silence). That harness is not in the repo. All other Swift files pass `swiftc -parse` only; they were never type-checked against the iOS SDK.

## iOS YAMNet runtime details (as designed)

- Runtime: MediaPipe Tasks Audio, pod `MediaPipeTasksAudio` 1.0.0 (iOS 15+; the app targets 16.4), audio-clips mode.
- Each inference gets exactly one 15,600-sample, 16 kHz, mono, float32 window; hop is 7,800 samples (0.4875 s). Expected steady-state cadence is one result about every 0.49 s after the first window (about 0.98 s of audio plus inference time). One inference runs at a time; windows that arrive while one is running are dropped.
- Capture is one `AVAudioEngine` tap (4,096-frame buffers at the hardware rate), converted to 16 kHz mono by `AVAudioConverter`. The same samples feed the feature extractor (50 ms frames, about 20 Hz to JS) and the window buffer.
- Native sends the top 10 classes per inference plus the class count (all 521 are requested from MediaPipe with `maxResults = -1` and `scoreThreshold = 0`).

## Latency

Not measured. The app records them: the diagnostics view shows time from Start to first result and the last and mean interval between results. Record the numbers here after the first run on the iPhone:

| Metric | iPhone 13 Pro Max |
| --- | --- |
| Start to first result | _not measured_ |
| Mean update interval | _not measured_ |

## Things most likely to need a fix on first device build

These are guesses from reading code and headers, not observed failures.

1. **MediaPipe API names.** The Swift calls (`AudioClassifierOptions`, `AudioData(format:sampleCount:)`, `load(buffer:offset:length:)`, `MPPFloatBuffer(data:length:)`, `classify(audioClip:)`) were taken from the MediaPipe `master` headers. The pod is 1.0.0; if a signature differs, the compiler will say so in `YamnetClassifier.swift`.
2. **Class count.** The runtime check requires exactly 521 classes. If MediaPipe filters some categories despite `scoreThreshold = 0`, the app will stop with a "Model reported N classes" error. Loosening that check is a one-line change in `src/core/normalize.ts`, but decide it from what the device reports.
3. **Label names.** The check compares MediaPipe's `categoryName` with the CSV `display_name`. If the runtime reports something different (for example the MID instead of the name), you will see "Class order mismatch" immediately.
4. **Static frameworks.** The pod is a static framework. If CocoaPods complains about Swift pods and static libraries, set `ios.useFrameworks: "static"` through `expo-build-properties`.
5. **Thresholds.** Per-category thresholds in `src/core/eventTracker.ts` are starting values, not tuned on real sounds.

## Known limitations

- Foreground only. The microphone stops when the app leaves the foreground, on audio interruptions and on route changes; the user has to press Start again.
- Mono analysis only; no direction, distance or radar.
- Only six demo categories plus silence are surfaced; everything else is shown as "No confident sound".
- The icons are emoji. They render differently across OS versions.
- Raw scores are shown in the UI and diagnostics, labelled as not probabilities.
- Not a safety, emergency, navigation or medical system.

## Follow-up

- Native Android adapter and device testing (`android-adapter.md`).
- Tune thresholds and extend the taxonomy toward 10-15 categories after device testing.
- Check usability with deaf and hard-of-hearing users before making any assistive claims.
