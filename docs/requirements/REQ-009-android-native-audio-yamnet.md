# REQ-009 — AUVIONA Android: native microphone, YAMNet and device parity

**Status:** Accepted by Sven on 2026-10-25 — delivered product/device scope; see [acceptance record](../release/device-acceptance-2026-10-25.md). Remaining release work and new review findings: REQ-011.
**Date:** 2026-10-25  
**Priority:** P0 for functional Android support; Google Play release is a separate gate  
**Difficulty:** High (8/10) — Kotlin/MediaPipe integration, real-time audio, lifecycle and device debugging  
**Recommended Claude Code:** **Opus 5.5, High effort** for the native Kotlin/MediaPipe adapter and concurrency; **Sonnet 5.5, High effort** for TypeScript tests, documentation and routine integration fixes. For a tight Pro quota, use Opus for the native slice, then Sonnet.  
**Target:** The same **AUVIONA** Live/Universe V3/Settings experience on Android, using the existing fully offline YAMNet model.  
**Depends on:** REQ-001 architecture, REQ-007 Live-only experience and REQ-008 AUVIONA release identity, persisted listening intent and preferences.  
**Product decision:** The public name is **AUVIONA** and the slogan is **“Making sound accessible to all.”** Do not reintroduce SONORA or SoundCanvas in customer-facing UI. Existing internal identifiers such as `SoundCanvasAudio` may remain.

## 1. Goal and verified baseline

Implement on-device Android microphone capture and YAMNet inference so that real classified sound events drive the existing categories, event timeline, haptics (if enabled by REQ-008) and Universe V3 visualizer. Preserve shared React Native behavior and the safety/privacy boundaries. This is **an Android functionality task, not a Google Play submission**.

Checked against the GitHub default branch while drafting:

- `modules/soundcanvas-audio/expo-module.config.json` currently declares only `["apple"]`; no Android Kotlin module or Gradle implementation exists.
- `src/native/createSoundInput.ts` returns a deliberate “Android YAMNet adapter is not implemented” error instead of a working native input. `NativeSoundInput` and all shared interfaces already support both platforms.
- `docs/android-adapter.md` is a planned design and explicitly records no Android build or device test.
- `app.json` already contains `android.permission.RECORD_AUDIO` and Android icons, but Expo/JS buildability does not establish working recognition.
- The pinned model and label CSV are in `assets/model/`; shared event mapping, smoothing, cooldown, UI and fake-adapter tests exist.
- The iOS reference pipeline expects 16 kHz mono float32, **15,600 samples per inference**, **7,800-sample hop**, **800-sample/50 ms acoustic features**, 521 output classes and the ten highest-scoring predictions.
- Sven reports **REQ-008 completed**; however, the default-branch Expo configuration may still contain pre-REQ-008 naming at implementation start. Inspect the current HEAD and any REQ-008 branch/commit before changing files. Do not overwrite newer AUVIONA work or reimplement REQ-008 silently; record unresolved prerequisite discrepancies.

**Out of scope:** New model, cloud inference, audio uploads/recording, background capture, Sound Walk/Gallery, new categories, major UI redesign, model training, Google Play publication or claims of safety-critical reliability.

## 2. P0-A — Native Kotlin Expo module and autolinking

1. Add a Kotlin implementation to the **existing** local Expo module under `modules/soundcanvas-audio/android/`, with proper Android Gradle/module scaffolding and the public module name `SoundCanvasAudio`. Keep the stable shared TypeScript contract.
2. Update `expo-module.config.json` to include `"android"` while retaining `"apple"`, and specify the **fully qualified Kotlin module class** in `android.modules`. Verify Expo autolinking in the generated native project.
3. Pin a compatible version of `com.google.mediapipe:tasks-audio` after checking installed Expo SDK, Android SDK, Gradle/AGP and the actual Java/Kotlin API. Avoid `latest.release`/unbounded dependency versions and incompatible generated Gradle edits.
4. Implement parity with `SoundCanvasAudioModule` / `NativeSoundInput`:
   - `getPermissionStatus()` → `"undetermined" | "granted" | "denied"`
   - `requestPermission()` → the same values
   - `start(modelPath: string): Promise<void>`
   - `stop(): Promise<void>`
   - `onState`, `onClassification`, `onFeatures`, `onError` with exactly the shapes declared in `src/core/types.ts` and `src/native/nativeSoundInput.ts`.
