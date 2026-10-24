# REQ-001 — SoundCanvas: Expo foundation and live sound-awareness proof of concept

**Status:** Ready for implementation  
**Date:** 2026-10-24  
**Priority:** High  
**Target repository:** svenalt/vibecodefest2026  
**Working product name:** SoundCanvas (name not final)

## 1. Goal

Build the first installable iOS proof of concept for SoundCanvas: an accessible, privacy-conscious app that translates ambient sounds into clear labels and a live, artistic visual representation.

This is an experimental vertical slice, **not** yet a reliable assistive warning system. It must run on a physical **iPhone 13 Pro Max**, rather than only in a browser or simulator.

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
- Prepare iOS development builds (custom native modules are permitted). Android architecture should remain feasible, but an Android build is **not** required for this first REQ.
- Document reproducible local setup and iPhone deployment steps in the README, including permissions and build prerequisites.
- Do not introduce cloud infrastructure, accounts, analytics, or a database.

### REQ-001.2 — Microphone lifecycle and diagnostics

- Request microphone access explicitly. Explain why it is needed; handle denial and later revocation gracefully.
- Capture audio only while the user explicitly enables an **active listening session** in the foreground.
- Display microphone state, actual sample rate, channel count, and any initialization error in a development diagnostics view.
- Support Start and Stop. Stopping, navigating away, or unmounting must release active capture resources and processing.
- Use a single coordinated capture pipeline for classification and audio-feature analysis; avoid starting competing audio sessions.
- Begin with mono analysis for classification unless the framework requires otherwise. Do not make stereo or spatial localization a prerequisite.

### REQ-001.3 — Pretrained, on-device sound classification

- **iOS baseline:** Use Apple's built-in **SoundAnalysis** classifier through a small native Expo module (Swift), preferably SNClassifySoundRequest plus SNAudioStreamAnalyzer. No custom training or network inference.
- Define a TypeScript classifier abstraction so that an Android implementation (e.g., MediaPipe / YAMNet) can be added later without rewriting the UI.
- Expose timestamped results with category/label, model score, and processing state to React Native.
- Use a small, documented mapping from actual classifier labels to approximately **3–5 broad demo categories**, chosen after inspecting the classifier's supported labels (candidates: speech, music, dog bark, applause, rain, bell).
- Treat other/unknown/no confident detection as normal outcomes. Do not display a forced label for silence or unrelated sounds.
- Include configurable temporal smoothing/debouncing and event cooldown so that rapidly changing predictions do not produce an unusable stream of alerts.
- Never describe raw model scores as calibrated probabilities.

### REQ-001.4 — Accessible sound-awareness UI

- Provide a single main screen with:
  - a clear Start/Stop control and active-listening indicator;
  - the currently recognized event, with a text label and recognizable icon;
  - a short session-only list of recent recognized events and timestamps;
  - a way to distinguish "no confident event" from an error.
- Support readable text, sensible contrast, large touch targets, and iOS accessibility labels.
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

## 4. Architecture guidance

Suggested pipeline:

Microphone / AVAudioEngine → shared audio buffers → SoundAnalysis classification + lightweight acoustic features (RMS, frequency bands) → throttled event/feature updates → React Native awareness UI + visualization.

A native audio module is appropriate if it avoids extra JS↔native copies or competing capture sessions. Expo Audio can be evaluated for input/diagnostics, but must not introduce an independent recording session alongside SoundAnalysis. Keep the native boundary narrow and testable.

The iPhone 13 Pro Max supports stereo audio recording, but **direction of arrival, 360° radar, distance estimation, and multi-microphone raw access are not part of REQ-001**.

## 5. Out of scope

- Background monitoring when the screen is locked or the app is inactive.
- Guaranteed detection of alarms, sirens, or other safety-critical events.
- Direction finding, triangulation, or a 360° sound radar.
- Apple Watch notifications, haptics, push notifications, or user-trained custom sound classes.
- Speech transcription, audio recording/export, cloud AI, user accounts, monetization.
- Android implementation and App Store submission.
- Production-grade clinical/accessibility claims.

Create separate REQs for these only after validating the basic iOS experience.

## 6. Acceptance criteria

- [ ] Fresh checkout installs dependencies and the documented build process succeeds.
- [ ] A development build launches on an actual iPhone 13 Pro Max.
- [ ] Permission granted/denied paths are both usable and do not crash.
- [ ] Start activates a live microphone stream; Stop releases it. The UI always reflects the actual state.
- [ ] At least three distinct supported sound categories can be demonstrated using live examples; uncertain/unknown audio is displayed honestly.
- [ ] Recognition results include model labels, scores, and timestamps; event smoothing/cooldown avoids rapid UI flicker.
- [ ] The visualization visibly responds to live sound energy and at least two recognized categories, and can be reduced/disabled for accessibility.
- [ ] Sound labels/icons remain legible independently of the visualization.
- [ ] The demo can run with network connectivity disabled and without persisting or uploading raw audio.
- [ ] Basic automated tests cover label mapping, event smoothing, cooldown, and unknown-state handling.
- [ ] Type checking and relevant tests pass; implementation notes record any unresolved iPhone-specific limitations.

## 7. Implementation sequence

1. Bootstrap the Expo app and establish a successful physical-device development build.
2. Add permissions, capture lifecycle, diagnostics, and a minimal live-energy display.
3. Integrate native SoundAnalysis classification with a small set of broad classes.
4. Build the accessible event UI and session timeline.
5. Add the generative visual layer and verify performance and reduced-motion behavior.
6. Document findings and propose small follow-up REQs based on actual device testing.

**Important:** Implement in small, verifiable increments. Do not claim the full REQ is complete solely because the UI renders in a browser or simulator. Record actual device verification separately from automated tests.

## 8. Reference documentation

- Expo + Claude Code: https://docs.expo.dev/agents/claude/
- Expo custom native modules: https://docs.expo.dev/workflow/customizing/
- Apple SoundAnalysis: https://developer.apple.com/documentation/soundanalysis/
- Apple live classification sample: https://developer.apple.com/documentation/soundanalysis/classifying-live-audio-input-with-a-built-in-sound-classifier
- Expo Audio: https://docs.expo.dev/versions/latest/sdk/audio/
- MediaPipe Audio Classifier (potential Android follow-up): https://developers.google.com/edge/mediapipe/solutions/audio/audio_classifier
