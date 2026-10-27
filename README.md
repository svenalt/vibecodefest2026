# AUVIONA

**Making sound accessible to all.**

AUVIONA explores how everyday sounds can become accessible visual cues and living generative art. The iOS and Android app listens through the microphone while it is open and listening is on, and shows what it hears as readable text, an icon, a short session history and live generative artwork. Everything runs on the device with Google's YAMNet model. No audio is recorded, stored or uploaded, and there are no accounts, analytics or cloud services. The interactive web demo lets anyone explore its visual language.

**[Try the interactive web demo](https://sonora-vibecodefest-2026.swiftmule128.chatgpt.site)** · [Contribute](CONTRIBUTING.md) · [Open an issue](https://github.com/svenalt/vibecodefest2026/issues) · [Web demo source](web-demo/)

Originally created for **Vibe Code Fest Basel 2026**. Earlier working names were SoundCanvas and SONORA. They survive only in internal identifiers (the `soundcanvas-audio` native module, the `SoundCanvasAudio` pod, the npm package name) and in the historical requirement documents in `docs/requirements/`.

## What it does

- Turns recognized sounds into readable labels, icons and a sound-reactive **Universe** artwork.
- Uses adaptive animation, light/dark appearance, and a distraction-free immersive mode.
- Runs audio recognition on-device in the **iOS and Android app**; no accounts, analytics, audio recordings or audio uploads.
- Provides a **web demo** with illustrative City, Nature and Music soundscapes and optional microphone-reactive visualization. The browser demo **does not classify sounds**.

## Project status

AUVIONA 1.0 (REQ-001–010) was tested on iOS and Android devices and accepted by the maintainer on 2026-10-25. Later work (REQ-011 audio recovery, REQ-012 full YAMNet taxonomy) is covered by automated tests and still awaits device verification. AUVIONA is not yet available in the App Store or Google Play, and it is not a safety tool.

| Platform | Status |
| --- | --- |
| iOS | Native Swift pipeline and shared UI, tested on devices. Release steps: [release checklist](docs/release/auviona-release-checklist.md). |
| Android | Native Kotlin/YAMNet adapter and shared UI, tested on devices. Design and build notes: [Android adapter](docs/android-adapter.md). |
| Web | Public interactive visualization demo; its example labels are illustrative, not live detections. |

**Not a safety system.** It is for art and general sound awareness. Do **not** rely on AUVIONA for emergencies, alarms, safety-critical decisions, navigation, or medical decisions.

## How it fits together

```text
iOS:     mic -> AVAudioEngine -> 16 kHz mono -> YAMNet (MediaPipe, Swift) -+
Android: mic -> AudioRecord   -> 16 kHz mono -> YAMNet (MediaPipe, Kotlin) +-> shared TypeScript
                                                                           |   mapping, smoothing, cooldown
                                                                           +-> accessible UI + Skia visualization
```

- `src/core/`: platform-neutral logic. Adapter contract (`types.ts`), YAMNet labels and the one taxonomy (`yamnet/`), normalization, event tracker (smoothing, debounce, cooldown), session controller, listening-intent controller, and fake adapters for tests.
- `src/app/`: app state above the screens: persisted preferences, session provider, navigation, haptic cue gate, public links and release flags (`release.ts`).
- `src/native/`: the bridge to the native module and the only place that checks the platform.
- `src/ui/`, `src/viz/`, `src/hooks/`: the screen, the Skia scene and its state model, and React hooks.
- `modules/soundcanvas-audio/ios/` and `android/`: the Swift and Kotlin halves of one Expo module (capture, resampling, windowing, features, YAMNet).
- `assets/model/`: the pinned model and label map. See [docs/model.md](docs/model.md) for origin, checksums and licensing.
- `web-demo/`: the browser visualization demo (no sound classification).
- `docs/`: model provenance (`model.md`), Android adapter design, host evaluation, release checklist and App Store metadata draft, and the requirement documents (`requirements/`) that describe how the app evolved.

The Privacy Policy and Support pages are published at https://auviona.swarmz.cloud/privacy and https://auviona.swarmz.cloud/support and are linked from Settings > About. Support email: auviona.app@gmail.com.

## Prerequisites

- Node 20+ and npm.
- For iOS: a Mac with full Xcode (not just Command Line Tools), CocoaPods working, an Apple ID for signing, and an iPhone with Developer Mode on. Expo Go cannot run this app because it needs a custom native module.
- For Android: JDK 17+ (21 tested), the Android SDK command-line tools with licences accepted (Gradle installs platform 37, NDK 27.1 and CMake on the first build), and a physical device with USB debugging. Android Studio is optional.

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

This generates the gitignored `ios/` project (`expo prebuild`), installs pods including `MediaPipeTasksAudio` 1.0.0, builds a development build and installs it on the connected iPhone. The first build needs you to choose a signing team in Xcode (open `ios/AUVIONA.xcworkspace` once). The bundle identifier and Android package are `ch.auviona.app`.

On the phone: allow the microphone when the app asks on first launch (listening starts by itself), then play speech, music, applause, a barking dog, rain or a bell. In a development build (`__DEV__`), Settings > Developer displays the microphone format, the model class count and the measured latency; release builds do not show it.

If `npx expo run:ios` stops with CocoaPods errors, fix the CocoaPods install first; the Swift module cannot build without it.

## Run on Android

```sh
npx expo run:android --device
```

This generates the gitignored `android/` project, builds a development build with the Kotlin module and MediaPipe Tasks Audio 1.0.0, and installs it. Android asks for the microphone like iOS; if it is refused, the app explains why and links to the app's system settings. The development-build diagnostics show the device and analysis format and the model class count, and logcat (`adb logcat -s SoundCanvasAudio`) prints a start and stop summary with inference timings. Build details are in [docs/android-adapter.md](docs/android-adapter.md). Kotlin unit tests: `cd android && ./gradlew :soundcanvas-audio:testDebugUnitTest`.

MediaPipe's built-in usage-statistics upload is disabled on Android, so a release build makes no network requests of its own; development builds still load JavaScript and the model from Metro and keep MediaPipe's telemetry (see `modules/soundcanvas-audio/android/src/noTelemetry/README.md`).

## Permissions and privacy

- iOS and Android ask for the microphone the first time the app is opened (`NSMicrophoneUsageDescription` and `RECORD_AUDIO` in `app.json`). Once allowed, listening starts by itself whenever the app is opened or comes back to the foreground, **as long as listening is on**. If you deny it, the app does not ask again; it explains why and offers a shortcut to Settings.
- The user's listening choice is kept separate from the microphone's actual state. **Stop listening** turns the microphone off at once and is saved on the device, so it survives backgrounding, force quit and relaunch; only **Start listening** turns it back on. If the device cannot save that choice, listening still stops, and Settings says the choice could not be saved for the next launch and offers **Retry** (a launch can only honour what was actually stored). With listening off, the app never opens the microphone or asks for permission.
- Capture is foreground only and stops when you leave the app, unmount the screen, the audio is interrupted, or the audio pipeline fails. None of these changes the listening choice. After a failure the screen shows the problem instead of the last sound, and **Start listening** tries again once. While it is on, the screen says so in text.
- Audio stays in memory long enough to be analysed. Nothing is written to disk or sent anywhere. The history list is in memory and clears when you start a new session. The only thing stored is a small preferences entry (theme, listening on/off, haptic alerts). Motion follows the device's Reduce Motion setting.
- Logs and diagnostics contain technical state and model labels only.
- The web demo can request microphone permission to drive its visualization, but does not transmit audio or perform sound classification.

## Scripts

| Script | What it does |
| --- | --- |
| `npm test` | Unit tests for the shared logic, bridge and visualization model |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run verify-model` | Verifies `assets/model/*` against the pinned hashes |
| `npm run check-ios-audit` | Compiles the iOS model-output audit with `swiftc` and checks it against the shared top-K cases (no Xcode needed) |
| `npm run gen-labels` | Regenerates `src/core/yamnet/labels.ts` from the label CSV |
| `npm run ios` / `npm run android` | `expo run:ios` / `expo run:android` |

## Open source and contributions

**AUVIONA's original source code is released under the [MIT License](LICENSE).** Bundled third-party model files, label data and dependencies retain their respective upstream licenses; see [third-party notices](THIRD_PARTY_NOTICES.md) and [model documentation](docs/model.md).

Issues and small pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the quick workflow and areas to help, including Android support and accessibility testing.

The MIT license grants permissions for code, **not permission to claim endorsement or use the AUVIONA name or logo as branding for another product**. AUVIONA's project identity is maintained by the project owner.
