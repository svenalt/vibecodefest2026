# REQ-008 — AUVIONA V1.0: release identity, privacy, session preferences and App Store readiness

**Status:** Ready for implementation — **NOT approved for App Store submission**
**Date:** 2026-10-25
**Priority:** P0 release blockers + P1 product polish
**Difficulty:** Medium–High (7/10); straightforward shared-UI changes, but native build/signing and App Store compliance require real-device evidence
**Recommended Claude Code:** **Sonnet 5.5, High effort** for implementation and test coverage; use **Opus 5.5, High** only if native/SDK/manifest or lifecycle races prove complex.
**Target:** iOS V1.0 first (physical iPhone 13 Pro Max + TestFlight); maintain shared React Native behavior and Android-ready configuration, **do not claim Android release support** without its native YAMNet adapter and device validation.
**Depends on:** REQ-001 through REQ-007 and the current Live-only/Settings/immersive architecture.
**Product decision:** The final user-facing name is **AUVIONA** (replaces both SONORA and SoundCanvas). Keep the established visual direction and sound-art experience. The website slogan remains **“Making sound accessible to all.”** Do not revert to SONORA.

## 1. Goal and verified baseline

Deliver a genuinely usable, honest, appropriately bounded **AUVIONA 1.0** ready for a signed iOS production/TestFlight build and a documented store-submission decision. This is a **release-hardening requirement**, not a new feature sprint.

Observed on `main` while preparing this REQ:

- `app.json`: `expo.name = "SoundCanvas"`, `slug/scheme = "soundcanvas"`, `version = "0.1.0"`, `ios.bundleIdentifier = "app.soundcanvas.poc"`, matching Android package, and microphone-permission copy names SoundCanvas.
- `SettingsScreen.tsx`: SONORA appears in permission and About copy; About says “experimental prototype.” There is no public Privacy Policy or Support link.
- `useSoundSession.ts`: `session.start()` runs on mount and every `AppState === 'active'`, even after the user pressed **Stop listening**. Background transitions intentionally stop the actual microphone.
- `theme.ts` and `SessionProvider.tsx`: theme and visualization preference are in React memory only.
- No haptic feedback is wired into the reviewed confirmed-event path.
- `eas.json` already uses `appVersionSource: "remote"` and `production.autoIncrement: true`. Preserve this instead of adding conflicting local build-number increments.
- The last implementation notes document only headless artwork tests, **not** signed production builds, TestFlight, or physical-device release QA. Do not reinterpret existing typecheck/unit-test success as those missing checks.

## 2. P0-A — Consistent AUVIONA release identity

1. Set the **user-facing** app name to `AUVIONA`, `expo.slug` to `auviona`, and `scheme` to `auviona` where safe. Update visible Live header, Settings/permission/About, accessibility labels, app descriptions, marketing/store metadata templates, launcher/icon artwork containing old text, and current website branding where this repository owns the source. Keep the existing artwork, navigation and slogan.
2. Replace `NSMicrophoneUsageDescription` with accurate **AUVIONA** copy that explains temporary on-device microphone analysis and foreground use. Audit equivalent Android permission messaging and all customer-facing strings for **SoundCanvas** / **SONORA**. No false promise that audio never enters RAM; distinguish temporary capture from saved recordings.
3. **Make a permanent bundle/package ID decision before the first production upload.** Candidate: `ch.auviona.app`, subject to owner/brand/domain ownership, Apple App Store Connect availability and signing-team verification. Record the **confirmed** identifier and decision in `docs/release/auviona-release-checklist.md`; set `ios.bundleIdentifier` and the Android package consistently once confirmed. **Do not silently finalize the candidate if it cannot be verified.** Changing a published bundle/package ID is not an ordinary rename.
4. Target marketing version `1.0.0` in Expo config. Document `CFBundleShortVersionString` versus build number and `versionName` versus `versionCode`; retain EAS remote build-version management and automatic increments. Verify the resolved native build values in the signed artifact. Do not assume `package.json` version and Expo version are identical.
5. Existing **internal** identifiers, package/module paths, Swift pod names and import names (e.g. `soundcanvas-audio`) may remain if renaming would risk the native pipeline. A textual project-wide blind replace is forbidden. Update active README/setup/release documentation while preserving historical REQ filenames and audit notes as history.
6. **Brand/legal release gate:** AUVIONA is Sven's decided product name, but CH/EU/US collision, domain and relevant store-listing checks are not final legal clearance. Record verification/approval as a **separate release gate**; do not claim trademark ownership or buy domains as part of this REQ.

