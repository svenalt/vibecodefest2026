# REQ-002 — SONORA UI, navigation, and app-wide appearance

**Status:** Ready for implementation after REQ-001 baseline
**Date:** 2026-10-24
**Priority:** High
**Target:** iOS + Android, shared React Native / Expo app
**Recommended Claude Code:** Sonnet 5.5, Medium effort
**Depends on:** REQ-001
**Scope:** Visual/UI refinement only; do not replace the working microphone or YAMNet integration

## 1. Goal

Turn the functional SoundCanvas proof of concept into the product **SONORA**: a polished, calm, accessible English-language sound-awareness and generative-art app, with an intentional first-launch appearance choice and persistent Light/Dark settings.

**Brand tagline:** “Visualize Your Surroundings”.

SONORA has two equal identities: practical sound awareness (event names, pictograms, accessibility) and generative art (immersive sound visualization). Neither should obscure the other.

## 2. Required product structure

- **Live:** the main and primary screen. Preserve REQ-001's genuine on-device classifier, microphone state, Start/Stop, current detected event, event timestamp/history, and errors/unknown states. Place the generative visualization at the visual center.
- **Sound Walk:** a clearly identified entry point to a future session recording flow (REQ-004). If not yet implemented, it must not pretend to record or silently store anything; use a clear unavailable/preview state until functional.
- **Gallery:** reserved for saved Sound Walk artworks (REQ-004), with a legitimate empty state. No fabricated saved walks.
- **Settings:** app appearance, artwork style/variant, Reduce Motion, microphone/privacy explanation, and visible diagnostic link for development builds.
- Navigation must be coherent and simple, with correct handling of an active microphone session on route changes per REQ-001. Do not create competing microphone sessions.

## 3. Appearance modes: FIRST-LAUNCH DECISION

- Show an accessible, short appearance choice on first launch: **Light**, **Dark**, and optionally **Follow System** (recommended third option). The user must actively confirm a choice before proceeding. Do not request microphone permission merely to show this screen.
- Persist the selected appearance **locally**; it survives restart/offline use. No account or cloud sync.
- Allow changing it later via **Settings > Appearance**, immediately and without losing the current non-audio UI state.
- If “Follow System” is offered, react to system appearance changes. Otherwise honor the manual choice even when the device theme changes.
- No distracting theme transition; respect Reduce Motion. App/theme state is separate from listening state and from chosen visual-art style.
- Light and Dark apply to the **whole app**: backgrounds, cards, buttons, typography, navigation, charts/event pills, empty/error states, onboarding, overlays, and settings. No light-on-light or dark-on-dark fragments.

## 4. Visual design system

Use semantic tokens rather than hardcoded colors in individual screens. Keep existing good REQ-001 functionality and architecture.

### Dark foundation (from agreed SONORA direction)
- App background #0B1120
- Elevated surface #172438
- Primary text #F5F8F8
- Secondary text #B9C7D1
- Accent/mint #73EDD3
- Artistic lavender #C5ADFF
- Nature #B2E58E
- Attention #FFC08A
- Error #FF7E89

### Light foundation (initial design tokens; verify contrast)
- App background #F5F7FC or warm pearl-white
- Primary surface #FFFFFF
- Secondary/elevated surface #EAF0F7
- Primary text #25344F
- Secondary text #52627B
- Interactive accent #317D8E (use sufficiently dark tint for small text)
- Lavender accent #7066B5
- Positive, warning, and error tokens must be dark enough for text/icons on light surfaces
- Fine pearlescent/lilac/turquoise atmospheric gradients are for artwork/large surfaces only, never behind low-contrast text.

**Sound-category colors** remain semantically consistent across modes: birds gold, wind green, water turquoise, voices violet, traffic orange, rain blue, sirens pink. Adjust saturation/contrast for light backgrounds; never communicate an event only by color.

## 5. Live screen requirements

- Product name SONORA and tagline “Visualize Your Surroundings” in appropriate onboarding/brand placement; do not waste the critical live-screen area on oversized branding.
- Clear Start Listening / Stop Listening and always-visible listening/microphone state.
- Dominant artwork viewport with adequate padding and no interference with accessible events.
- Current event: plain-English label + readable icon + optional confidence/uncertainty wording (never portray raw YAMNet scores as calibrated probabilities).
- Concise recent-event list with timestamps; distinguish Silence, No confident sound, Permission denied, and Model error.
- Record/Sound Walk affordance must be distinguishable from merely enabling live listening.
- Visible controls and events remain legible during bright or energetic art animations.

## 6. Artwork theme vs. app theme: independent concepts

- **App appearance:** Light | Dark | Follow System (if implemented).
- **Artwork style:** Universe is the initial default. Future artistic styles can be added without rewriting the app shell.
- **Universe appearance:** Universe Light and Universe Dark are separate artwork palette variants. The default artwork palette may follow the app appearance, but users must eventually be able to override it independently. Do not force all artwork to be dark when the app is dark, or vice versa.
- Universe itself is extended in REQ-003. REQ-002 may use the functioning REQ-001 generative view as a placeholder, without implementing the advanced renderer twice.

## 7. Accessibility and privacy

- All interface copy in **English**.
- VoiceOver/TalkBack descriptions, clear labels, dynamic text where practical, large touch targets, focus/reading order, and non-color indicators.
- Respect device Reduced Motion and provide a user-accessible Reduce Motion/static artwork path.
- Maintain explicit listening consent, no background capture, on-device YAMNet, and no raw-audio persistence from REQ-001.
- Do not describe this experimental demo as guaranteed to detect dangerous sounds.

## 8. Non-goals

- No second YAMNet pipeline, classifier rewrite, real Sound Walk capture/storage (REQ-004), authentication, cloud, subscriptions, complex charts, emergency monitoring, or unimplemented safety claims.
- No requirement to complete native Android inference here if REQ-001 Android adapter remains a documented follow-up.

## 9. Acceptance criteria

- [ ] The displayed product branding is SONORA with English copy and tagline.
- [ ] First launch presents and locally persists a Light/Dark appearance choice (and Follow System if offered).
- [ ] Appearance change in Settings updates every active UI surface correctly and survives a cold restart.
- [ ] Dark and Light screens pass reasonable text/control contrast review, with distinguishable active/disabled/permission states.
- [ ] The live event label, icon, recent events, Start/Stop, and diagnostics remain functional through the existing REQ-001 interfaces.
- [ ] Silence/unknown/error states are accurate and are not mistaken for detected sounds.
- [ ] App appearance does not overwrite artwork style selection or silently change capture state.
- [ ] Sound Walk and Gallery do not imply unimplemented storage functionality.
- [ ] Automated UI/theme-state tests cover first launch, persistence, manual/system override, and Reduce Motion where possible.
- [ ] Shared TypeScript UI remains iOS/Android-compatible; types/tests pass, and device-only verification is reported honestly.

## 10. Implementation note

Complete REQ-001 or establish a stable API/branch before applying this requirement. This document is a **future work specification**, not an instruction to interrupt the ongoing classifier implementation. Keep changes incremental and avoid modifying native sound capture or model weights.
