# REQ-001 — SoundCanvas: cross-platform Expo architecture and live sound-awareness proof of concept

**Status:** Accepted by the owner on 2026-10-25 after device testing (delivered product/device scope). Remaining release work and new review findings: REQ-011.
**Date:** 2026-10-24  
**Priority:** High  
**Target repository:** svenalt/vibecodefest2026  
**Working product name:** SoundCanvas (name not final)

## 1. Goal

Design SoundCanvas from day one as a **cross-platform iOS + Android** application: an accessible, privacy-conscious experience translating ambient sounds into clear labels and live, artistic visuals. Implement and validate the first working vertical slice on **iOS (physical iPhone 13 Pro Max)**, without coupling the product architecture to iOS.

**Agreed platform strategy:** Use **Google YAMNet (on-device TFLite/LiteRT) as the common classifier on both iOS and Android**. Separate native Swift and Kotlin capture/inference adapters feed one shared TypeScript contract, label taxonomy, event history, and visualization. Use the same pinned model/label asset on both platforms where compatible. Implement and verify the iOS vertical slice first; native Android implementation and physical-device verification remain follow-up work, but Android integration boundaries are mandatory in this REQ.

This is an experimental proof of concept, **not** yet a reliable assistive warning system.

## 2. Product concept

SoundCanvas has two complementary layers:

1. **Sound awareness:** Explain what the phone is currently hearing using readable text, an icon, and an event history.
2. **Sound art:** Translate audio energy, frequency characteristics, and recognized sound categories into a generative visual composition.

The artistic layer should feel engaging, but must never be the only way an event is communicated. The accessibility layer takes precedence.

Potential future audiences include people who are deaf or hard of hearing, as well as users who enjoy interactive audio art. Usability and actual needs must later be validated with members of the target community.

## 3. MVP scope

### REQ-001.1 — Project bootstrap

- Initialize a modern **React Native + Expo + TypeScript** application in this repository, using one compatible, documented Expo SDK release and its lockfile.
- Keep the project source-controlled and independent of Swarmz hosting. The current repository contains a README only; do not assume a Swarmz web application can be used unchanged as a native app.
- Configure the Expo application as a **single React Native project targeting iOS and Android**. Keep shared UI, domain logic, visualization, classification normalization, and tests in platform-neutral TypeScript.
- Prepare an iOS development build with native audio capture and bundled YAMNet inference. Define the Android adapter/integration path now, but **Android native classifier implementation and Android device testing are not required for REQ-001**. Expo Go cannot validate custom native audio/model modules.
- Document reproducible setup, iOS deployment to an iPhone, the planned Android build path, and platform-specific permissions/build prerequisites in the README.
- Do not introduce cloud infrastructure, accounts, analytics, or a database.

### REQ-001.2 — Microphone lifecycle and diagnostics

- Request microphone access explicitly. Explain why it is needed; handle denial and later revocation gracefully.
- Capture audio only while the user explicitly enables an **active listening session** in the foreground.
- Display microphone state, actual sample rate, channel count, and any initialization error in a development diagnostics view.
- Support Start and Stop. Stopping, navigating away, or unmounting must release active capture resources and processing.
- Use a single coordinated capture pipeline for classification and audio-feature analysis; avoid starting competing audio sessions.
- Begin with mono analysis for classification unless the framework requires otherwise. Do not make stereo or spatial localization a prerequisite.

### REQ-001.3 — Cross-platform pretrained, on-device sound classification

