# AUVIONA 1.0 release checklist (REQ-008)

Last updated: 2026-10-25 (REQ-011 implementation). **Delivered product/device functionality (REQ-001–010) was accepted by the owner on 2026-10-25 after device testing.** REQ-011's fixes and configuration are implemented and covered by automated tests, but **not yet device-verified and not accepted**; this is not a record of store submission.

Versions at the time of the source audit: Node 24.21.0, Expo SDK 58.0.19, React Native 0.88.0, `@shopify/react-native-skia` 2.14.0, `MediaPipeTasksAudio` 1.0.0 (pod, pinned in the podspec). The audit was done without Xcode or CocoaPods; everything that needs a built archive is marked as open.

## P0 gate evidence

| Gate | Status | Evidence / what is missing |
| --- | --- | --- |
| Customer-visible branding is AUVIONA | **Accepted by owner** | `app.json` name/slug/scheme, Live header, all microphone notices, About, mic permission text. `expo prebuild` (scratch copy) produced `CFBundleDisplayName = AUVIONA`, scheme `auviona`, new `NSMicrophoneUsageDescription`. The icon and splash artwork contain no text. Internal names (`soundcanvas-audio`, `SoundCanvasAudio` pod, `SoundCanvasView`, npm package `soundcanvas`, bundle ID) stay as permitted. The published Privacy and Support pages are on https://auviona.swarmz.cloud/ (website source is not in this repository). |
| Final bundle ID selected and verified | **Configured (REQ-011); portal/signing not verified** | `ch.auviona.app` for iOS and Android in `app.json`. `expo prebuild --no-install --platform all` (scratch copy) resolves iOS `PRODUCT_BUNDLE_IDENTIFIER = "ch.auviona.app"` (Debug and Release) and Android `applicationId`/`namespace` `ch.auviona.app` with `MainActivity`/`MainApplication` under `ch/auviona/app`. Registration and signing under the owner's Apple team and Play account are unchecked. See [Bundle and package ID](#bundle-and-package-id). |
| `expo.version = 1.0.0`; build increments verified in the native bundle | **Partial** | `expo.version` is `1.0.0`; prebuild Info.plist has `CFBundleShortVersionString 1.0.0`, `CFBundleVersion 1` (placeholder; EAS sets the real one). Verifying the resolved build number in a signed IPA is **blocked** (no signed build). |
| Public HTTPS Privacy Policy and Support pages, approved, linked in app and App Store Connect | **URLs verified and wired (REQ-011); page content needs an owner update before submission** | Canonical URLs from the live site's footer routes and `<link rel="canonical">`: **https://auviona.swarmz.cloud/privacy** and **https://auviona.swarmz.cloud/support** (fetched 2026-10-25 over HTTPS, no authentication; each answers `307` to its trailing-slash path, then `200 text/html` with the intended Privacy/Support content). Set in `src/app/release.ts` and `app-store-metadata.md`; a test pins both. **Content issue:** the privacy page still says the app is unreleased and that "a final policy will be published with the first release", and lists a "motion" preference that REQ-010 removed; the support page says there is no public release. The owner must publish final wording (and any operator/contact details) on those same URLs before App Store submission. Tapping the links in Settings on a device is still to be checked. |
| Stop persists across background/foreground and restart; background releases mic; races and denial covered | **Accepted by owner** (REQ-008 scope); REQ-011 fixes automated only | `ListeningController` + persisted `listening` preference. REQ-011 adds in-flight stop tracking, a wait for native `stopping`, active-only foreground detection, and observable/retried preference writes with a Retry notice (see [REQ-011 behaviour](#req-011-failure-recovery-and-stop-persistence)). |
| Complete, truthful Live-only scope; no "experimental prototype" claim on a finished build | **Done (REQ-011)** | `PRE_RELEASE = false` after the owner's device acceptance, so About no longer calls the build an experimental prototype. The limitation statement stays in About, the support page and the store draft. |
| `typecheck`, `test`, `verify-model` pass | **Pass** (REQ-011, 2026-10-25) | `npm run typecheck` clean; `npm test` 208 tests in 18 files pass; `npm run verify-model` OK (both hashes). Kotlin `:soundcanvas-audio:testDebugUnitTest` 40 tests pass. |
| Signed production iOS build validated; TestFlight device testing passes | **Open: owner** | Needs Xcode and the owner's Apple team. Device tests were confirmed by the owner; no signed archive or upload has been recorded. |
| Trademark/domain/store collision review; owner authorizes submission | **Blocked: owner/legal** | Not started. No trademark or domain claims made anywhere. |

P1:

| Gate | Status | Evidence |
| --- | --- | --- |
| Theme survives relaunch; motion follows Reduce Motion; legacy `viz` ignored (REQ-010) | **Accepted by owner**; automated evidence below | `PreferencesStore` tests cover two successive restarts and legacy `viz` values (incl. `'off'`) being ignored without losing `listening: false`; still green with the REQ-011 write queue. |
| Haptic alerts off by default, rate-limited, stop/background-safe, physically tested | **Accepted by owner after device testing** | `HapticCueGate` tests. `HAPTIC_ALERTS_AVAILABLE = true` is kept for public builds. After a failure no results are accepted, so no haptic can follow it. |

## Bundle and package ID

- Configured (REQ-011): iOS bundle ID and Android package **`ch.auviona.app`**, replacing the never-uploaded PoC value `app.soundcanvas.poc`. Internal names stay (`soundcanvas-audio`, `SoundCanvasAudio` pod, Kotlin namespace `app.soundcanvas.audio`); the build does not need them changed.
- EAS association unchanged: `extra.eas.projectId` `3d58fca3-38a8-4b29-a0ea-15182cad4a1d`, `version` `1.0.0`, `appVersionSource: remote`, `autoIncrement: true` (pinned by `src/app/releaseConfig.test.ts`).
- **Not verified yet:** whether `ch.auviona.app` is free and registrable under the owner's Apple Developer team (App ID, provisioning profile) and Google Play account. No credentials were available, so no conflict is known and none is assumed. The first `eas build` / `eas credentials` run must confirm it; record the result below.
- **New identity, new install:** an app with `ch.auviona.app` is a different app from any installed `app.soundcanvas.poc` development build. It does not inherit that build's preferences (theme, listening Stop, haptics) or microphone permission: on first launch it behaves as a fresh install (Dark, listening on, haptics off, permission prompt). The old build stays installed until removed. Nothing migrates across the two identities, and none is promised.
- Changing the ID after the first App Store Connect upload creates a different app; treat it as permanent.

| Decision | Value |
| --- | --- |
| iOS bundle ID | `ch.auviona.app` (configured; portal registration unchecked) |
| Apple team ID | _pending owner_ |
| Android package | `ch.auviona.app` (configured; Play Console unchecked) |
| Fresh-install check on device | _pending (REQ-011 device regression)_ |

## Versions

- `expo.version` (`1.0.0`) becomes iOS `CFBundleShortVersionString` and Android `versionName`: the marketing version users see.
- iOS `CFBundleVersion` (build number) and Android `versionCode` are managed remotely by EAS: `eas.json` has `cli.appVersionSource: "remote"` and `build.production.autoIncrement: true`. Do **not** add `ios.buildNumber` or `android.versionCode` to `app.json`; they would conflict.
- The first EAS build initialises the remote counter (from local values or 1). Record the actual build number EAS assigns, and check it in the IPA's Info.plist.
- `package.json` `version` (`1.0.0`) is npm metadata only and is not used for the app.
- Settings > About shows `Version <expo.version>` (from `expo-constants`). It does not show the build number.

## Privacy and SDK audit

Source-level audit (2026-10-25). It still has to be confirmed against the final archive.

- **App code (TypeScript):** no `fetch`/XHR/WebSocket. Stores only the preferences JSON (`auviona.preferences`: theme, listening intent, haptic alerts) through AsyncStorage. No audio, labels or history are stored.
- **Native module (Swift, `modules/soundcanvas-audio/ios`):** AVAudioEngine capture, in-memory resampling, MediaPipe inference. No networking, file writes, `UserDefaults`, logging or required-reason APIs in the Swift sources. The audio session now also allows haptics during recording (for P1-B).
- **Model:** bundled `yamnet.tflite`, no runtime download (`expo-asset` resolves the embedded file in release builds).
- **Third-party pods and their privacy manifests found in `node_modules`:**

| Pod / package | Manifest | Declared required-reason APIs |
| --- | --- | --- |
| React Native core (React, cxxreact, timing, Folly, boost, glog) | yes | FileTimestamp C617.1, UserDefaults CA92.1, SystemBootTime 35F9.1; no tracking, no collected data |
| `@react-native-async-storage/async-storage` 2.2.0 | yes | FileTimestamp C617.1 |
| `expo-constants` | yes | UserDefaults CA92.1 |
| `expo-file-system` (via `expo`/`expo-asset`) | yes | FileTimestamp 0A2A.1, 3B52.1; DiskSpace E174.1, 85F4.1 |
| `expo-haptics`, `expo-asset`, `expo-modules-core`, `@shopify/react-native-skia` | none found | **to check** in the built archive |
| `MediaPipeTasksAudio` / `MediaPipeTasksCommon` 1.0.0 | unknown (binary pod) | **to check**: manifest, signature, and any network or telemetry symbols in the binary. **Raised priority (REQ-009):** the Android `tasks-core` 1.0.0 contains a remote usage-stats logger (`RemoteLoggingClient`, Google datatransport/CCT: task name, app package and version, latencies). Android disables it (`modules/soundcanvas-audio/android/src/noTelemetry/`); check whether the iOS binary has an equivalent before answering "Data Not Collected". |
| `expo-dev-client` / `expo-dev-launcher` / `expo-dev-menu` | — | `debugOnly`; must be absent from the Release archive (verify) |

- **App-level `PrivacyInfo.xcprivacy`** is produced by React Native's privacy-manifest aggregation during `pod install` (enabled by default in the generated Podfile). It has not been inspected yet. After `pod install`, inspect `ios/AUVIONA/PrivacyInfo.xcprivacy` and the archive; add `ios.privacyManifests` to `app.json` only for APIs the audit actually finds uncovered.
- **App Store Connect App Privacy (draft):** "Data Not Collected", **conditional** on the MediaPipe binary check above. If any SDK is found to transmit data, this answer changes.
- **Tooling advisories:** `npm audit --omit=dev` reports high-severity issues in `node-forge` and `zod`, both pulled in only by `@expo/cli` (build tooling, not in the app binary). Not fixed; `npm audit fix --force` would downgrade Expo.
- `npx expo-doctor` (1.21.5): 20/20 checks passed.

## Native build and TestFlight (archive/upload evidence outstanding)

Requirements to recheck at build time: Apple requires Xcode 26+ / iOS 26 SDK+ for new uploads (as of 2026-10-25; see https://developer.apple.com/news/upcoming-requirements/).

1. Owner confirms bundle ID and team, then updates `app.json`.
2. `eas build --platform ios --profile production` (or a local Xcode 26 archive). Record build ID, EAS build URL, Xcode/SDK versions, build number.
3. Inspect the IPA: `Info.plist` (display name, bundle ID, versions, mic text, no background audio mode), entitlements, architectures (arm64), deployment target 16.4, embedded `yamnet.tflite`, signing identity, `PrivacyInfo.xcprivacy` files, absence of dev-client frameworks.
4. Upload with the owner's authorization (`eas submit` or Transporter). Resolve and record every validation warning.
5. Internal TestFlight only. **No public App Review submission without the owner's explicit authorization.**

| Item | Value |
| --- | --- |
| Build ID / number | _not built_ |
| Xcode / iOS SDK | _n/a_ |
| Validation warnings | _n/a_ |

## REQ-011 failure recovery and Stop persistence

**Fatal audio failures (P0-A).** One contract on both platforms: a conversion, inference, model-contract, interruption or route failure invalidates the session at once (no further features, classifications or haptics), tears down off the audio queues, and reports `stopping` then a terminal `error` state carrying the message. Failures are scoped to their session epoch: a stop or newer start that runs first supersedes the queued teardown, and an old session's failure cannot stop a newer one. iOS: `AudioPipeline.fail(epoch, message)` (no wait on the processing/inference queue it may be called from). Android: `failOnce` closes only its own gate epoch, then the lifecycle-thread teardown. JS (`SoundSession`): the failure clears the current detection (the timeline stays as history), ignores late events of the ended session, never shows "Microphone ON" while a failure is pending, and an explicit Start clears the error and opens exactly one new session after the old one is released. No automatic retry: only Start, or a real return to the foreground (as for interruptions since REQ-008).

**Asynchronous Stop (P0-B).** `ListeningController` tracks in-flight starts *and* stops, waits for a native `stopping` state to end, and re-decides from the latest intent and foreground state once an operation settles after the inputs changed. Only an `active` AppState counts as foreground (also at launch); repeated foreground notifications are ignored.

**Stop persistence (P1-C).** Stop takes effect in memory and on the microphone at once, independent of storage. `PreferencesStore` writes the latest preferences in order (a queued older value is never written after a newer one), retries a failed write twice (0.4 s, 1.6 s), reports `saving`/`saved`/`failed`, reports a write with no answer after 3 s as failed without racing it, and retries again when the user taps **Retry** or the app goes to the background. Settings promises that Stop lasts across restarts only once it is saved; on failure it says "Listening is stopped, but this choice could not be saved for the next launch." with Retry.

**Restart strategy and its limit.** A cold launch trusts only storage: a stored Stop is authoritative; unreadable or partially written data recovers with listening off (explicit Start needed); a clean first install listens. AUVIONA does not require an explicit Start on every cold launch (REQ-008 behaviour is kept). **Limitation:** if every write fails and the app is then killed, the next launch reads the last value that *was* stored, which can be "listening on". The app says this at the time of failure instead of claiming permanence; it cannot do better without any working durable storage.

## Physical-device QA matrix (owner acceptance recorded)

The owner confirmed that all delivered functionality was tested on devices and accepted it on 2026-10-25, including REQ-010 and haptics. No per-device model/OS/build or scenario-by-scenario results were recorded, so none are listed here. **REQ-011 focused device regression: not yet run.** To record: (1) fault injection of an inference/conversion failure on iOS and Android (for example a debug-only throw in `classify`) shows the failure on Live, Settings and immersive Art + Sounds with no stale sound and no haptic, and Start recovers once; (2) Stop, background, foreground during a slow stop stays consistent; (3) Settings > About opens both links; (4) a fresh install of `ch.auviona.app` asks for the microphone and starts with defaults. The REQ-001–010 acceptance is not reopened.

## Remaining release follow-through (after REQ-011)

1. Register/confirm `ch.auviona.app` under the owner's Apple team (and Play account if Android ships); record team ID and any conflict.
2. Update the content of https://auviona.swarmz.cloud/privacy and /support for the released app (final policy, no "unreleased" wording, no motion preference) and any legally required operator/contact details. Legal review of the privacy policy.
3. iOS MediaPipe binary privacy/telemetry audit and App-level `PrivacyInfo.xcprivacy` check in the archive (above). Until then "Data Not Collected" stays conditional.
4. Signed archive, validation and TestFlight upload with build number evidence (above).
5. REQ-011 focused device regression (above).
6. AUVIONA trademark/name collision check (CH/EU/US, App Store) and domain availability: separate legal gate.
7. YAMNet weights licence confirmation (see `docs/model.md`) and provenance and rights for the icon/splash artwork.
8. App Store Connect metadata entry and submission: only with the owner's explicit authorization (REQ-011 does not authorize submission).

## Tests

New or changed in REQ-011: `src/core/soundSession.test.ts` (fatal failures: bare and terminal adapter errors, `stopping` while releasing, late results ignored, single failure, explicit retry, retry waits for teardown, late stop failure, error after Stop ignored, Stop clears the current detection), `src/core/listeningController.test.ts` (held stop then background/foreground, native `stopping` variant, native-initiated teardown, rapid transitions, Stop during pending resume, ending in background, cancelled permission prompt with held stop, Stop during start-up with held stop, failure without auto-restart and with explicit retry, persistent start failure, `isForegroundAppState`, Stop with unavailable storage), `src/app/preferences.test.ts` (save state: saving/saved, bounded retries then failed, Retry then restart, hung write, late answer, ordered updates ending in Stop, failed old write with newer Stop, fresh attempt after failure, unreadable data), `src/ui/status.test.ts` (failure beats a not-yet-stopped capture, persistence copy), `src/app/releaseConfig.test.ts` and `src/app/publicLinks.test.ts` (identifiers, EAS settings, PRE_RELEASE, URLs in app and metadata, wiring checks). Mutation check: with only `soundSession.ts` reverted to the pre-REQ-011 version, all 9 new session tests fail; with only `listeningController.ts` reverted, 5 of the 12 new controller tests fail (delayed stop, native-initiated teardown, rapid transitions, failure without auto-restart, persistent start failure), the others being covered as well by the session now waiting for a releasing stop. Kotlin: `SessionGateTest` adds the epoch-scoped close.

REQ-008 tests (kept): `src/core/listeningController.test.ts` (first install, stop across background and relaunch, no prompt while off, start/resume, stop during prompt, stop during start-up, iOS prompt inactive/active, rapid transitions, duplicate active, denial, revocation, interruption, start failure without retry loop, remount), `src/core/soundSession.test.ts` (start cancellation, permission-check failure), `src/app/preferences.test.ts` (fresh/stored/corrupt/invalid fields, two restarts, write order and failure, read error, hung read), `src/app/hapticCue.test.ts`, `src/app/publicLinks.test.ts`. React components are not rendered in tests (no RN test renderer in this repo); the Settings links and haptics toggle need the device checks above.
