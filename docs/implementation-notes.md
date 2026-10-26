# REQ-001 implementation notes

> **Current acceptance (2026-10-25):** Sven has tested and accepted the delivered functionality on devices, including REQ-010. See [owner acceptance](release/device-acceptance-2026-10-25.md). Earlier “not run” statements below are historical coding-session evidence, not the current device-acceptance status. New fixes/configuration are tracked in REQ-011; binary audits and store operations remain separate.

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
| Visualization responds to live energy and two categories; can be reduced | Implemented (animated, or a still frame when the device's Reduce Motion is on; REQ-010 removed the user-facing Motion and Off settings). Its state model is unit-tested; the Skia rendering has **not been seen on a screen**. |
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

- Foreground only. The microphone stops when the app leaves the foreground, on audio interruptions and on route changes. Returning to the foreground starts listening again (and clears the in-memory timeline); after an interruption or route change the user has to press Start again.
- Mono analysis only; no direction, distance or radar.
- Only six demo categories plus silence are surfaced; everything else is shown as "No confident sound".
- Icons are a small line-icon set drawn with Skia (REQ-006); they are decorative and always paired with text.
- Raw labels and scores appear only in the development-build diagnostics (Settings > Developer, `__DEV__` only since REQ-010), never in the main UI or in release builds.
- Not a safety, emergency, navigation or medical system.

## Follow-up

- Native Android adapter and device testing (`android-adapter.md`).
- Tune thresholds and extend the taxonomy toward 10-15 categories after device testing.
- Check usability with deaf and hard-of-hearing users before making any assistive claims.

# REQ-005 Universe V2 notes

Last updated: 2026-10-24. Not yet run on an iPhone; frames were rendered headlessly with CanvasKit (the WASM build of the same Skia API) to review the composition in Dark and Light.

## What changed

- `src/viz/vizModel.ts`: the same adaptive ambient baseline now also tracks `peak`, so short taps register. Onsets (a rise of the foreground intensity above its recent value) emit at most 6 short-lived **bursts**, rate-limited to about 4 per second. `bands` is now band energy (tone balance × intensity), so Forms is ~0 in silence. `flow` drives drift and advances faster with sound; `time` only does slow breathing. `presence` fades the scene between listening and stopped.
- `src/viz/universePainter.ts`: draws the scene into one `SkPicture` per frame with reused paints, gradient sprites and path builder; the gradient background and far stars are a cached picture. Layers: nebula, parallax stars, central halo, music orbs, light ribbons, rain motes, glints, bursts.
- `src/viz/SoundCanvasView.tsx`: React renders one `<Picture>` and swaps a single prop per frame (previously ~100 elements and paths). Drops to 15 fps when stopped and settled.

## Motifs (real detections only)

| Detection | Treatment |
| --- | --- |
| Speech | Two extra strands fade in; all ribbons drift toward lavender, widen and ripple outward from onsets |
| Rain | Mint and gold motes drift down, faster and brighter with sound; onsets scatter a small spray |
| Bell, dog bark, applause | Thin expanding rings with glints, only on onsets; no rings in silence |
| Music | Three soft orbs, each swelling with its own band's energy |
| Unknown / quiet | Neutral lavender and white bloom on onsets |

## Not verified on device

- Frame time and JS load on the iPhone 13 Pro Max. Headless recording took about 1.8 ms per frame in WASM; native JSI cost is not measured.
- Memory: a new `SkPicture` per frame is left to garbage collection. Watch memory in Instruments during a long session.
- Onset sensitivity (`ONSET_MIN`, `PEAK_WEIGHT`) is tuned on synthetic inputs only.

# REQ-006 Premium UI and immersive mode notes

Last updated: 2026-10-24. Typecheck and unit tests pass; **nothing in this section has been run on an iPhone or Android device**, and there was no simulator or web target on the development Mac. The Universe was rendered headlessly with CanvasKit at card size (396×389) and full-screen iPhone 13 Pro Max size (428×926) in both themes to confirm the painter recomposes for a tall viewport without stretching.

## What changed

- **Live-only navigation.** The REQ-004 four-tab shell is gone: no bottom bar, and Sound Walk and Gallery are removed (`TabBar.tsx` and `ComingSoonScreen.tsx` deleted). Live is the root screen. A gear button ("Open settings") at the top right of the Live header opens Settings as a secondary screen with a "Back to Live" button. View state is a pure reducer (`src/app/navigation.ts`, unit-tested): Android back leaves immersion, then Settings, then the app. Live stays mounted and paused while Settings is open, and `SessionProvider` stays above both, so switching never starts or stops listening or clears recent sounds.
- **Microphone status only in Settings** (product decision, overriding the REQ-006 text that asks for it on Live and in immersion). Live and immersive mode have no ON/OFF indicator. They still show a blocked permission (with "Open system settings") and capture errors, so failures are not silent. The sound tile states plainly when nothing is being heard ("Not listening"), and Live offers "Open Settings to start listening" when listening is off or has failed.
- **Immersive mode.** An expand button at the top right of the Live artwork ("Enter immersive mode") makes the same artwork fill the screen. `LiveScreen` keeps one tree: the header, sound tile, notices and timeline unmount, and the artwork's container grows from a fixed height to `flex: 1`. The status bar is hidden while immersed. `SoundCanvasView` always fills its parent and measures its own size, so the one painter is rebuilt once for the new size while `VizState`, the frame loop and the session stay as they are. No start/stop, timeline reset, second canvas or second loop.
- **Immersive overlay** (`ImmersiveOverlay.tsx`): an always-visible Exit button at the top right inside the safe area, on an opaque scrim, plus the blocked/error notices above.
- **Pure Art / Art + Sounds**: a two-option radio group at the bottom (not persisted). Art + Sounds shows an icon and category caption for about 3 s on a real newly confirmed category (`captionKey` in `status.ts`: never for silence, unknown or a stopped mic), and a "Current sound" button to show the current state again. Captions do not fade with Reduce Motion or Reduced visualization.
- **Visualization setting**: Off removes the artwork and the expand button, explains why on Live, and ends immersion. Reduced shows the still artwork full screen.
- **Live polish**: `CurrentSound` is a compact tile with plain-English state ("Detected just now", "Listening for sounds", "Not listening", "Microphone blocked", "Listening stopped") and no raw label or score. `Timeline` shows the latest 3 sounds with a session-time stamp; "Show all N" expands the full in-memory list.
- **Icons and tokens**: one 24 pt line-icon set in `icons.ts` (including a generated gear), drawn with Skia by `Icon.tsx` (no font or new native dependency). `theme.ts` adds `SPACE`, `RADIUS`, `TYPE` scales and scrim, muted-card and icon-well colours. Settings uses grouped cards with icons.
- **Diagnostics** now also shows the current event's raw label and score.

## Not verified on device

- iPhone 13 Pro Max screenshots of Live Dark, Live Light, Settings, Immersive Pure Art and Immersive Art + Sounds: **not taken**.
- Android hardware back through immersion → Settings → Live.
- Whether `StatusBar hidden` takes effect on iOS in this build, and how hiding it shifts Android insets.
- Painter rebuild cost when toggling (one `UniversePainter` per size change) and any frame hitch on entering or leaving.
- VoiceOver/TalkBack order in the overlay, large Dynamic Type layouts and real contrast over the moving artwork.
- Skia icon rendering cost: each icon is a small `Canvas` (about 8 on Live).


# REQ-007 Live focus and Universe V3 notes

Last updated: 2026-10-24. Typecheck and unit tests pass. **Nothing in this section has been run on an iPhone or Android device.** The artwork was rendered headlessly with CanvasKit (the WASM build of the same Skia API) at card (396×389), portrait full-screen (428×926) and wide (834×470) sizes in both themes, and compared against `docs/design/sonora-universe-v3-concept.png`. A few of those captures are in `docs/design/v3-headless/`; they are **not** device screenshots.

## Navigation (P0-A)

Already delivered by commit `4285d03` and verified against REQ-007: Live is the only main view, there is no tab bar, Sound Walk or Gallery, the gear (top right, "Open settings") opens Settings with "Back to Live", Android back leaves immersion, then Settings, then the app, and `SessionProvider` sits above both views so the session, timeline and the one canvas survive switching. The only change here is the Dark artwork backdrop token (`vizBg`), now a near-black navy void instead of the purple gradient.

## Universe V3 (P0-B)

- `src/viz/ribbonField.ts` (new, pure, unit-tested): five translucent "sheets" (far teal, warm middle, warm-to-cool diagonal, cool foreground, low ember glow). Each is a centre line, a half-thickness and a slow twist; its hairline threads sit at `centre + half * s * cos(twist)`, so where a sheet turns edge-on the threads converge into a bright fold. Layout is recomputed from the real canvas size: wide frames keep roughly the upper third dark; portrait recomposes a taller landscape a little below centre with fewer, unsqueezed waves. Fixed seeds and phases; motion comes only from `flow` (slow at rest) and sound.
- Sound shapes the geometry, not only brightness: `level` and mid-band energy raise and bend the crests, low-band energy thickens the lower sheets, and every onset (`bursts`) lifts a crest that then splits into two deformations travelling along the ribbons and releasing within `BURST_LIFE_S` (back sheets answer a beat later). High-band energy brightens threads, glints and motes. In silence consecutive frames move by under 1.5 px.
- `src/viz/universePainter.ts` (rewritten): cached backdrop and vignette, haze only around the ribbon zone, then per sheet a translucent body, a soft wide centre glow, hairline threads with a horizontal colour gradient, and a luminous lit edge (stacked strokes, no blur pass). Far sheets are softer (depth of field). About 42 small amber/teal sparks drift above the middle crests (brighter with high-band energy), and each onset throws up a spray of 7 sparks from its crest that drift and fade with the burst (at most 42 extra while 6 bursts are live). Dark uses Screen blending on the void; Light is a separately tuned pearl/lilac palette with deeper turquoise, honey gold and lavender edges.
- Category accents (real detections only, cross-faded by the existing motif weights): speech weaves lavender strands through the warm and foreground sheets; rain adds mint/gold motes; bell/dog bark/applause send a gold edge glow and glints along the onset wave; music adds band-led modulation to the sheets; unknown/quiet keeps the neutral composition. Every onset glows briefly along the front edge in the motif's colour.
- `vizModel.ts` is unchanged. `SoundCanvasView` is unchanged: one canvas, one loop, one `SkPicture` per frame, Reduced draws one still frame, Off draws nothing.

## Cost and limits

- Headless recording takes about 3-4 ms per frame in WASM (V2: about 1.8 ms), roughly 60 path draws and up to about 150 small sprites and dots, with about 2,000 path-builder calls per frame. On device these are JSI calls; their cost, GPU time for the Screen-blended strokes and thermal behaviour over 5-10 minutes are **not measured**.
- The soft glows are stacked strokes, not real blur, so at high energy faint steps can show at the edge of the glow. A blur mask filter would look closer to the concept but costs more per frame; try it only after profiling on device.
- The concept's dense particle spray and photographic depth of field are only suggested (sparse motes, softer far sheet).

## Not verified on device

- iPhone 13 Pro Max screenshots of Dark Live, Light Live and Dark immersive, and a recording of the motion during real speech, taps and music: **not taken**.
- Whether a quiet voice in a quiet room produces visible deformation at real microphone levels (tuned on synthetic inputs only).
- Frame rate, memory (one `SkPicture` per frame left to GC) and heat over a 5-10 minute session.


# REQ-008 AUVIONA 1.0 release-readiness notes

Last updated: 2026-10-25. Typecheck, 137 unit tests and `verify-model` pass. **Nothing in this section has been built, signed, uploaded or run on an iPhone.** Release gates, the audit and the device QA matrix live in `docs/release/auviona-release-checklist.md`.

## Identity (P0-A)

- `app.json`: name `AUVIONA`, slug and scheme `auviona`, version `1.0.0`, new microphone text (on-device, in memory only, never recorded, saved or uploaded). The bundle/package ID is deliberately still `app.soundcanvas.poc` until the owner confirms the permanent one.
- Live header (spoken as "Auviona"), the three "Microphone access is turned off" notices and About now say AUVIONA. No blind replace: internal module, pod, component and package names are unchanged.

## Listening intent (P0-C)

- `src/core/listeningController.ts` keeps the user's **desired** listening separate from actual capture. Capture runs only while desired AND foreground. Leaving the foreground (background, or iOS's inactive state during system sheets) and unmount release the microphone without touching `desired`; only Start/Stop change it, and they persist it at once.
- `SoundSession.stop()` now cancels a start that is still in flight (generation counter): a stop during the permission prompt prevents capture from opening, and a stop during capture start-up releases it as soon as start-up finishes. A start that settles after the inputs changed triggers one more reconcile, so the last state wins. A failed start is not retried in a loop.
- The Settings button offers **Stop** while a start is in flight, so a pending start can be cancelled. A hint under it explains the auto-resume rule.
- Permission is requested only from a start, and a start runs only while listening is desired. With listening off, foregrounding never prompts.