- **Common model:** Bundle Google's pretrained **YAMNet TFLite audio classifier** on both platforms; prefer the fixed-window `YAMNet/classification` mobile variant. No cloud inference or custom training. Pin the source, version, checksum, class-label asset, and redistribution/license verification; use an identical model artifact on both platforms wherever supported.
- **Audio and model I/O:** Analyze **16 kHz mono, normalized float32** audio. For the fixed-window model use **15,600 samples / 0.975 s** per inference and verify the **521 output scores** against the bundled label order. Native capture may use a different hardware sample rate and must be resampled as needed. Maintain an overlapping ring buffer; aim for a new result about every **0.48–0.5 s** after the first window, without promising a hard latency guarantee.
- **iOS adapter (implemented first):** Use **MediaPipe Tasks Audio for iOS (Swift)** with YAMNet, or a documented compatible LiteRT/TFLite interpreter if required. Capture via a native microphone pipeline (e.g. AVAudioEngine); handle buffering, resampling, off-main-thread inference, errors, and cleanup behind a custom Expo native module.
- **Android adapter (specified now, implemented later):** Use **the same YAMNet model** with **MediaPipe Tasks Audio / LiteRT (Kotlin)**, native AudioRecord, equivalent buffering, microphone permission/lifecycle, and cleanup. No network fallback.
- Define a **platform-agnostic TypeScript interface** for start/stop, capture state, timestamped predictions, acoustic features, and errors. Neither shared UI nor category logic imports native Swift/Kotlin-specific code.
- Normalize predictions into `{ timestampMs, category, rawLabel, score, model: 'yamnet', platform }` using **one versioned YAMNet label-to-category mapping**. Verify tensor shape and class order on both platforms. Matching model weights do not guarantee matching real-world inference latency or recognition quality.
- Initially expose approximately **3–5 tested demo categories** (e.g. speech, music, dog bark, applause, rain, bell), drawn from supported YAMNet classes. Keep mapping extensible toward **10–15 relevant categories** after testing, rather than presenting all 521 raw classes as reliable.
- Silence, other/unknown, and no confident detection must remain valid outputs. Never force a category for unrelated sounds.
- Add configurable thresholds, temporal smoothing/debouncing, and event cooldown to prevent noisy alerts. **Raw model scores are not calibrated probabilities.**

### REQ-001.4 — Accessible sound-awareness UI

- Provide a single main screen with:
  - a clear Start/Stop control and active-listening indicator;
  - the currently recognized event, with a text label and recognizable icon;
  - a short session-only list of recent recognized events and timestamps;
  - a way to distinguish "no confident event" from an error.
- Support readable text, sensible contrast, large touch targets, and **iOS VoiceOver / Android TalkBack** accessibility semantics through React Native.
- Do not rely on color, sound, or animation alone to communicate important information.
- Include a Reduce Motion/static rendering option or respect the device's reduced-motion preference.
- The first release is explicitly **not** for safety-critical alarms, emergency response, navigation, or medical decisions.

### REQ-001.5 — Live artistic visualization

- Create one restrained but attractive sound-reactive visualization using React Native-compatible rendering (e.g., Skia); do not use a static pre-rendered animation as the entire experience.
- At minimum, audio energy controls the intensity/size of shapes and broad sound classes change the motif or color palette. Compute lightweight RMS/frequency features independently of YAMNet's ~0.5-second event cadence; throttle feature transfers to JS to keep the animation responsive.
- A simple first mapping is sufficient:
  - speech → flowing waves;
  - impact/applause → expanding pulses;
  - rain/environment → fine particles;
  - music → rhythmic, colored forms;
  - unknown → calm ambient motion.
- Make transitions smooth and cap update frequency so that classification and audio processing do not block the UI.
- The visualization is an artistic interpretation, **not a physical map of source direction**.

### REQ-001.6 — Privacy and resource management

- All recognition and feature extraction run **on device**.
- Do not transmit or persist raw audio. Keep the event timeline in memory for the active session only; clear it on restart unless explicitly changed in a future REQ.
- No microphone use before consent/start or after stop.
- Show a clear indication whenever recording/capture is active.
- Avoid excessive logging of user data. Diagnostic logs should contain technical states and non-sensitive model events only.

## 4. Cross-platform architecture guidance

**One product, two platform adapters, one shared behavior.** Keep the capture and model APIs native where justified; everything above that boundary is shared React Native/TypeScript.

```text
iOS:     Microphone → AVAudioEngine → 16 kHz mono → YAMNet (Swift) ─┐
                                                                     ├→ normalized event + audio-feature contracts
Android: Microphone → AudioRecord  → 16 kHz mono → YAMNet (Kotlin) ─┘                         ↓
                                                         shared mapping, smoothing, cooldown
                                                                          ↓
                                                        React Native accessible UI + sound art
```

- Define and test the **SoundInput / SoundClassifier adapter contract and normalized event schema before wiring iOS UI logic**. Include an Android mock/fake adapter in tests to demonstrate no iOS-only assumptions leak into common UI and both platforms use the same YAMNet labels.
- Each platform must use **one coordinated capture pipeline** to supply its sound classifier and lightweight acoustic features (e.g. RMS, frequency bands), without a competing second microphone session.
- Keep buffering, resampling, model initialization, and native resource release in the platform adapters; throttle feature/event delivery to JS so the visualization remains responsive.
- Ensure shared YAMNet label mapping, category-to-visual mappings, unknown/silence behavior, cooldown rules, accessibility and privacy are identical across platforms; preserve raw model labels for diagnostics.
- For **REQ-001**, implement the **iOS YAMNet adapter end-to-end** and document the corresponding Android YAMNet design, including identical model/label assets, audio input format, dependency choice, Expo native-module boundary, and permission handling. Android execution is a later milestone, **not** a change of architecture.