5. Update `src/native/createSoundInput.ts`: on Android **with** a registered native module, use `new NativeSoundInput('android', native, resolveModelPath)`; retain an honest unavailable fallback if the module is missing (for example Expo Go). Do not add Android-specific branches to the event tracker or visualizer.
6. `npx expo prebuild --platform android` and a **full Gradle debug build** must succeed. A Metro/JS bundle or prebuild alone is not acceptance; native changes need a rebuilt development client.

## 3. P0-B — One safe foreground audio pipeline

1. Implement `RECORD_AUDIO` runtime permission through supported Android/Expo APIs. Handle first-time grant, deny, permanently denied, Settings revocation, missing microphone and permission changes while active. Never indicate active capture if denied.
2. Use **one** `AudioRecord` for both acoustic features and classification. Prefer directly captured 16 kHz mono float32 where really supported; otherwise negotiate the actual hardware format (commonly 44.1/48 kHz, PCM16/float, mono/stereo) and convert/resample properly to 16 kHz mono float32. Never pretend a 48 kHz stream is 16 kHz. Handle short reads, invalid frame sizes, silence, buffer overruns and record errors.
3. Preserve the Swift reference's bounded pipeline:
   - Inference input: 15,600 samples; hop 7,800 samples (~487.5 ms), exactly one in-flight inference. Drop excess ready windows under load instead of blocking mic capture or building an unbounded backlog.
   - Features: 800 samples (~50 ms) giving RMS, peak and normalized low/mid/high energies consistent with `FeatureExtractor.swift`; values finite and in 0..1.
   - Emit `onState` with actual `hardwareSampleRate`/`hardwareChannelCount` and `analysisSampleRate = 16000`, `analysisChannelCount = 1` while listening.
4. Keep read, DSP and MediaPipe work off the UI/JS thread. Use a serialized start/stop state machine and epoch/generation IDs to invalidate stale asynchronous work. Ensure `stop()` is idempotent, resolves after mic/resource release, and prevents late classification/feature/haptic events.
5. Release capture immediately on Activity background/pause, module destroy, lost permission, microphone device change, relevant audio-focus loss or phone interruption. Use the supported **Android** Expo lifecycle hooks (`OnActivityEntersBackground`, destroy) and `AudioManager`/route callbacks as appropriate; do not use iOS-only lifecycle hooks on Android.
6. Clean up `AudioRecord`, classifier, audio-focus listeners and worker executors on stop, failure and destroy; avoid deadlocks and thread leaks. Surface errors via existing state/error events.
7. Respect the REQ-008 distinction between **persisted desired listening** and **actual microphone capture**. The native background stop must **not** persist Stop on the user's behalf; foreground resumption is controlled by the shared session layer and remains disabled after manual Stop.
8. No foreground service, background audio, internet fallback, disk recording or logging of raw waveform samples.

## 4. P0-C — Bundled YAMNet and exact cross-platform event semantics