## Preferences (P1-A, also stores the P0-C intent)

- `src/app/preferences.ts`: one JSON entry (`auviona.preferences`, versioned) in AsyncStorage holding theme, `viz` (the user's actual choice; `null` still means follow Reduce Motion), `listening` and `hapticAlerts`. Writes are ordered; a failed write keeps the in-memory value.
- Recovery is deterministic. Missing key = first install (Dark, follow device, listening **on**, haptics off). Unparsable JSON, wrong version, a read error or a read that hangs past 1.5 s = defaults with listening **off**, so a persisted Stop can never turn into an auto-start. Invalid single fields fall back per field, and an invalid `listening` means off.
- `PreferencesProvider` renders a plain Dark-background view until the read finishes, so there is no wrong-theme flash, animation burst or early auto-start.

## Haptic alerts (P1-B)

- Off by default, persisted. When on, `HapticCueGate` plays one medium impact (`expo-haptics`) per **new timeline event**, i.e. after smoothing, debounce and the per-category cooldown, and only while actually listening. Events seen while off, stopped or backgrounded are consumed, never replayed, and cues are at least 4 s apart across categories.
- iOS mutes haptics while an audio session is recording. `AudioPipeline` now sets `setAllowHapticsAndSystemSoundsDuringRecording(true)` (syntax-checked with `swiftc -parse` only). Whether the cue is felt during capture is **unverified**.
- `HAPTIC_ALERTS_AVAILABLE` in `src/app/release.ts` shows the setting. Turn it off for a public build unless it was tested on an iPhone.

## Privacy and support (P0-B)

- Settings > About has distinct **Privacy Policy** and **Support** links (role `link`, 56 pt targets, both themes) and the app version. `openPublicPage` accepts only `https://` URLs and never throws; an unpublished page or a failed open shows a plain alert instead of crashing.
- `PRIVACY_POLICY_URL` and `SUPPORT_URL` are `null` until the owner confirms a domain and the drafts in `site/` are live.

## New dependencies

`@react-native-async-storage/async-storage` 2.2.0, `expo-haptics` ~58.0.7, `expo-constants` ~58.0.13 (already in the tree via `expo`), all installed with `npx expo install`. `expo-haptics` adds Android's `VIBRATE` permission (no prompt).

# REQ-009 Android native audio and YAMNet notes

Last updated: 2026-10-25, branch `req-009-android-native-audio` from `0315272` on `req-008-auviona-release` (REQ-008 identity, listening intent and preferences are present on this branch; nothing of REQ-008 was changed). **Implemented but native/device validation BLOCKED: no Android device was connected to the development Mac.** Android is not supported until the physical-device gates pass. Design and decisions: `android-adapter.md`.

## Prerequisite check

- HEAD contains REQ-008 (`app.json` name AUVIONA, slug/scheme `auviona`, `ListeningController`, preferences, opt-in haptics). The package ID is still `app.soundcanvas.poc` by the REQ-008 decision.
- No REQ-008 discrepancy found. `expo-haptics` adds `VIBRATE`; the Kotlin module adds nothing beyond `RECORD_AUDIO` (already in `app.json`) and an optional `android.hardware.microphone` feature.

## Toolchain used

Installed for this work on the development Mac (macOS 12.7.6, Intel x86_64, 8 GB RAM): Temurin JDK 21.0.13+9 (SHA-256 checked) in `~/Library/Java/JavaVirtualMachines`, Android cmdline-tools 15641748 in `~/Library/Android/sdk`, licences accepted. AGP then installed platform `android-37.0`, build-tools 36.0.0 and 37.0.0, NDK 27.1.12297006 and CMake 3.22.1. About 6 GB of disk in total with the Gradle cache.

| Component | Version |
| --- | --- |
| Expo SDK / React Native | 58.0.19 / 0.88.0 (`expo-modules-core` 58.0.26, autolinking 58.0.15) |
| Gradle / AGP / Kotlin | 9.4.1 / 9.2.1 / 2.2 (RN catalog) |
| compileSdk / targetSdk / minSdk | 37 / 36 / 24 |
| MediaPipe | `com.google.mediapipe:tasks-audio:1.0.0` (minSdk 24); `tasks-core` 1.0.0 transitively |
| Model | `yamnet.tflite` SHA-256 `4d8b4a53...4c584faf` (pinned, unchanged) |

Commands (from the repo root, `JAVA_HOME` set to JDK 21, `ANDROID_HOME` to the SDK):

```sh
npm run typecheck && npm test && npm run verify-model
npx expo prebuild --platform android --no-install
npx expo-modules-autolinking resolve --platform android --json
cd android
./gradlew --max-workers=2 :soundcanvas-audio:testDebugUnitTest :soundcanvas-audio:assembleDebugAndroidTest \
  :app:assembleDebug :app:assembleRelease -PreactNativeArchitectures=arm64-v8a
```

The first full debug build took 90 minutes, most of it with three Skia C++ compiles thrashing an 8 GB machine; pausing all but one compiler at a time let them finish in minutes. On a small Mac, use `--max-workers=2` and expect the first native build to be slow.

## Automated gates

| Gate | Status | Notes |
| --- | --- | --- |
| `npm run typecheck`, `npm test`, `npm run verify-model` | **PASS** | 152 tests in 16 files (137 before REQ-009); REQ-007/008 suites unchanged and passing |
| TS bridge: Android native present/absent, permission grant/deny, payloads, errors, start/stop, Expo Go fallback | **PASS** | `src/native/createSoundInput.test.ts` (12), `nativeSoundInput.test.ts`; Expo Go now shows why it cannot listen instead of staying silent |
| Kotlin pins equal the repo pins | **PASS** | `src/native/nativePins.test.ts` (hashes, window/hop/rate/classes, module config) |
| Kotlin pure DSP: formats, resampling, 15,600/7,800 windowing, 800-sample features, RMS/peak/bands for silence/tones/noise, finite 0..1, bounded queue, teardown | **PASS** | 39 JUnit tests: `AnalysisConverterTest` (11, incl. 48 and 44.1 kHz, stereo, split frames, NaN, aliasing below -40 dB, passband within 0.5 dB, chunking-independent output, no drift over 60 s), `WindowBufferTest` (5), `FeatureExtractorTest` (5), `AnalysisStreamTest` (1), `InferenceSlotTest` (4), `SessionGateTest` (3), `YamnetContractTest` (10) |
| 521-class audit before top 10, label parity, ordering, ties, timestamps, epoch cancellation, error propagation | **PASS** (host) | `YamnetContractTest`, `SessionGateTest`, `AnalysisStreamTest`, TS error tests. Runtime behaviour on a device NOT RUN |
| Fixed fixture vs reference with a stated tolerance | **BLOCKED (device)** | Host reference generated with TensorFlow 2.16.2 (`scripts/gen-yamnet-reference.py`): silence -> Silence 0.80, 440 Hz -> Sine wave 0.996, noise -> Static/White noise, 2 kHz beeps -> Sine wave. Scores are 1/256 steps. `YamnetParityTest` (tolerance 0.02 per score, tie-aware top 1/top 5) compiles; JVM and Python fixture bytes are identical. Needs a device. No iPhone output exists to compare yet |
| Prebuild/autolinking and full native Gradle debug build | **PASS** | See commands above. Debug APK 115 MB (arm64-v8a) |
| Release build | **PASS** | 54 MB; model embedded with the pinned hash; required five R8 `-dontwarn` rules (`consumer-rules.pro`) |
| iOS/Swift path unchanged | **PASS** (by diff) | No file under `modules/soundcanvas-audio/ios/` changed; `expo-module.config.json` keeps `apple.modules`; iOS bridge tests pass. Not rebuilt (no Xcode) |

Found and fixed while building:

- The first Kotlin test compile failed on a `;` in a backticked test name (not allowed on the JVM).
- The first debug APK contained both the no-op datatransport classes and Google's real library (brought by `expo-dev-client`'s ML Kit QR scanner, debug only) in different dex files, without a build error. The stand-ins and the exclusion are now release-only (`src/noTelemetry/README.md`).
- R8 failed on missing MediaPipe references until the consumer rules were added.
- Android's `AudioClassifierOptions` rejects `maxResults = -1` (which iOS uses), so it is left unset.