## 3. P0-B — Public privacy and support pages, linked from Settings

1. Publish two working, public HTTPS pages for **AUVIONA Privacy Policy** and **AUVIONA Support** on the AUVIONA website or a stable approved interim domain. Do not hardcode a domain that is not controlled, or use empty/placeholder pages. The public pages must load without an account, from App Review and on a phone.
2. Privacy Policy content must accurately reflect **inspected actual app/SDK behavior**: microphone permission and capture, local YAMNet inference, any event/diagnostic data, in-memory/session retention, whether audio/files leave the device, analytics/crash/SDK network behavior, data sharing, user control/permission revocation, retention/deletion, and a real operator/contact. Review the actual native binary and integrated SDKs before asserting “no data collected” in App Store Connect. Obtain owner review of legal/operator details.
3. Support page must contain a functioning contact method (approved email/contact form and other legally required information), support scope, app version, and simple microphone-permission/troubleshooting guidance. No invented personal address.
4. Add distinct accessible **Privacy Policy** and **Support** links under Settings > About; use safe external linking with a non-crashing fallback if URL opening fails. Keep links testable in Dark/Light, with screen reader labels and touch targets >=44 pt.
5. Populate/document the corresponding **App Store Connect Privacy Policy URL** and **Support URL**, and truthful App Privacy answers. A link inside Settings alone is not sufficient. Ensure website and app copies agree; verify both URLs with a fresh/unauthenticated browser session and an actual device.

## 4. P0-C — Manual Stop must survive backgrounding and app relaunch

Preserve the existing design: capture is **foreground-only**. A background or interruption should stop the physical microphone but must **not** overwrite the user's desired listening preference.

1. Model **desired listening** separately from **actual capture state**. On an existing/first eligible installation, preserve current automatic foreground start behavior if permission allows; once the user explicitly presses **Stop listening**, persist desired listening = **off** immediately. Only an explicit **Start listening** changes it back to **on**.
2. On app background/inactive/unmount: release capture and processing, without changing desired preference. On foreground/launch: resume automatically **only if desired = on**, permission allows and no start is already in flight. If desired = off, never reopen the microphone or prompt for permission merely on foregrounding.
3. Handle async races: manual Stop during pending permission/start; rapid foreground/background transitions; duplicate `active` events; permission denied/revoked; interruptions; component remount; storage hydration. Prevent an in-flight start from undoing a stop. Keep exactly one capture session and truthful UI state. Persist the user's intent without storing audio or event history.
4. Have a documented deterministic failure fallback for unreadable/corrupt preference storage; **do not accidentally auto-start while recovering from a previously persisted Stop**. The existing permission and Start/Stop UI remains usable.
5. Update About/help copy to explain auto-resume **only when listening is enabled**.

## 5. P0-D — Honest V1.0 product scope, safety and completeness

1. Replace the phrase **“experimental prototype”** in customer-facing About/store copy only **after** a working release candidate has passed device QA. Otherwise remain on **TestFlight**; changing text alone does not make a prototype release-ready.
2. Approved V1.0 surface: Live sound labels/icons, real confirmed YAMNet event timeline, responsive Universe V3, immersive art, Settings (Start/Stop, appearance, motion, accessibility/privacy/support). No Sound Walk or Gallery placeholders, account, cloud, audio recording/export or unimplemented claims.
3. Keep an unmistakable, accurate limitation statement: **artistic and general sound awareness; not reliable for emergencies, alarms, safety-critical decisions, navigation or medical decisions.** Do not claim clinically validated or guaranteed recognition, sound direction/distance, or reliable assistance for hearing-impaired people without actual user and recognition validation. Accessible labels/icons and mic status must remain truthful.
4. Verify errors, permission denial, offline operation and unknown/silence. Do not disguise failed microphone/classifier initialization as successful listening. Review public website/app-store wording for the same bounded claims.
5. Prepare truthful App Store description, screenshots, support contact, review notes (how to test real sounds and permission), age rating, rights/license checks for model/art/assets and icon. No placeholder metadata.

