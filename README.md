# AUVIONA

**Making sound accessible to all.**

AUVIONA explores how everyday sounds can become accessible visual cues and living generative art. The iOS prototype uses on-device sound recognition with Google's YAMNet; the interactive web demo lets anyone explore its visual language.

**[Try the interactive web demo](https://sonora-vibecodefest-2026.swiftmule128.chatgpt.site)** · [Contribute](CONTRIBUTING.md) · [Open an issue](https://github.com/svenalt/vibecodefest2026/issues)

Originally created for **Vibe Code Fest Basel 2026**. Earlier development names were SoundCanvas and SONORA; some internal module paths still use SoundCanvas.

## What it does

- Turns recognized sounds into readable labels, icons and a sound-reactive **Universe** artwork.
- Uses adaptive animation, light/dark appearance, and a distraction-free immersive mode.
- Runs audio recognition on-device in the **iOS prototype**; no accounts, analytics, audio recordings or audio uploads.
- Provides a **web demo** with illustrative City, Nature and Music soundscapes and optional microphone-reactive visualization. The browser demo **does not classify sounds**.

## Project status

This is an **experimental prototype**, not an App Store-ready release or a safety tool.

| Platform | Status |
| --- | --- |
| iOS | Native on-device YAMNet audio pipeline and shared UI implemented; device validation and release hardening are ongoing. |
| Android | Shared UI exists, but the native Kotlin microphone/YAMNet adapter is not implemented yet. **Not supported currently.** |
| Web | Public interactive visualization demo; its example labels are illustrative, not live detections. |

Do **not** rely on AUVIONA for emergencies, alarms, navigation, or medical decisions.

## Run locally

Prerequisites: Node.js 20+, npm; for iOS a Mac with Xcode, CocoaPods and an iPhone or simulator with suitable signing. Expo Go cannot load the custom native audio module.

```sh
npm install
npm run verify-model
npm run typecheck
npm test
npx expo run:ios --device
```

For the Android roadmap see [docs/android-adapter.md](docs/android-adapter.md). For model origin, checksums and licensing see [docs/model.md](docs/model.md). Other implementation notes are in [docs/implementation-notes.md](docs/implementation-notes.md).

## Privacy

In the native prototype, microphone audio is processed locally, in memory; it is not recorded, stored or uploaded. Listening is foreground-only. The web demo can request microphone permission to drive its visualization, but does not transmit audio or perform sound classification.

## Open source and contributions

**AUVIONA's original source code is released under the [MIT License](LICENSE).** Bundled third-party model files, label data and dependencies retain their respective upstream licenses; see [third-party notices](THIRD_PARTY_NOTICES.md) and [model documentation](docs/model.md).

Issues and small pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the quick workflow and areas to help, including Android support and accessibility testing.

The MIT license grants permissions for code, **not permission to claim endorsement or use the AUVIONA name or logo as branding for another product**. AUVIONA's project identity is maintained by the project owner.