**Direction of arrival, 360° radar, distance estimation, and multi-microphone localization are out of scope on both platforms.**

## 5. Out of scope

- Background monitoring when the screen is locked or the app is inactive.
- Guaranteed detection of alarms, sirens, or other safety-critical events.
- Direction finding, triangulation, or a 360° sound radar.
- Apple Watch notifications, haptics, push notifications, or user-trained custom sound classes.
- Speech transcription, audio recording/export, cloud AI, user accounts, monetization.
- Android **native adapter implementation/device verification** and App Store / Google Play submission (the Android-facing architecture is **in scope**).
- Production-grade clinical/accessibility claims.

Use follow-up REQs for future functionality and for Android YAMNet implementation/device validation once the initial iOS vertical slice is stable. Do not defer the Android architecture decisions or shared interfaces.

## 6. Acceptance criteria

- [ ] Fresh checkout installs dependencies and the documented iOS build process succeeds.
- [ ] Expo project and shared TypeScript architecture explicitly target **both iOS and Android**; platform-specific imports and permissions are isolated.
- [ ] A shared, pinned YAMNet model and label map are selected with source, hash and license verification; the **15,600-sample mono 16 kHz input and 521-score output** are documented/validated, and the Android adapter design covers permissions, buffering, resampling, native bridge, and offline inference.
- [ ] A development build launches on an actual iPhone 13 Pro Max.
- [ ] Permission granted/denied paths are both usable and do not crash.
- [ ] Start activates a live microphone stream; Stop releases it. The UI always reflects the actual state.
- [ ] At least three distinct YAMNet-supported sound categories can be demonstrated using live iPhone examples; uncertain/unknown audio is displayed honestly.
- [ ] Live iPhone classification demonstrably runs **bundled YAMNet**, not a mock; results include model labels, scores, and timestamps; event smoothing/cooldown avoids rapid UI flicker.
- [ ] The visualization visibly responds to live sound energy and at least two recognized categories, and can be reduced/disabled for accessibility.
- [ ] Sound labels/icons remain legible independently of the visualization.
- [ ] The demo can run with network connectivity disabled and without persisting or uploading raw audio.
- [ ] Basic automated tests cover **shared YAMNet label mapping and output/label ordering**, normalized event schema, event smoothing, cooldown, and unknown-state handling using mock platform adapters.
- [ ] Type checking and relevant tests pass; implementation notes record iOS YAMNet runtime details, measured first-result/update latency, and any unresolved iPhone-specific limitations.

## 7. Implementation sequence

1. Bootstrap one **iOS/Android Expo app** and establish a successful iPhone development build.
2. Pin the shared YAMNet model/labels and implement audio/classifier interfaces, event schema, one taxonomy mapping, and mock adapters; document the Android YAMNet integration design.
3. Add iOS permission/capture lifecycle, diagnostics, and a minimal live-energy display behind the common interface.
4. Integrate **YAMNet TFLite on iOS** through MediaPipe Tasks Audio (or a compatible LiteRT interpreter), test expected tensor I/O, and measure latency on the physical iPhone.
5. Build shared accessible event UI, session timeline, and generative visualization; test cross-platform common logic with iOS and Android mock events.
6. Verify the physical iPhone demo and document follow-up work for the native Android YAMNet adapter and device testing.

**Important:** Implement in small, verifiable increments. Do not claim the REQ is complete solely because the UI renders in a browser or simulator. Record actual iPhone verification separately from automated tests; **do not claim Android audio classification is implemented until YAMNet runs on a physical Android device**.

## 8. Reference documentation

- Expo custom native modules: https://docs.expo.dev/workflow/customizing/
- Expo Audio: https://docs.expo.dev/versions/latest/sdk/audio/
- YAMNet model, labels, preprocessing: https://github.com/tensorflow/models/tree/master/research/audioset/yamnet
- Google YAMNet TFLite classification artifact: https://www.kaggle.com/models/google/yamnet/tfLite/classification-tflite/1
- Android audio classification/YAMNet example: https://github.com/tensorflow/tensorflow/blob/master/tensorflow/lite/g3doc/android/tutorials/audio_classification.md
- MediaPipe Audio Classifier iOS: https://ai.google.dev/edge/mediapipe/solutions/audio/audio_classifier/ios
- MediaPipe Audio Classifier Android: https://ai.google.dev/edge/mediapipe/solutions/audio/audio_classifier/android
