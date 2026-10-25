# REQ-010 — AUVIONA: Simplify Settings and show current sound in Immersive Mode

**Status:** Ready for implementation  
**Date:** 2026-10-25  
**Priority:** P1 — focused UI polish  
**Difficulty:** Low (3/10)  
**Recommended Claude Code:** Sonnet 5.5, Medium effort  
**Target:** Shared iOS/Android React Native UI  
**Depends on:** REQ-007 (Live-only UI), REQ-008 (persisted preferences); compatible with REQ-009 (Android).  
**Product decision:** Public app name **AUVIONA**. Remove both sections from customer-facing Settings while keeping Universe V3 and internal diagnostics functional. In Immersive Mode, **Art + Sounds** immediately and continuously shows the current sound without requiring a button press.

## 1. Goal and verified baseline

Make Settings cleaner for normal users. The only groups remaining are **Listening**, **Appearance**, and **About**, with all their existing controls and links.

Reviewed on GitHub `main` on 2026-10-25:

- `src/ui/SettingsScreen.tsx` has a **Visualization** group with Animated / Reduced / Off and a **Diagnostics** group with a Show/Hide button.
- `src/app/SessionProvider.tsx` uses persisted `prefs.viz` to calculate `effectiveViz`; `null` means follow the system's Reduce Motion setting.
- `src/app/preferences.ts` stores `viz` alongside important `listening`, `theme` and `hapticAlerts` preferences.
- `src/ui/LiveScreen.tsx` hides the artwork and immersive entry when `effectiveViz === 'off'`. Simply removing the selector would strand returning users with `viz: 'off'`.

## 2. P1-A — Remove public settings sections

1. Remove the entire **Visualization** group, including its Motion segmented control, Reduce Motion hint, and explanatory text.
2. Remove the entire **Diagnostics** group, including the Show/Hide button and the rendered `Diagnostics` panel.
3. Clean up unused Settings imports, state and props, without removing lower-level diagnostic data, types, logs or developer tooling.
4. Preserve **Listening** (Start/Stop, truthful mic status, permission guidance and optional haptics), **Appearance** (Dark/Light) and **About** (limitations, Privacy Policy, Support and version) in that order.
5. Keep the layout polished and accessible in Dark/Light, on small screens and with larger font settings. There must be no empty cards, odd spacing or focusable hidden controls.

## 3. P1-B — Device-driven visualization and safe migration

1. Without a user-facing Motion preference, visual motion follows the device setting: **Animated** when system Reduce Motion is off; **Reduced** (still artwork) when on. Do not provide a user-facing **Off** mode.
2. Ignore or safely migrate **every legacy stored `viz` value** (`'off'`, `'animated'`, `'reduced'`) so it never overrides the system preference. An upgrade with `viz: 'off'` must display the artwork and permit immersive mode immediately after hydration and relaunch.
3. The implementation may retain the obsolete field for backward-compatible parsing or remove it with a narrowly scoped migration. **Do not invalidate the entire stored preferences object or reset persisted listening intent** by changing schema version carelessly. In particular, a saved `listening: false` must remain false, without unintended microphone capture on relaunch.
4. Avoid a flash of the wrong motion state or a brief blank canvas during hydration. Changes to the device's Reduce Motion preference should be reflected in the normal app lifecycle.
5. Preserve Universe V3, immersive mode, current sound, timeline, session architecture and background/foreground behavior. Keep internal diagnostics and test hooks for development; only the customer-facing Settings UI is removed.

## 4. P1-C — Show the current sound directly in Immersive Mode