## Physical-device gates

None of these could run: `adb devices` listed no device on this Mac. Every row is **NOT RUN**. The suggested first target is the Samsung Galaxy Tab A11; record its Android version and hardware, and do not claim phone validation from a tablet.

| Gate | Status | How to run / what to record |
| --- | --- | --- |
| Clean install; mic granted / denied / "don't ask again" / revoked; Settings recovery | NOT RUN | Fresh install, deny twice, re-enable in Settings (app details page via "Open system settings"), revoke while backgrounded (Android kills the process; relaunch must show blocked, not listening) |
| Three real categories (e.g. speech, music, bell / bark / applause / rain) | NOT RUN | Raw label and score in Settings > Diagnostics, timeline entries and visual response |
| Silence and unknown stay calm | NOT RUN | Quiet room for 2 min: no flood of confident events |
| Diagnostics: 521 classes, pinned hash, real hardware format, 16 kHz mono analysis | NOT RUN | Diagnostics + `adb logcat -s SoundCanvasAudio` start line (source, client and device format, model hash prefix) |
| On-device parity with host reference | NOT RUN | `cd android && ./gradlew :soundcanvas-audio:connectedDebugAndroidTest`; `adb logcat -s YamnetParity` shows per-fixture max difference |
| Release-like build classifies in airplane mode, no Metro | NOT RUN | `./gradlew :app:assembleRelease`, `adb install`, airplane mode on |
| 20x Start/Stop, 10x background/foreground, Stop while starting, revoke, Stop -> background -> foreground stays stopped, Stop -> force quit -> relaunch stays stopped | NOT RUN | Watch for stale events, two mic indicators, stuck state, post-stop haptic |
| Route change (wired/USB/Bluetooth headset), call, another app recording | NOT RUN | Expect capture released and a "Start listening again" error; restart follows the user's choice |
| 15 min continuous listening | NOT RUN | Crashes, memory (`adb shell dumpsys meminfo app.soundcanvas.poc`), CPU, battery temperature; stop summary in logcat |
| Settings, Dark/Light, Reduce Motion/Off, immersive, Back, large text, TalkBack | NOT RUN | Errors must stay visible above the artwork |
| Start -> first result, median/P95 interval over 30+ results, inference duration, dropped windows | NOT RUN | Diagnostics (first result, intervals) and the logcat stop line (median/P95/max inference, windows, dropped) |