1. Use exactly the pinned `assets/model/yamnet.tflite` and `yamnet_class_map.csv`; `npm run verify-model` must pass. No downloads or silently substituted weights.
2. Resolve Android's **actual local file** in development and packaged builds. `expo-asset` produces a filesystem path, whereas some MediaPipe model-asset setters expect an **APK asset-relative** path. Select and test an API that truly supports the supplied file/buffer (or safely copy packaged bytes to an app-private readable path). Do not assume `setModelAssetPath(absolutePath)` is valid.
3. Use MediaPipe Tasks Audio in **`AUDIO_CLIPS` mode** for the existing explicit windows unless an alternative is proven equivalent and documented. The pinned library's real API governs implementation—not unverified snippets.
4. Retrieve **all available YAMNet class results before filtering**: check runtime count is exactly **521**, verify each class index/label against the pinned mapping, then emit at most **10** entries sorted by score descending with stable tie ordering. Use `{index, label, score}`, finite scores and `classCount: 521`. Do not set `maxResults = 10` before the class-count audit and do not fabricate 521 if the API returned fewer classes. Avoid unintended thresholds/allowlists. Confirm whether MediaPipe supplies `categoryName` versus localized `displayName`, then map consistently with iOS.
5. Use monotonic **session audio time in milliseconds** for both `RawClassification.timestampMs` and `AudioFeatures.timestampMs`, never mixed with wall-clock timestamps. Record window-to-feature alignment and ensure no out-of-order or previous-session events leak after restart.
6. Reuse the existing shared normalization, taxonomy, silence/unknown, smoothing, cooldown, timeline, Universe V3, immersive view and opt-in confirmed-event haptics. No fake predictions or Android-only category mapping.
7. Model-load failure, class/label mismatch, permission problems and inference exceptions must be visible as honest errors rather than a “listening” success state.

## 5. P0-D — UI, accessibility, privacy and regression boundaries

1. Preserve the REQ-007 Live-only app, gear/settings navigation, Android Back behavior, Universe V3, reduced/off motion and immersive exit; keep text/icons primary and art decorative.
2. Preserve REQ-008 AUVIONA branding, privacy/support links, desired Stop preference, Dark/Light and motion preferences and off-by-default haptics if implemented. Manual Stop must survive background/foreground and force quit. If REQ-008 changes are not yet present on main, report that explicitly instead of silently reverting them.
3. Verify Android microphone permission/Settings deep link, Activity recreation, calls/audio focus, audio route changes and Bluetooth/headset transitions. Stop mic on background regardless of React UI state.
4. Measure performance, memory and thermal behavior on real midrange hardware. Optimize only after obtaining a correct baseline. Do not transfer raw audio to a server.
5. Retain AUVIONA's limitation statement: artistic/general sound awareness, **not** a reliable emergency alarm, medical device, navigation or safety system. No “Android supported” marketing before device validation.

## 6. Acceptance matrix: tests and evidence

### Automated gates

- [ ] `npm run typecheck`, `npm test` and `npm run verify-model` all pass; REQ-007/REQ-008 regressions remain covered.
- [ ] TypeScript bridge tests cover Android native-present/native-absent, permission grant/deny, correct event payloads, errors, start/stop, and the fallback behavior of Expo Go.
- [ ] Kotlin pure-DSP tests cover format/resampling, 15,600/7,800-sample windowing, 800-sample feature windows, RMS/peak/bands (silence, tones and noise), finite/range values, bounded queues and idempotent teardown.
- [ ] Deterministic tests cover all-521-class verification *before* top-10 selection, indexed label parity, score ordering, timestamp monotonicity, epoch cancellation and error propagation. Compare at least one fixed sound fixture with iOS/reference output using a stated tolerance; identical model weights do not guarantee byte-identical hardware results.
- [ ] Android prebuild/autolinking and **full native Gradle debug build** succeed. Record versions/logs; JS export alone is not sufficient.
- [ ] Existing iOS/Swift path and shared tests remain unchanged or regression-tested; no iOS breakage.

### Physical-device hard gates

Use **at least one real Android device**, not only an emulator. Sven's **Samsung Galaxy Tab A11** is a possible first test target; record its observed Android version and hardware. Prefer a second Android phone for broader coverage, but **do not claim phone validation if only a tablet was tested**.