## 6. P0-E — Signed production/TestFlight build and SDK/privacy audit

1. Run dependency and toolchain audit for the installed Expo SDK, React Native, Skia, custom Swift/MediaPipe native module and linked third-party SDKs. Check Expo doctor/compatible versions and pin any needed fixes. As of this REQ (2026-10-25), **Apple requires Xcode 26+ with iOS 26 SDK+ for new App Store Connect uploads**; verify again at build/submission time.
2. Inspect the **generated native app** and final archive/IPA, including `Info.plist`, microphone text, display name, bundle ID, build/version numbers, entitlements, architectures, deployment target, asset inclusion, signing identity and privacy manifests. Assess app and SDK `PrivacyInfo.xcprivacy`, covered required-reason APIs, third-party manifest/signature requirements, and App Store Connect privacy answers. Add only correct declarations supported by an actual audit; never invent API reasons.
3. Produce a **signed iOS release/production build** with a valid Apple Developer team and distribution credentials. Validate archive/upload with Apple's tools/App Store Connect; record exact build ID, build environment, tool/SDK versions, validation warnings and their resolutions.
4. With Sven's credentials/authorization, upload to **TestFlight** and test the distributed build, not just an Expo dev client. **Do not publish or submit for public App Review automatically.** If credentials/team/identifier or legal/privacy contact information are missing, record a blocked release gate and ask the owner—do not mark it as passed.
5. Minimum physical-device QA matrix (iPhone 13 Pro Max, plus at least one additional supported iPhone/iOS version when available):
   - first install, permission granted/denied/revoked, relaunch;
   - fresh foreground start, deliberate Stop -> background -> foreground -> **stays stopped**, force quit -> relaunch -> **stays stopped**, explicit Start -> background -> foreground -> resumes only if enabled;
   - repeated rapid lifecycle changes with no double session, stale on-screen “listening” or unwanted mic access;
   - real speech/music/bell or other supported sounds, silence/unknown, category confidence/error behavior, airplane mode;
   - Dark/Light, animated/reduced/off, immersive enter/exit, large text and VoiceOver;
   - privacy/support URLs open and can be used; crash-free 10–15 minute listening session, frame smoothness, battery/thermal sanity.
6. Document **observed** results with date, device/iOS, actual screenshots/logs and unresolved issues in the release checklist. Typecheck and unit tests must pass, but are **not** a substitute for native signed-build/TestFlight validation.

## 7. P1-A — Persist presentation preferences

1. Persist app-wide **Dark/Light** choice and **Animated / Reduced / Off** visualization choice across app kills/restarts, using one minimal local storage facility with tested hydration and corruption fallback. Default theme remains Dark for new users unless an explicit change is made.
2. Preserve semantics of `vizChoice = null`: **follow the device's Reduce Motion setting** until the user explicitly selects a mode. Do not persist the computed effective value instead of the user's actual choice. Device setting changes should still take effect whenever choice is `null`.
3. Avoid a visible wrong-theme flash / animation burst before hydration where practicable. No server, account, storage of recordings or excessive new dependencies. Verify two successive restarts on device.

## 8. P1-B — Optional, opt-in haptic event cue

1. Add an accessible **Haptic alerts** Settings toggle, **Off by default**, with a short explanation that vibrations indicate **confirmed** supported sound events only; persist it locally.
2. Trigger a brief, modest device haptic on a **new confirmed category event** after the existing smoothing/debounce/cooldown—not on every ~0.5 s classifier output, silence/unknown, diagnostics, predicted-only states or art animation. Respect Stop, background, permissions and system/device haptic availability. Rate-limit repeated events and prevent vibratory spam.
3. Keep text/icons as the primary information channel; no guarantee that a user will perceive the vibration and no emergency-alarm claims. Haptics may be skipped on unsupported platforms with honest UI/handling. Use an Expo-compatible API/dependency and test on actual iPhone hardware.
4. If P1 haptics cannot be validated, ship V1.0 **without the feature or assistive-haptic marketing claim**; do not ship an untested enabled toggle.