## Latency

| Metric | Android device | iPhone 13 Pro Max |
| --- | --- | --- |
| Start to first result | _not measured_ | _not measured_ |
| Median / P95 update interval | _not measured_ | _not measured_ |
| Inference median / P95 | _not measured_ | _not measured_ |

Expected: first result after about 1 s of audio plus model load and inference; nominal hop 487.5 ms.

## Open issues

- Every physical-device gate above.
- Whether `UNPROCESSED` capture is too quiet on some devices for YAMNet (the source order can be changed in `MicrophoneCapture.kt` if device tests show it).
- Before Android 10 the real device format is not available; diagnostics then show the AudioRecord format.
- Android 9 and below have no "client silenced" signal: a call or another recorder may deliver silence without an error there.
- The iOS MediaPipe pod has not been checked for telemetry (release checklist).
- Play release gate, not REQ-009: the generated release manifest also requests `INTERNET`, `READ/WRITE_EXTERNAL_STORAGE` and `SYSTEM_ALERT_WINDOW` from Expo defaults. AUVIONA uses none of them in release; decide on `android.blockedPermissions` in `app.json` before a store build.
- Debug builds can send MediaPipe usage statistics (see `noTelemetry/README.md`); judge network behaviour only on a release build.

# REQ-010 Simplified Settings and live immersive sound card notes