1. In **Immersive Mode → Art + Sounds**, show the **current sound directly as a visible caption/card** (category icon and human-readable sound label), without a separate **Current sound** button or any other tap. The card should be present immediately when the mode is selected or when Immersive Mode opens with Art + Sounds already selected.
2. Keep the displayed content **live and accurate** as recognition changes. A newly confirmed sound should replace the prior sound automatically; do not freeze a stale label until the user taps anything. Reuse the existing `soundSummary` / `micState` and confirmed `snapshot.tracker.current` semantics; do not promote raw/unconfirmed YAMNet predictions to confirmed events.
3. Unlike the existing approximately 3-second toast, the **current sound card stays visible while Art + Sounds is selected**, updating in place instead of fading to a "Current sound" button. When no supported current event exists (e.g., listening for sounds, silence/unknown, listening stopped or microphone unavailable), show the existing **truthful status** instead of an old detection. Respect accessibility Reduce Motion: no mandatory fades/animated transitions.
4. In **Pure Art**, do **not** show the current-sound card. Preserve the artwork, the presentation selector and accessible Exit control in both modes. Keep card contrast, safe-area position, readable text and interaction accessibility in Dark/Light and on small screens.
5. Remove now-unused caption timer/trigger or button code if no longer required, without changing event detection, the listening lifecycle or the sound timeline.

**Verified baseline:** `src/ui/ImmersiveOverlay.tsx` currently shows a short-lived caption only for a newly confirmed sound; otherwise it renders a **Current sound** button that calls `showCaption(now)`. `LiveScreen.tsx` owns the `'art' | 'sounds'` presentation selection. This change makes Art + Sounds an always-informative view.

## 5. Acceptance criteria

- [ ] **Listening**, **Appearance** and **About** are the only visible Settings groups; **Visualization** and **Diagnostics** have no visible controls or accessibility nodes.
- [ ] Manual listening, permission handling, optional haptics, Dark/Light, Back to Live, Privacy Policy and Support work unchanged.
- [ ] On a fresh install, system Reduce Motion **off** gives animated artwork; Reduce Motion **on** gives visible still artwork. Immersive mode works in both cases.
- [ ] Legacy stored `viz: 'off'` no longer hides artwork; legacy `'animated'` or `'reduced'` cannot override system Reduce Motion.
- [ ] All existing users retain stored listening intent, theme and haptic alerts. Especially, a deliberate **Stop** remains stopped after app relaunch.
- [ ] Diagnostic computations and developer debug interfaces remain available outside public Settings.
- [ ] Entering Immersive Mode with **Art + Sounds** selected, or switching to that mode, immediately shows a live current-sound/status card without pressing **Current sound**; the button is gone.
- [ ] A new confirmed sound automatically updates the card; silence/unknown/stopped/permission-error states never leave a stale confirmed label on screen. The card remains visible instead of disappearing after a short timeout.
- [ ] **Pure Art** hides the sound card, and Immersive exit/presentation switching remain accessible and functional in Dark/Light and with Reduce Motion enabled.
- [ ] `npm run typecheck` and `npm test` pass; add focused regression tests for legacy preference behavior, Reduce Motion and Settings visibility. Smoke-test iOS; test Android when REQ-009 native functionality is ready.

## 6. Implementation handoff

1. Re-inspect the latest versions of `SettingsScreen.tsx`, `SessionProvider.tsx`, `preferences.ts`, `LiveScreen.tsx`, **`ImmersiveOverlay.tsx`** and relevant tests before editing.
2. Remove the two Settings groups and dead UI dependencies.
3. Make effective motion device-driven and handle legacy `viz` safely without disturbing listening preferences or microphone lifecycle.
4. Change the Art + Sounds overlay from an expiring caption / **Current sound** button to a persistent, live-updating caption, and add focused regression tests for mode entry, new events and no-event/offline states.
5. Update current documentation that still advertises user-adjustable Motion or Diagnostics settings, or an explicit Current sound button. Keep historical REQ-004/006/007/008 documents as an audit trail.
6. Commit code/tests and report actual verification separately. **No store submission or deployment** is part of this task.

**Out of scope:** Broad visual redesign, YAMNet/model changes, cloud logging, removal of diagnostic infrastructure, new native Android features or App Store submission.
