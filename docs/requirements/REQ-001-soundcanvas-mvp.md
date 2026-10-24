# REQ-001 — SoundCanvas: cross-platform Expo architecture and live sound-awareness proof of concept

**Status:** Ready for implementation  
**Date:** 2026-10-24  
**Priority:** High  
**Target repository:** svenalt/vibecodefest2026  
**Working product name:** SoundCanvas (name not final)

## 1. Goal

Design SoundCanvas from day one as a **cross-platform iOS + Android** application: an accessible, privacy-conscious experience translating ambient sounds into clear labels and live, artistic visuals. Implement and validate the first working vertical slice on **iOS (physical iPhone 13 Pro Max)**, without coupling the product architecture to iOS.

**Agreed platform strategy:** iOS uses Apple's built-in **SoundAnalysis** classifier; Android uses **Google YAMNet on device** (via a suitable TFLite/LiteRT or MediaPipe integration). Both feed the same platform-neutral application, sound-category mapping, event history, and visualization. The Android backend and physical-device verification are follow-up implementation work, but its contract and integration boundaries are mandatory in this REQ.

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
- Prepare an iOS development build with custom native modules as needed. Define an Android integration path now, but **Android native classifier implementation and Android device testing are not required for REQ-001**.
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

- **iOS adapter (implemented first):** Apple's built-in **SoundAnalysis** classifier through a native Expo module (Swift), preferably SNClassifySoundRequest plus SNAudioStreamAnalyzer. No custom training or network inference.
- **Android adapter (specified now, implemented later):** **Google YAMNet**, using an appropriate on-device TFLite/LiteRT or MediaPipe Audio Classifier integration. Plan for the model's mono **16 kHz** waveform input, buffering/resampling as needed, bundled model/labels, and Android microphone lifecycle. No network inference. Validate model asset format, platform compatibility, and redistribution/license requirements before integration.
- Define a **platform-agnostic TypeScript interface** for start/stop, capture state, timestamped model predictions, acoustic features, and errors. Keep native Swift and future Kotlin implementation behind platform-specific adapters. The UI must not import iOS-specific inference code.
- Normalize both models' distinct taxonomies into one shared domain event, e.g. `{ timestampMs, category, rawLabel, score, model, platform }`. Do **not** assume Apple's and YAMNet's label sets, scores, or recognition quality are identical.
- Use a small, documented **per-model label mapping** into approximately **3–5 shared demo categories** (candidates: speech, music, dog bark, applause, rain, bell), selected from genuinely supported model labels.
- Treat other/unknown/no confident detection as normal outcomes. Do not display a forced label for silence or unrelated sounds.
- Include configurable temporal smoothing/debouncing and event cooldown so that rapidly changing predictions do not produce an unusable stream of alerts.
- Never describe raw model scores as calibrated probabilities.

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
- At minimum, audio energy controls the intensity/size of shapes and broad sound classes change the motif or color palette.
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
iOS:     Microphone → AVAudioEngine → Apple SoundAnalysis adapter ─┐
                                                                    ├→ normalized event + audio-feature contracts
Android: Microphone → AudioRecord → 16 kHz mono → YAMNet adapter ──┘                         ↓
                                                         shared mapping, smoothing, cooldown
                                                                          ↓
                                                        React Native accessible UI + sound art
```

- Define and test the **SoundInput / SoundClassifier adapter contract and normalized event schema before wiring iOS UI logic**. Include an Android mock/fake adapter in tests to demonstrate no iOS-only assumptions leak into the common UI.
- Each platform must use **one coordinated capture pipeline** to supply its sound classifier and lightweight acoustic features (e.g. RMS, frequency bands), without a competing second microphone session.
- Keep buffering, resampling, model initialization, and native resource release in the platform adapters; throttle feature/event delivery to JS so the visualization remains responsive.
- Ensure shared category-to-visual mappings, unknown/silence behavior, cooldown rules, accessibility and privacy are identical across platforms; preserve raw model labels for diagnostics.
- For **REQ-001**, implement the iOS adapter end-to-end and record the concrete Android YAMNet integration design, including audio input format, dependency/model asset choice, Expo native-module boundary, and permission handling. Android execution is a later milestone, **not** a change of architecture.

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
- [ ] A documented Android YAMNet adapter design specifies model format/assets, expected mono 16 kHz input handling, native bridge, microphone permission and lifecycle, and offline inference.
- [ ] A development build launches on an actual iPhone 13 Pro Max.
- [ ] Permission granted/denied paths are both usable and do not crash.
- [ ] Start activates a live microphone stream; Stop releases it. The UI always reflects the actual state.
- [ ] At least three distinct supported sound categories can be demonstrated using live examples; uncertain/unknown audio is displayed honestly.
- [ ] Recognition results include model labels, scores, and timestamps; event smoothing/cooldown avoids rapid UI flicker.
- [ ] The visualization visibly responds to live sound energy and at least two recognized categories, and can be reduced/disabled for accessibility.
- [ ] Sound labels/icons remain legible independently of the visualization.
- [ ] The demo can run with network connectivity disabled and without persisting or uploading raw audio.
- [ ] Basic automated tests cover **per-model (Apple/YAMNet) label mapping**, normalized event schema, event smoothing, cooldown, and unknown-state handling using mock platform adapters.
- [ ] Type checking and relevant tests pass; implementation notes record any unresolved iPhone-specific limitations.

## 7. Implementation sequence

1. Bootstrap one **iOS/Android Expo app** and establish a successful iPhone development build.
2. Implement shared audio/classifier interfaces, event schema, per-model taxonomy mapping, and mock adapters; document the Android YAMNet integration design.
3. Add iOS permission/capture lifecycle, diagnostics, and a minimal live-energy display behind the common interface.
4. Integrate native Apple SoundAnalysis classification with a small set of broad demo classes.
5. Build shared accessible event UI, session timeline, and generative visualization; test cross-platform common logic with iOS and Android mock events.
6. Verify the physical iPhone demo and document follow-up work for the native Android YAMNet adapter and device testing.

**Important:** Implement in small, verifiable increments. Do not claim the REQ is complete solely because the UI renders in a browser or simulator. Record actual iPhone verification separately from automated tests; **do not claim Android audio classification is implemented until YAMNet runs on a physical Android device**.

## 8. Reference documentation

- Expo + Claude Code: https://docs.expo.dev/agents/claude/
- Expo custom native modules: https://docs.expo.dev/workflow/customizing/
- Apple SoundAnalysis: https://developer.apple.com/documentation/soundanalysis/
- Apple live classification sample: https://developer.apple.com/documentation/soundanalysis/classifying-live-audio-input-with-a-built-in-sound-classifier
- Expo Audio: https://docs.expo.dev/versions/latest/sdk/audio/
- Google YAMNet model and taxonomy: https://www.tensorflow.org/hub/tutorials/yamnet
- Google YAMNet on mobile (TFLite context): https://blog.tensorflow.org/2021/03/transfer-learning-for-audio-data-with-yamnet.html
- MediaPipe Audio Classifier (Android integration candidate): https://ai.google.dev/edge/mediapipe/solutions/audio/audio_classifier