Supersedes the Motion setting (REQ-004/006/008), the Settings > Diagnostics group (REQ-006) and the expiring Art + Sounds caption with its "Current sound" button (REQ-006) described above.

## Settings

- Release builds show only **Listening**, **Appearance** and **About**, in that order. The Visualization (Animated / Reduced / Off) and Diagnostics groups are gone.
- `Diagnostics.tsx`, the session's diagnostic counters and the native logs are unchanged. The panel is rendered in Settings under a **Developer** group only when `__DEV__` is true (Metro/dev-client builds), so EAS preview/production builds never contain it.

## Motion follows the device

- `effectiveViz = vizModeFor(useReduceMotion())` (`src/viz/vizModel.ts`): animated, or one still frame when Reduce Motion is on. There is no "off", so the artwork and immersive mode are always available; the "artwork is turned off" card on Live and the `vizOn`/`vizOff` navigation paths were removed.
- `PreferencesProvider` waits for `primeReduceMotion()` (bounded at 500 ms) alongside the preferences read, so the first frame already uses the right mode. `useReduceMotion` follows `reduceMotionChanged` and re-reads on every return to the foreground.

## Legacy `viz` preference

- `viz` is no longer part of `Preferences`. `parsePreferences` ignores any stored `viz` value (`'off'`, `'animated'`, `'reduced'`, `null` or garbage) without marking the entry as recovered, and the next write drops the field. The schema version stays 1, so stored theme, haptic alerts and especially `listening: false` survive the upgrade. Hydrating alone never rewrites storage.

