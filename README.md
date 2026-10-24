# SoundCanvas

An experimental iOS + Android app that listens through the microphone, only while you press Start, and shows what it hears as readable text, an icon, a short session history and a live generative visualization. Everything runs on the device with Google's YAMNet model. No audio is recorded, stored or uploaded, and there are no accounts, analytics or cloud services.

**Not a safety system.** Do not rely on it for alarms, emergencies, navigation or medical decisions.

Status: the iOS vertical slice is written and unit-tested, but has **not yet been built or run on an iPhone**. Android has an architecture and a design (`docs/android-adapter.md`) but no native implementation. See `docs/implementation-notes.md` for exactly what is and is not verified. The requirement is in `docs/requirements/REQ-001-soundcanvas-mvp.md`.

## How it fits together

```text
iOS:     mic -> AVAudioEngine -> 16 kHz mono -> YAMNet (MediaPipe, Swift) -+
Android: mic -> AudioRecord   -> 16 kHz mono -> YAMNet (Kotlin, planned) --+-> shared TypeScript
                                                                           |   mapping, smoothing, cooldown
                                                                           +-> accessible UI + Skia visualization
```

- `src/core/`: platform-neutral logic. Adapter contract (`types.ts`), YAMNet labels and the one taxonomy (`yamnet/`), normalization, event tracker (smoothing, debounce, cooldown), session controller, and fake adapters for tests.
- `src/native/`: the bridge to the native module and the only place that checks the platform.
- `src/ui/`, `src/viz/`, `src/hooks/`: the screen, the Skia scene and its state model, and React hooks.
- `modules/soundcanvas-audio/ios/`: the Swift Expo module (capture, resampling, windowing, features, YAMNet).
- `assets/model/`: the pinned model and label map. See `docs/model.md`.

## Prerequisites

- Node 20+ and npm.
- For iOS: a Mac with full Xcode (not just Command Line Tools), CocoaPods working, an Apple ID for signing, and an iPhone with Developer Mode on. Expo Go cannot run this app because it needs a custom native module.
- For Android (later): Android Studio with a recent SDK and a physical device.

## Setup

```sh
npm install
npm run verify-model   # checks the pinned model and labels against their SHA-256
npm run typecheck
npm test
```

## Run on an iPhone

```sh
npx expo run:ios --device
```

This generates the gitignored `ios/` project (`expo prebuild`), installs pods including `MediaPipeTasksAudio` 1.0.0, builds a development build and installs it on the connected iPhone. The first build needs you to choose a signing team in Xcode (open `ios/SoundCanvas.xcworkspace` once). The bundle identifier `app.soundcanvas.poc` in `app.json` may need changing to something unique for your Apple ID.

On the phone: tap Start listening, allow the microphone, then play speech, music, applause, a barking dog, rain or a bell. The "Show diagnostics" button displays the microphone format, the model class count and the measured latency. Record those numbers in `docs/implementation-notes.md`.

If `npx expo run:ios` stops with CocoaPods errors, fix the CocoaPods install first; the Swift module cannot build without it.

## Android (planned)

The same app and shared code target Android. The Kotlin YAMNet adapter is not written yet; the design, dependency choice and permission handling are in `docs/android-adapter.md`. Until then the Android build shows a clear "adapter not implemented" message when you press Start. `RECORD_AUDIO` is already declared in `app.json`.

## Permissions and privacy

- iOS asks for the microphone the first time you press Start (`NSMicrophoneUsageDescription` in `app.json`). If you deny it, the app explains why and offers a shortcut to Settings.
- Capture is foreground only and stops when you press Stop, leave the app, unmount the screen, or the audio is interrupted. While it is on, the screen says so in text.
- Audio stays in memory long enough to be analysed. Nothing is written to disk or sent anywhere. The history list is in memory and clears when you start a new session.
- Logs and diagnostics contain technical state and model labels only.

## Scripts

| Script | What it does |
| --- | --- |
| `npm test` | Unit tests for the shared logic, bridge and visualization model |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run verify-model` | Verifies `assets/model/*` against the pinned hashes |
| `npm run gen-labels` | Regenerates `src/core/yamnet/labels.ts` from the label CSV |
| `npm run ios` / `npm run android` | `expo run:ios` / `expo run:android` |
