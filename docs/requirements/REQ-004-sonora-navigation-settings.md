# REQ-004 — SONORA four-tab navigation and Settings

**Status:** Ready for implementation
**Date:** 2026-10-24
**Priority:** P0 — iPhone usability follow-up
**Recommended Claude Code:** Sonnet 5.5, **Medium** effort
**Timebox:** 35–45 minutes (excluding dev-build installation)
**Target:** Shared React Native/TypeScript for iOS and Android, validate on iPhone 13 Pro Max
**Depends on:** REQ-001–003 on `main`

## Goal

Make the SONORA Live view immersive and focused. Remove the large yellow experimental warning from the top of Live, move app controls to Settings, and use a persistent bottom navigation with **Live / Sound Walk / Gallery / Settings**. Keep genuine detection, user control of the microphone, and accessibility intact.

## P0 requirements

1. **Bottom navigation:** Four icon+label tabs in this exact order: **Live**, **Sound Walk**, **Gallery**, **Settings**. All text is English. Highlight selected tab, use semantic theme colors, >=44 pt touch targets, correct screen-reader labels/state, and bottom safe-area clearance. The tab bar remains visually pinned at the bottom while the active screen scrolls. Keep implementation simple; avoid adding a heavyweight navigation dependency just for this prototype.
2. **Live:** Keep SONORA and tagline **“Visualize Your Surroundings”** in a compact header. Make the Universe artwork the visual hero, visibly larger than the existing 220-pt card when space allows, without clipping or obscuring detection. Show the current detected sound/icon, an always-readable **microphone ON/OFF/starting/error indicator**, and recent sounds. Remove the large `Experimental prototype...` banner and all Appearance / Visualization / Diagnostics controls from Live. Do not silently hide microphone failures or permission-denied states.
3. **Settings:** Add grouped controls for **Listening** (Start listening / Stop listening; actual capture status, disabled while transitioning); **Appearance** (Dark / Light); **Visualization** (Animated / Reduced / Off, respecting device Reduce Motion defaults); **Diagnostics** (collapsible developer info); and **About** (prototype/safety/privacy note). Move the current non-safety disclaimer to About as unobtrusive prose: not reliable for safety, emergencies, navigation or medical decisions. Maintain the system-settings shortcut for denied microphone permission.
4. **Placeholders:** Sound Walk and Gallery get clean, nonfunctional “Coming soon” screens, explaining in one sentence what each will eventually do. **Do not** claim audio recording, artwork storage, or export is implemented.
5. **Single session owner:** Today `useSoundSession()` lives inside `MainScreen.tsx` and stops the capture when unmounted. Hoist one session/controller and latest audio feature access to the app shell or provider **above all tabs**. Switching tabs must neither call `stop()`, create a second session, clear the current timeline, nor open another mic. Continuing live foreground listening when viewing other tabs is intentional; leaving the app/backgrounding still stops it. Keep any visualization animation paused while its tab is not visible. Preserve permission, event, error and accessibility announcements.
6. **Safety against duplicate commands:** Prevent overlapping `start()` calls while permission prompt/model loading is in progress; rapidly tapping the Settings control should not cause native `alreadyRunning` errors. Do not alter YAMNet thresholds or the native pipeline merely to solve UI state.

## Acceptance checks

- [ ] Four bottom tabs visible and reachable on iPhone 13 Pro Max, including with safe-area and text scaling; selected state and Dark/Light contrast are clear.
- [ ] No yellow warning on Live; About still explains prototype limitations.
- [ ] Appearance, Visualization and Listening appear **only in Settings**; Live shows true microphone status and any actionable error.
- [ ] Start in Settings → navigate Live/Gallery/Sound Walk/Settings: microphone remains on, and existing in-memory session data remain intact.
- [ ] Stop in Settings or background the app: microphone truly stops; Live updates to OFF, artwork becomes calm.
- [ ] Permission denied, start in progress, repeated taps, Reduce Motion and Visualization Off behave honestly.
- [ ] No raw audio storage/upload, no false detection claims, no new native Android implementation.
- [ ] Run `npm run typecheck` and `npm test`; perform a short **physical iPhone visual/lifecycle smoke test**. Report explicitly what was tested on device.

## Scope guard

This is UI/state ownership refactoring only. Do not implement Sound Walk recording, Gallery storage, onboarding, new sound categories, or a wholesale redesign of the visualizer here (see REQ-005). Theme persistence across restarts is P1 if cheap; otherwise leave for later and state it. No modifications to REQ-001 iOS audio/YAMNet code without a demonstrated regression.

## Current-code entry points

- `App.tsx` — current single-screen root and ThemeProvider
- `src/ui/MainScreen.tsx` — warning, Start/Stop, Appearance, Visualization, diagnostics all together
- `src/hooks/useSoundSession.ts` — **per-screen session lifecycle**; preserve one app-level instance
- `src/core/soundSession.ts` — controller/start concurrency
- `src/ui/theme.ts` — shared tokens and selection
- `src/viz/SoundCanvasView.tsx` — do not remount/reinitialize unnecessarily

**Implementation stop:** Timebox at ~45 min; hand off a tested app shell before expanding functionality.
