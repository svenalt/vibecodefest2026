# REQ-002 — SONORA UI and Light/Dark (2-hour prototype scope)

**Status:** Accepted by the owner on 2026-10-25 after device testing (delivered product/device scope). Remaining release work and new review findings: REQ-011.
**Date:** 2026-10-24  
**Priority:** P0 after REQ-001 baseline  
**Timebox:** **30 minutes of implementation**, excluding device-build troubleshooting  
**Target:** Shared React Native / Expo TypeScript UI for iOS and Android; iPhone demonstration first  
**Depends on:** REQ-001 commit `7d9c1c0`; REQ-001 native iPhone execution is still unverified

## 1. Goal and strict boundary

Rebrand the existing REQ-001 single-screen sound-awareness prototype as **SONORA**, tagline **“Visualize Your Surroundings”**. Make the screen visually appealing, readable and ready to host the Universe artwork from REQ-003.

**Do not rewrite microphone capture, YAMNet, Swift, classifier thresholds, adapters, session controller or the existing Skia pipeline merely for visual design.** Native compilation/device validation is a separate immediate task. Keep all app text in English.

This is a **working two-hour demo**, not a production-ready UI. Stop when the P0 items and quick smoke check pass.

## 2. P0 — implement now

1. **One Live screen only.** Reuse the existing REQ-001 screen, controls and events. Show SONORA branding, a restrained tagline, a central visualization, **Start Listening / Stop Listening**, the actual microphone/listening state, the latest recognized sound in plain English with an icon, and a concise recent-event list if already available.
2. **Honest states.** Preserve existing permission-denied, silence/no-confident-sound, loading and model-error behavior; do not display simulated detections as live YAMNet results. Do not claim reliable emergency or medical alerts.
3. **Simple Light / Dark toggle.** Add an immediately usable switch or two-option control on the Live screen. Apply one shared semantic color palette to the existing screen and artwork container; default to Dark. A lightweight local persistence option is welcome **only if trivial**; do not block the demo on persistence.
4. **Universe-ready styling.** The existing Skia rendering may be reused until REQ-003 changes it. App theme can temporarily determine Universe Light/Dark palette. Ensure foreground text and controls remain legible over art.
5. **Preserve shared platform design.** All new UI/theme code stays in shared React Native/TypeScript. No Android-specific work for this requirement.

### Minimal design tokens

| Element | Dark | Light |
| --- | --- | --- |
| Background | `#0B1120` | `#F5F7FC` |
| Surface | `#172438` | `#FFFFFF` |
| Main text | `#F5F8F8` | `#25344F` |
| Secondary text | `#B9C7D1` | `#52627B` |
| Interactive accent | `#73EDD3` | `#317D8E` |
| Artistic lavender | `#C5ADFF` | `#7066B5` |

Use consistent tokens; avoid creating a full design-system infrastructure.

## 3. P1 — only if P0 is finished early

- Persist Light/Dark in local storage and restore it at restart.
- Tidy spacing/typography on the iPhone 13 Pro Max.
- Add a single, unobtrusive entry into future Sound Walk functionality **only if it clearly says unavailable**.

P1 is optional. Prioritize a running build over completing these items.

## 4. Explicitly deferred after the demo

Preserve these agreed product decisions for future REQs; **do not implement them in this 30-minute task**:

- First-launch Light/Dark choice and optional Follow System, plus full Settings screen/persistence.
- App-wide multi-screen navigation, Sound Walk, Gallery, saved artwork, detailed event history, diagnostic settings and advanced onboarding.
- Independent artwork-style selector; **Universe remains the default** with future Universe Light and Universe Dark variants independent of app appearance.
- Additional artistic styles (Flow/Bloom), complex transitions, full portrait/landscape polish, exhaustive accessibility audit and broad automated UI test suite.
- Native Android YAMNet adapter, store release, cloud, accounts, telemetry or subscriptions.

## 5. Prototype acceptance / stop conditions

- [ ] SONORA Live screen loads, with English labels and tagline.
- [ ] Existing Start/Stop and genuine REQ-001 event display remain connected; unknown/error states stay honest.
- [ ] User can switch between legible Light and Dark in the current screen.
- [ ] The UI remains usable when microphone permission is denied or native YAMNet is unavailable.
- [ ] `npm run typecheck` passes. Run existing tests if quick; **no large new test suite or long report**.
- [ ] Record in the final handoff what was actually tested on a physical iPhone versus only compiled/bundled or mocked.

**Rule:** If this timebox expires, hand off the current working state. Do not keep expanding UI. Continue to REQ-003 or device verification.