## Immersive Art + Sounds

- The bottom card is always present in Art + Sounds and renders `immersiveCard(...)` (`src/ui/status.ts`) from the current snapshot on every render: the confirmed `tracker.current` event while the microphone is on, otherwise the same truthful status as Live (Listening for sounds, Quiet, Not listening, Starting…, Microphone blocked, Listening stopped). No timer, fade or tap. Pure Art shows no card.
- `captionKey`, the caption timer and fade, the `reduceMotion` prop and the "Current sound" button were removed. Screen readers still hear confirmed changes through the app-wide announcement in `SessionProvider`.

## Verification

- `npm run typecheck` and `npm test` pass. New tests: legacy `viz` parsing and migration, `vizModeFor`, `immersiveCard`, and source checks for the Settings groups and the overlay (`src/ui/settingsLayout.test.ts`), since the node test environment cannot mount React Native screens.
- **Not run on a device**: iOS smoke test, Reduce Motion on/off, legacy upgrade with `viz: 'off'`, Dark/Light, large text and VoiceOver/TalkBack. Android awaits the REQ-009 device gates.

# REQ-011 Audio recovery, reliable Stop persistence and release configuration notes

Last updated: 2026-10-25, from main `0a0edc1`. Implemented and covered by automated tests; **not device-verified and not owner-accepted yet**. The REQ-001–010 device acceptance is unchanged.