## 9. Acceptance checklist / release gate

### P0 must all pass before *public* App Store submission

- [ ] All customer-visible branding is **AUVIONA**, including launcher identity, microphone permission, About, website and store draft. No misleading SONORA/SoundCanvas references in active public UI; internal historical names are explicitly allowed.
- [ ] Final iOS bundle ID selected, ownership/availability/signing checked and recorded; Android package plan recorded. `expo.version = 1.0.0`, production build increment strategy verified against actual native bundle.
- [ ] Functional HTTPS Privacy Policy and Support pages exist, legal contact/operator details approved, both accessible from Settings and linked in App Store Connect metadata; privacy disclosures match audited data paths.
- [ ] Stop persists across background/foreground **and process restart**; background always releases microphone; Start restores the intended auto-resume behavior; races/denial covered.
- [ ] The release app is complete within its narrow Live-only scope; safe, truthful About, no “experimental prototype” claim presented as a finished build, no missing promised features or broken links.
- [ ] `npm run typecheck`, `npm test` and `npm run verify-model` pass. Add focused regression tests for session intent, storage, hydration, app state races, themes, privacy/support navigation, and haptic cooldown if shipped.
- [ ] A signed production iOS build is validated against then-current SDK and privacy-manifest rules; errors/warnings are resolved and **real TestFlight device testing passes** with evidence.
- [ ] AUVIONA trademark/domain/store collision risk has documented owner/legal review; Apple developer account and metadata ready; **Sven explicitly authorizes** actual public submission.

### P1 (may follow initial TestFlight, but implement/test before claiming the feature)

- [ ] Dark/Light and Motion choices survive relaunch, with correct Reduce Motion fallback.
- [ ] Optional off-by-default confirmed-event haptics are rate-limited, stop/background-safe, and physically tested before enabling in a release.

## 10. Implementation sequence and handoff

1. **Baseline and tests:** Read current `app.json`, `eas.json`, `SettingsScreen.tsx`, `ThemeProvider`, `SessionProvider`, `useSoundSession`, native config and relevant tests. Confirm current main head; preserve REQ-007 artwork/Live/Settings architecture. Make a short checklist of public old-name occurrences.
2. **First code slice:** AUVIONA public identity + accurate copy + desired-listening lifecycle + regression tests. This fixes the two clearest user-visible bugs before introducing other work.
3. **Second slice:** persistence for Theme/Motion and optional haptic settings; add opt-in confirmed-event haptics after proper test coverage. Keep performance and permission behavior unchanged.
4. **Privacy/support slice:** page content, legal/operator review points, deployed public URLs, Settings links and truthfully populated store metadata checklist. Do not guess a domain/email or pretend deployment happened.
5. **Native release slice:** finalize identifier with owner, verify manifests/toolchain, signed production archive, authorized TestFlight upload and manual QA. Record what is actually verified and what remains blocked. **No automatic public submission.**

**Implementation stop:** Commit the focused code/tests/docs and provide a concise evidence table (pass / fail / blocked) for each P0 gate plus TestFlight build identifier when available. If the code slices finish without Apple credentials, approved contact data or legal clearance, report those gates as **blocked**—not “done.”

## Official references (recheck at submission)

- Apple App Review Guidelines 2.1, 2.2, 5.1.1: https://developer.apple.com/app-store/review/guidelines/
- Apple App Store Connect Privacy Policy URL: https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy
- Apple App Store Connect Support URL: https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information/
- Apple current SDK/upload requirements: https://developer.apple.com/news/upcoming-requirements/
- Apple privacy manifest and third-party SDK rules: https://developer.apple.com/support/third-party-SDK-requirements/
- Apple required-reason APIs: https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api
- Expo app version management: https://docs.expo.dev/build-reference/app-versions/