- [ ] Clean install, microphone granted/denied/permanently denied/revoked; Settings recovery works and UI reflects reality.
- [ ] Recognize **at least three different real sound categories** from the existing taxonomy (for example speech, music, bell, bark, rain, applause). Validate actual labels/scores/timeline/visual response, not injected mock events.
- [ ] Silence and unknown do not produce a flood of false confident detections; artwork and sound text remain sensible.
- [ ] Diagnostics confirm model count **521**, pinned model hash, real hardware format and 16 kHz/mono analysis.
- [ ] A packaged release-like build classifies in airplane mode with **no Metro/internet**. No audio is uploaded or stored.
- [ ] Repeat Start/Stop 20 times, rapidly background/foreground 10 times, Stop while starting, revoke mic permission, deliberate Stop → background/foreground → remains stopped, and deliberate Stop → force quit/relaunch → remains stopped. Confirm no stale events, duplicate mic, stuck indicator or post-stop haptic.
- [ ] Test route change/phone interruption/audio-focus loss where feasible. Capture releases; any restart follows user intent and current permission.
- [ ] Run 15 minutes continuous listening; observe crashes, leaks, CPU load, battery/temperature and audio stability.
- [ ] Exercise Settings, Dark/Light, Reduce Motion/Off, immersive enter/exit, Android Back, larger text and TalkBack. Do not conceal permission/capture errors beneath artwork.
- [ ] Measure cold **Start → first result**, median/P95 update interval over at least 30 results, inference duration, approximate dropped-window rate and smoothness. Nominal hop is ~488 ms; record any device limitation and compare with real iPhone metrics if available. No invented numbers.

### Reporting

Update `docs/android-adapter.md` and `docs/implementation-notes.md` with tested commit, Android device/OS, model SHA, pinned dependency and build tool versions, exact commands, physical-device observations, permissions/lifecycle matrix, actual categories, offline test, first-result/update timings and open issues. Mark every gate **PASS / FAIL / BLOCKED / NOT RUN**. A simulated adapter, emulator-only run or `expo export --platform android` does **not** close the physical-device gate.

## 7. Suggested implementation sequence

1. **Baseline:** Read the current HEAD, REQ-008 work, `AudioPipeline.swift`, `YamnetClassifier.swift`, `nativeSoundInput.ts`, `modelAsset.ts`, `eventTracker.ts` and session providers; reconcile any divergence.
2. **Native scaffold:** Kotlin module, Gradle dependency, autolinking, permission/event surface, immediate Gradle compile smoke test.
3. **Capture and DSP:** One `AudioRecord`, correct rate/channel conversion, window/feature processing, bounded workers and Kotlin deterministic tests.
4. **Inference and JS:** Model path verified in dev/release, all 521 classes and label audit, event bridge, real UI integration.
5. **Lifecycle and performance:** Background/focus/route teardown, stop/start races, privacy/offline, measured performance.
6. **Handoff:** Full automated/native build, real-device validation, iOS regression tests and evidence documentation; commit focused code/tests/docs and list blocked gates. **No automatic APK/AAB publication or Play submission.**

## 8. Definition of done and release boundary

**Implemented:** Kotlin native adapter, TypeScript wiring, unit tests and a real Android debug build produce actual on-device YAMNet results with no known iOS regression.

**Android functional and device-validated:** All Section 6 physical-device hard gates passed with evidence and no unresolved P0 bugs in capture, lifecycle, permission, model loading or privacy.

**Google Play release-ready:** **Not granted by REQ-009.** Requires a separate release gate for the signed AAB, final package ID/Play Console, target API/policy, store listing, Data safety/privacy/support, broader QA and explicit owner approval. If no Android toolchain/device is available, label delivery “implemented but native/device validation BLOCKED,” not “Android supported.”

## Primary references

- Existing architecture: [docs/android-adapter.md](../android-adapter.md)
- Contracts: `src/core/types.ts`, `src/native/nativeSoundInput.ts`
- iOS parity sources: `modules/soundcanvas-audio/ios/AudioPipeline.swift`, `YamnetClassifier.swift`
- Google MediaPipe Audio Classifier for Android: https://ai.google.dev/edge/mediapipe/solutions/audio/audio_classifier/android
- Google AudioClassifier Android API: https://ai.google.dev/edge/api/mediapipe/java/com/google/mediapipe/tasks/audio/audioclassifier/AudioClassifier
- Expo module configuration: https://docs.expo.dev/modules/module-config/
- Expo Modules API and Android lifecycle hooks: https://docs.expo.dev/modules/module-api/
- Expo permissions: https://docs.expo.dev/guides/permissions/
