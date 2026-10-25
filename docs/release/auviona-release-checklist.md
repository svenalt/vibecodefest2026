# AUVIONA 1.0 release checklist (REQ-008)

Last updated: 2026-10-25. **Not approved for App Store submission.** The code slices are done and tested headlessly. Every gate that needs Apple credentials, a real iPhone, a confirmed domain or contact, or legal review is **blocked**, not passed.

Environment for everything recorded here: macOS 12 (Darwin 21.6) with Command Line Tools only (**no Xcode, no working CocoaPods**), Node 24.21.0, Expo SDK 58.0.19, React Native 0.88.0, `@shopify/react-native-skia` 2.14.0, `MediaPipeTasksAudio` 1.0.0 (pod, pinned in the podspec).

## P0 gate evidence

| Gate | Status | Evidence / what is missing |
| --- | --- | --- |
| Customer-visible branding is AUVIONA | **Pass in source**, not yet seen on device | `app.json` name/slug/scheme, Live header, all microphone notices, About, mic permission text. `expo prebuild` (scratch copy) produced `CFBundleDisplayName = AUVIONA`, scheme `auviona`, new `NSMicrophoneUsageDescription`. The icon and splash artwork contain no text. Internal names (`soundcanvas-audio`, `SoundCanvasAudio` pod, `SoundCanvasView`, npm package `soundcanvas`, bundle ID) stay as permitted. No website source in this repo; drafts are in `site/`. |
| Final bundle ID selected and verified | **Blocked: owner** | See [Bundle and package ID](#bundle-and-package-id). `app.json` still has `app.soundcanvas.poc`. |
| `expo.version = 1.0.0`; build increments verified in the native bundle | **Partial** | `expo.version` is `1.0.0`; prebuild Info.plist has `CFBundleShortVersionString 1.0.0`, `CFBundleVersion 1` (placeholder; EAS sets the real one). Verifying the resolved build number in a signed IPA is **blocked** (no signed build). |
| Public HTTPS Privacy Policy and Support pages, approved, linked in app and App Store Connect | **Blocked: owner** | Content drafted in `site/privacy.html` and `site/support.html` with marked owner fields. Not published: no confirmed domain, operator or contact. `PRIVACY_POLICY_URL` / `SUPPORT_URL` in `src/app/release.ts` are `null`; the Settings links say "not published yet" until set. |
| Stop persists across background/foreground and restart; background releases mic; races and denial covered | **Pass in unit tests**, device QA not run | `ListeningController` + persisted `listening` preference. 16 controller tests + 4 new session tests (see [Tests](#tests)). Mutation-checked: disabling stop-cancels-start fails 3 tests; ignoring the intent fails 5. |
| Complete, truthful Live-only scope; no "experimental prototype" claim on a finished build | **Pass for TestFlight** | About keeps "This build of AUVIONA is an experimental prototype for testing" while `PRE_RELEASE = true`. Remove it (set `false`) only after device QA passes. Limitation statement present in About, support page and store draft. |
| `typecheck`, `test`, `verify-model` pass | **Pass** | `npm run typecheck` clean; `npm test` 137 tests in 14 files pass; `npm run verify-model` OK (both hashes). |
| Signed production iOS build validated; TestFlight device testing passes | **Blocked: environment + owner** | No Xcode on this Mac; no Apple team or credentials available to this session. Nothing has been built, archived, uploaded or run on an iPhone. |
| Trademark/domain/store collision review; owner authorizes submission | **Blocked: owner/legal** | Not started. No trademark or domain claims made anywhere. |

P1:

| Gate | Status | Evidence |
| --- | --- | --- |
| Theme and Motion survive relaunch with Reduce Motion fallback | **Pass in unit tests**, device restart test not run | `PreferencesStore` tests cover two successive restarts and `viz = null` staying null. |
| Haptic alerts off by default, rate-limited, stop/background-safe, physically tested | **Implemented, not physically tested** | `HapticCueGate` tests. The toggle is visible because `HAPTIC_ALERTS_AVAILABLE = true` (for TestFlight testing). **Set it to `false` before a public build unless haptics were confirmed on an iPhone.** |

## Bundle and package ID

- Current (never uploaded): iOS `app.soundcanvas.poc`, Android `app.soundcanvas.poc`.
- Candidate from REQ-008: `ch.auviona.app` for both.
- **Not finalized.** Before the first production upload the owner must confirm: (1) control of the `auviona.ch` domain or another reverse-DNS root they own, (2) the identifier is available when registering it in the Apple Developer portal under the signing team, (3) the same ID is acceptable for the later Android package. Then set `ios.bundleIdentifier` and `android.package` in `app.json` together and record the date and team ID here.
- Changing the ID after the first App Store Connect upload creates a different app; treat it as permanent.

| Decision | Value |
| --- | --- |
| Confirmed iOS bundle ID | _pending owner_ |
| Apple team ID | _pending owner_ |
| Android package | _pending owner (planned: same as iOS)_ |

## Versions

- `expo.version` (`1.0.0`) becomes iOS `CFBundleShortVersionString` and Android `versionName`: the marketing version users see.
- iOS `CFBundleVersion` (build number) and Android `versionCode` are managed remotely by EAS: `eas.json` has `cli.appVersionSource: "remote"` and `build.production.autoIncrement: true`. Do **not** add `ios.buildNumber` or `android.versionCode` to `app.json`; they would conflict.
- The first EAS build initialises the remote counter (from local values or 1). Record the actual build number EAS assigns, and check it in the IPA's Info.plist.
- `package.json` `version` (`1.0.0`) is npm metadata only and is not used for the app.
- Settings > About shows `Version <expo.version>` (from `expo-constants`). It does not show the build number.

## Privacy and SDK audit

Source-level audit (2026-10-25). It still has to be confirmed against the final archive.

- **App code (TypeScript):** no `fetch`/XHR/WebSocket. Stores only the preferences JSON (`auviona.preferences`: theme, motion, listening intent, haptic alerts) through AsyncStorage. No audio, labels or history are stored.
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
| `MediaPipeTasksAudio` / `MediaPipeTasksCommon` 1.0.0 | unknown (binary pod) | **to check**: manifest, signature, and any network or telemetry symbols in the binary |
| `expo-dev-client` / `expo-dev-launcher` / `expo-dev-menu` | — | `debugOnly`; must be absent from the Release archive (verify) |

- **App-level `PrivacyInfo.xcprivacy`** is produced by React Native's privacy-manifest aggregation during `pod install` (enabled by default in the generated Podfile). It was not generated here because CocoaPods does not run on this Mac. After `pod install`, inspect `ios/AUVIONA/PrivacyInfo.xcprivacy` and the archive; add `ios.privacyManifests` to `app.json` only for APIs the audit actually finds uncovered.
- **App Store Connect App Privacy (draft):** "Data Not Collected", **conditional** on the MediaPipe binary check above. If any SDK is found to transmit data, this answer changes.
- **Tooling advisories:** `npm audit --omit=dev` reports high-severity issues in `node-forge` and `zod`, both pulled in only by `@expo/cli` (build tooling, not in the app binary). Not fixed; `npm audit fix --force` would downgrade Expo.
- `npx expo-doctor` (1.21.5): 20/20 checks passed.

## Native build and TestFlight (blocked)

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

## Physical-device QA matrix (not run)

Record date, device, iOS version, result and screenshot/log path for each row.

| Scenario | iPhone 13 Pro Max | Second iPhone/iOS |
| --- | --- | --- |
| First install: permission prompt, grant → listens | not run | not run |
| First install: deny → blocked notice, no re-prompt on foreground | not run | not run |
| Revoke in iOS Settings while backgrounded → returns blocked; re-allow → resumes | not run | not run |
| Listening → Stop → background → foreground: **stays stopped**, no mic indicator | not run | not run |
| Stop → force quit → relaunch: **stays stopped**, no prompt | not run | not run |
| Start → background (mic indicator goes off) → foreground resumes | not run | not run |
| Stop pressed during "Microphone starting…" | not run | not run |
| Rapid app switching ×10: one session, no stale "Microphone ON" | not run | not run |
| Speech, music, bell/applause/dog/rain: correct labels; silence → Quiet; other → No confident sound | not run | not run |
| Airplane mode: everything works | not run | not run |
| Dark/Light and Animated/Reduced/Off each survive two relaunches | not run | not run |
| Reduce Motion on with motion never chosen → Reduced; turning it off follows the device | not run | not run |
| Immersive enter/exit, Pure Art / Art + Sounds | not run | not run |
| Largest Dynamic Type; VoiceOver through Live, Settings, links, haptics switch | not run | not run |
| Privacy and Support links open in Safari and load (fresh session, cellular) | blocked (pages not published) | blocked |
| Haptic alerts: off by default; on → one tap per new confirmed event while listening; none when stopped/background; no spam | not run | not run |
| 10–15 min continuous listening: no crash, smooth artwork, battery/thermal sane | not run | not run |

## Owner decisions needed

1. Bundle/package ID and Apple team (above).
2. Domain or interim host for the two pages, then publish `site/` and set the two URLs in `src/app/release.ts` and App Store Connect.
3. Operator name, support email, and any legally required address or registration details for the privacy and support pages (the drafts mark each field). Legal review of the privacy policy.
4. AUVIONA trademark/name collision check (CH/EU/US, App Store) and domain availability: separate legal gate.
5. YAMNet weights licence confirmation (see `docs/model.md`) and provenance and rights for the icon/splash artwork.
6. Apple Developer account access for the signed build and TestFlight upload.
7. After device QA: set `PRE_RELEASE = false`, and decide `HAPTIC_ALERTS_AVAILABLE` from the haptics test result.

## Tests

New or changed in REQ-008: `src/core/listeningController.test.ts` (first install, stop across background and relaunch, no prompt while off, start/resume, stop during prompt, stop during start-up, iOS prompt inactive/active, rapid transitions, duplicate active, denial, revocation, interruption, start failure without retry loop, remount), `src/core/soundSession.test.ts` (start cancellation, permission-check failure), `src/app/preferences.test.ts` (fresh/stored/corrupt/invalid fields, two restarts, write order and failure, read error, hung read), `src/app/hapticCue.test.ts`, `src/app/publicLinks.test.ts`. React components are not rendered in tests (no RN test renderer in this repo); the Settings links and haptics toggle need the device checks above.
