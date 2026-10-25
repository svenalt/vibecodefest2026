# AUVIONA

*Making sound accessible to all.*

An iOS app (Android planned) that listens through the microphone while it is open and listening is on, and shows what it hears as readable text, an icon, a short session history and live generative artwork. Everything runs on the device with Google's YAMNet model. No audio is recorded, stored or uploaded, and there are no accounts, analytics or cloud services.

**Not a safety system.** It is for art and general sound awareness. Do not rely on it for emergencies, alarms, safety-critical decisions, navigation or medical decisions.

Status: AUVIONA 1.0 release hardening (REQ-008). The code is unit-tested, but the app has **not yet been built or run on an iPhone**, and it is **not approved for App Store submission**. See `docs/release/auviona-release-checklist.md` for the release gates and what is blocked, and `docs/implementation-notes.md` for what is and is not verified. Android has a design (`docs/android-adapter.md`) but no native adapter, so there is no Android release.

Earlier working names were SoundCanvas and SONORA. They survive only in internal identifiers (the `soundcanvas-audio` native module, the `SoundCanvasAudio` pod, the npm package name) and in historical requirement documents.

## How it fits together

```text
iOS:     mic -> AVAudioEngine -> 16 kHz mono -> YAMNet (MediaPipe, Swift) -+
Android: mic -> AudioRecord   -> 16 kHz mono -> YAMNet (Kotlin, planned) --+-> shared TypeScript
                                                                           |   mapping, smoothing, cooldown
                                                                           +-> accessible UI + Skia visualization
```

- `src/core/`: platform-neutral logic. Adapter contract (`types.ts`), YAMNet labels and the one taxonomy (`yamnet/`), normalization, event tracker (smoothing, debounce, cooldown), session controller, listening-intent controller, and fake adapters for tests.
- `src/app/`: app state above the screens: persisted preferences, session provider, navigation, haptic cue gate, public links and release flags (`release.ts`).
- `src/native/`: the bridge to the native module and the only place that checks the platform.
- `src/ui/`, `src/viz/`, `src/hooks/`: the screen, the Skia scene and its state model, and React hooks.
- `modules/soundcanvas-audio/ios/`: the Swift Expo module (capture, resampling, windowing, features, YAMNet).
- `assets/model/`: the pinned model and label map. See `docs/model.md`.
- `site/`: drafts of the public Privacy Policy and Support pages (not published yet).
- `docs/release/`: release checklist and App Store metadata draft.

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

This generates the gitignored `ios/` project (`expo prebuild`), installs pods including `MediaPipeTasksAudio` 1.0.0, builds a development build and installs it on the connected iPhone. The first build needs you to choose a signing team in Xcode (open `ios/AUVIONA.xcworkspace` once). The bundle identifier in `app.json` is still the development value `app.soundcanvas.poc`; the permanent ID is a release decision recorded in `docs/release/auviona-release-checklist.md`.

On the phone: allow the microphone when the app asks on first launch (listening starts by itself), then play speech, music, applause, a barking dog, rain or a bell. The "Show diagnostics" button displays the microphone format, the model class count and the measured latency. Record those numbers in `docs/implementation-notes.md`.

If `npx expo run:ios` stops with CocoaPods errors, fix the CocoaPods install first; the Swift module cannot build without it.

## Android (planned)

The same app and shared code target Android. The Kotlin YAMNet adapter is not written yet; the design, dependency choice and permission handling are in `docs/android-adapter.md`. Until then the Android build shows a clear "adapter not implemented" message when it tries to start listening. `RECORD_AUDIO` is already declared in `app.json`.

## Permissions and privacy

- iOS asks for the microphone the first time the app is opened (`NSMicrophoneUsageDescription` in `app.json`). Once allowed, listening starts by itself whenever the app is opened or comes back to the foreground, **as long as listening is on**. If you deny it, the app does not ask again; it explains why and offers a shortcut to Settings.
- The user's listening choice is kept separate from the microphone's actual state. **Stop listening** is saved at once and survives backgrounding, force quit and relaunch; only **Start listening** turns it back on. With listening off, the app never opens the microphone or asks for permission.
- Capture is foreground only and stops when you leave the app, unmount the screen, or the audio is interrupted. None of these changes the listening choice. While it is on, the screen says so in text.
- Audio stays in memory long enough to be analysed. Nothing is written to disk or sent anywhere. The history list is in memory and clears when you start a new session. The only thing stored is a small preferences entry (theme, motion, listening on/off, haptic alerts).
- Logs and diagnostics contain technical state and model labels only.

## Scripts

| Script | What it does |
| --- | --- |
| `npm test` | Unit tests for the shared logic, bridge and visualization model |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run verify-model` | Verifies `assets/model/*` against the pinned hashes |
| `npm run gen-labels` | Regenerates `src/core/yamnet/labels.ts` from the label CSV |
| `npm run ios` / `npm run android` | `expo run:ios` / `expo run:android` |