## P0-A fatal audio failures

- iOS `AudioPipeline.fail(epoch, message)` is the single path for conversion, inference, interruption and route-change failures. It invalidates the session under `stateLock` (so the tap, processing and inference queues drop everything from then on), then tears down on a global queue under the lifecycle lock and emits `stopping` and a terminal `error` state. It never waits on the queue it is called from. `failedEpoch` lets a `stop()` or `start()` that gets the lock first take over the teardown; an old session's failure cannot touch a newer one. The `error` sink is gone; `onError` stays declared in the module for the shared contract.
- Android already tore down on the lifecycle thread. It now closes only its own gate epoch at the moment of failure (`SessionGate.close(epoch)`) and reports `stopping` and a terminal `error` state instead of `idle` plus `onError`.
- `SoundSession` has a per-session `active` flag and a generation bumped by every start, stop and failure. A failure (terminal `error` state, a bare `error` event, or a model-contract violation in JS) ends the session: later classifications, features and errors are dropped, the current detection is cleared (`EventTracker.endSession`, timeline kept), the capture shows `stopping` until released, and a late stop result cannot overwrite a newer session. `start()` waits for any stop still releasing capture.
- `micState` puts a failure before `listening`, and `SessionProvider`/`useSoundSession` treat a failed session as not listening, so Live, Settings and immersive Art + Sounds show the problem, not a sound, and no haptic or feature frame follows.
- No automatic retry. Start retries once; a return to the foreground also retries once, as interruptions did since REQ-008.

## P0-B asynchronous Stop

- `ListeningController` keeps the start and stop promises it issued, sets `recheck` when the inputs change while one is in flight, and reconciles once more only when the last one settles. A start waits while capture is `stopping` (also a native-initiated teardown) via a session subscription. `ListeningIntent` gains `stopping`.
- `setForeground` ignores repeated values; `isForegroundAppState` accepts only `active`, also at launch (`useSoundSession`).

## P1-C Stop persistence

- `PreferencesStore` keeps a revision counter and writes only the latest preferences, one write at a time, with up to two retries (`SAVE_RETRY_DELAYS_MS`), a 3 s "no answer" report that never starts a racing write, `getSaveState()` (`saved`/`saving`/`failed`), `getLaunchListening()` (what the next launch would read) and `retrySave()`. `PreferencesProvider` exposes them and retries a failed save when the app goes to the background.
- Settings: `listeningHint` only promises a lasting Stop when it is saved; `saveNotice` shows "Listening is stopped, but this choice could not be saved for the next launch." with **Retry**. The in-memory intent and the microphone are never changed by a failed save.
- Restart strategy and remaining limit: see the release checklist ("REQ-011 failure recovery and Stop persistence").

## P0-D identity and links

- `app.json`: `ch.auviona.app` for iOS and Android. EAS project, `1.0.0` and remote build numbers unchanged. The gitignored local `android/` was regenerated with `expo prebuild --platform android --no-install` (`MainActivity`/`MainApplication` now under `ch/auviona/app`).
- `release.ts`: `PRIVACY_POLICY_URL = https://auviona.swarmz.cloud/privacy`, `SUPPORT_URL = https://auviona.swarmz.cloud/support` (canonical URLs from the live footer and `<link rel="canonical">`), `PRE_RELEASE = false`, haptics kept.
- The live pages' wording is still pre-release (see the release checklist); that is website content for the owner, not app configuration.

## Verification

Run on the development Mac (macOS 12, Command Line Tools only, Node 24, JDK 21) on 2026-10-25:

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm test` | PASS, 208 tests in 18 files (before: 167 in 17) |
| `npm run verify-model` | PASS, both SHA-256 match |
| Mutation check | Reverting only `soundSession.ts`: all 9 new session tests fail. Reverting only `listeningController.ts`: 5 of 12 new controller tests fail |
| Kotlin `:soundcanvas-audio:testDebugUnitTest` | PASS, 40 tests (39 + epoch-scoped `SessionGate.close`) |
| Android `:app:assembleDebug` (arm64-v8a) | PASS; `aapt2 dump badging`: `package: name='ch.auviona.app' versionCode='1' versionName='1.0.0'` |
| `expo prebuild --no-install --platform all` (scratch copy) | PASS; iOS `PRODUCT_BUNDLE_IDENTIFIER = "ch.auviona.app"`, `CFBundleShortVersionString 1.0.0`, no team set; Android `applicationId`/`namespace` `ch.auviona.app` |
| iOS Swift compile | **Not possible here** (no Xcode / iOS SDK). `swiftc -typecheck` of `AudioPipeline.swift` + `WindowBuffer.swift` + `FeatureExtractor.swift` against the macOS SDK with a stub `YamnetClassifier` reports only the 13 `AVAudioSession … unavailable in macOS` errors that the unchanged file also reports, and nothing else. A real Xcode build is still required |
| Privacy/Support URLs | `curl` over HTTPS: `/privacy` and `/support` answer `307` to the trailing-slash path, then `200 text/html` with the intended pages; canonical links match |
| Device regression (fault injection, delayed stop, links, fresh install) | **Not run** (no device here) |

# REQ-012 Full YAMNet taxonomy and simultaneous sounds notes

Implemented 2026-10-26 on top of `3d42a48`. Details of the taxonomy, thresholds and evidence: [model.md](model.md#taxonomy-req-012) and [evaluation/req-012-host-evaluation.md](evaluation/req-012-host-evaluation.md). **Not accepted:** device QA has not run.

## What changed

- `taxonomy.ts` v2: all 521 classes, each with display name, one of 11 visual families, a subtype group, an umbrella flag and a role (509 sounds, 11 context, silence). The six-category allowlist, `SoundCategory` and `CATEGORY_DISPLAY` are gone.
- `normalize.ts`: returns the validated top 10 as ranked candidates; adds the top-K bound, index range/duplicate and finite-score/timestamp checks.
- `eventTracker.ts`: per-sound tracking with onset, hysteresis, hold and release; one sound per family, at most three (primary + two); per-sound cooldown; water/noise contradiction rule; thresholds by label, group, family and default. `Current` is `{ primary, secondary }`; Recent sounds entries carry label, family and raw label.
- UI: the sound tile and the Art + Sounds card show the primary as the title and the others as small labels (`AlsoSounds`), read in one accessibility label. Pure Art is unchanged. One icon per family (four new: vehicle, home, tools, impact; the six keep theirs). `SoundAnnouncer` announces a new primary once and new secondary sounds at most every 4 s.
- Artwork: `VizState` cross-fades one layer per family (primary 70–100 %, each secondary 15 %); motif weights are the sums of the layers. Families that share the strand motif draw on their own threads in their own tint; bursts take the primary's tint. Sound features remain the only motion source.
- Native: iOS audits the full 521-class output (count, unique indices, finite scores) and breaks ties by lower index, like Android (`YamnetAudit.swift`). `TOP_K` is pinned in TypeScript, Kotlin and Swift. Shared parity cases: `modules/soundcanvas-audio/test-fixtures/topk-parity.txt`.
- Nothing persisted changed (preferences hold no sound data), so no migration is needed. No new permissions, dependencies or network access. The model and label hashes are unchanged.

## Verification

Run on the development Mac (macOS 12, Command Line Tools only, Node 24, JDK 21) on 2026-10-26:

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm test` | PASS, 272 tests in 20 files (before: 208 in 18) |
| `npm run verify-model` | PASS, both SHA-256 match the pins (unchanged) |
| Kotlin `:soundcanvas-audio:testDebugUnitTest` | PASS, 41 tests (40 + shared top-K parity) |
| `npm run check-ios-audit` (`swiftc`) | PASS: 5 parity cases, 6 contract rejections, top-K size |
| iOS Swift typecheck | `swiftc -typecheck` of `YamnetAudit.swift`, `YamnetClassifier.swift` (against a MediaPipe API stub), `AudioPipeline.swift`, `WindowBuffer.swift`, `FeatureExtractor.swift` against the macOS SDK: only the 13 known `AVAudioSession … unavailable in macOS` errors. A real Xcode build is still required |
| Host clip evaluation | 58 clips: 21/40 isolated and 15/18 mixtures show an expected family (six-category build: 14/40, 14/18); silence and room tone never show a sound; no regression on the original six |
| Device QA (iOS, Android), performance, VoiceOver/TalkBack | **Not run** (no device here); checklist in the evaluation document |

## Open points

- User-facing copy still describes six sounds: `docs/release/app-store-metadata.md` ("recognises a small set of everyday sounds … other sounds show No confident sound") and `site/support.html`. Per REQ-012 D.5 they change only after device verification; until then they are inaccurate for a build that contains REQ-012.
- Thresholds outside the original six rest on host evidence with synthetic sounds; tune them with real recordings during device QA (`DEFAULT_THRESHOLDS` in `eventTracker.ts`, then update the evaluation and the hit-rate floor in `clipEvaluation.test.ts`).
