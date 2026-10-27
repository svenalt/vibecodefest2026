# REQ-006 — SONORA Focused Live UI & Immersive Fullscreen

**Status:** Accepted by the owner on 2026-10-25 after device testing (delivered product/device scope). Remaining release work and new review findings: REQ-011.
**Date:** 2026-10-24  
**Priority:** P0 — streamlined live experience and premium UI  
**Timebox:** 45–60 minutes for P0, excluding physical iPhone build and visual tuning  
**Target:** Shared React Native/TypeScript UI for iOS and Android; iPhone 13 Pro Max first  
**Depends on:** REQ-004 app-level single SoundSession and REQ-005 Universe V2 on main (`f10336f`)  

## Product decision — focus SONORA on Live

**This decision supersedes the four-tab navigation in REQ-004 for the present prototype.** The owner has accepted REQ-005 on iPhone. The immediate product now consists of only:

1. **Live** — genuine environment-sound recognition + the Universe artwork; it is the root screen.
2. **Settings** — a secondary screen reached from a polished, clearly recognizable settings button in the Live header.
3. **Immersive Mode** — a fullscreen presentation of the same live artwork, entered from Live and exited back to Live.

**Remove the bottom navigation bar entirely. Do not show Sound Walk or Gallery anywhere in the current UI.** Those are deferred concepts, not active destinations or "Coming soon" screens. Do not implement Sound Walk recording, Gallery storage or export. Unused placeholder files may be left untouched or removed safely if references are verified; do not remove user data (there is no persistent Sound Walk/Gallery data in this prototype).

Goal: a calm, beautifully designed, **single-purpose SONORA experience**, equally credible as an accessibility aid and digital artwork. The new REQ-005 renderer should remain intact.

## P0 — Single-screen navigation with beautiful Settings access

1. Replace the REQ-004 four-tab shell in `App.tsx` with a simple **Live / Settings** UI state. **No tab bar, no tabs, no Sound Walk/Gallery placeholders**, no blank space reserved for a bottom navigation bar. Live is the initial screen on app launch.
2. Place a clear, premium **settings gear button at the upper-right of the Live header**, visually balancing SONORA branding. Give it a >=44 pt tap target, an accessible **"Open settings"** label and an appropriate touch/focus state. Keep the visual language restrained and consistent with Dark/Light palettes. Avoid an emoji gear if it clashes with the design.
3. Header composition: compact **SONORA** and **Visualize Your Surroundings** at left, settings access at right. The real microphone status must remain visible at a glance, positioned thoughtfully (for example beneath the header or as a separate subtle chip), without fighting for header width or being clipped with Dynamic Type.
4. Settings opens as a dedicated secondary view with title **Settings** and an obvious **Back to Live** affordance at top-left. Back returns to the same active Live session and artwork; on Android, hardware Back should behave as expected. No bottom tab bar on Settings either.
5. Preserve the original decision: **Start/Stop listening, Appearance, Visualization, Diagnostics and About live in Settings**. Live displays status and detected sounds but does not duplicate Start/Stop controls. If listening is off, present a calm intentional state and a discoverable way to open Settings, without pretending to be listening.
6. Keep the existing `SessionProvider` **above screen navigation**, with one microphone session and one feature stream. Opening/closing Settings does not start/stop listening, reset the timeline, or clear detection. As in REQ-004, backgrounding the app stops capture. Prefer to keep the live artwork mounted but paused/hidden when Settings is visible, or otherwise preserve its logical state without a second renderer loop.

## P0 — Immersive Fullscreen Mode

1. Put a discoverable **Expand artwork** button in the top-right of the artwork area on Live; this is distinct from the **Settings** button in the app header. Both controls must have >=44 pt targets and descriptive accessibility labels.
2. Expanding makes the **same live Universe** fill the viewport edge to edge. Remove the regular header, recognition tile and timeline in immersion; the rounded card becomes a fullscreen canvas with a responsive composition. Do not create two simultaneously running canvases, render loops or mic sessions.
3. Provide an always-accessible **Exit immersive mode** button in the top-right safe area. Do not depend only on gestures. Android Back exits immersion before leaving Live.
4. Show an unobtrusive but clearly readable microphone **ON/OFF/starting/blocked/error** indicator, with text/symbols beyond color. If permission is blocked or the session errors, the user must see how to resolve it (overlay or return to normal Live).
5. Two optional presentation variants:
   - **Pure Art** (default): almost uninterrupted artwork; only essential mic state, presentation toggle and exit affordances.
   - **Art + Sounds**: on a **real** category change, show an icon and human-readable category label for about 3 seconds, then fade. A user must still be able to inspect the current sound accessibly. Never invent detections or show raw YAMNet scores.
   Switching presentation changes overlays only, not classification or artwork generation.
6. Respect Visualization = Animated / Reduced / Off, device Reduced Motion, active/background state and theme. If Visualization is Off, don't offer a blank fullscreen artwork. No flashes, strobing or misleading directional/spatial visual claims.
7. Portrait iPhone 13 Pro Max first; shared responsive implementation for Android. Landscape/iPad fullscreen polish is deferred unless trivial. No new native fullscreen dependency.

## P0 — Premium Live and Settings polish

### Live

- The Universe remains the visual hero while **current sound** and **microphone state** stay readable without excessive scrolling on iPhone 13 Pro Max.
- Redesign `CurrentSound` as a premium compact tile: consistent recognizable category icon, short English name, and honest status ("Detected just now", "Listening for sounds", "Not listening", or an appropriate error). No `Model label`, `Raw score`, arbitrary numeric confidence or technical jargon in the user-facing Live view; keep those details in Diagnostics.
- Make silence, unknown, permission-denied and microphone-off states intentional and unmistakable, not visually alarming unless there is an actual error.
- Refine `Timeline` into a calm, lightweight recent-sounds section with readable category/time information, ideally showing the latest ~3 entries while keeping the actual in-memory timeline intact. Do not implement a new Gallery or navigation destination.
- Use subtle, coherent spacing, iconography, typography, radius and foreground separation. No gratuitous "glass" effects that make text unreadable over the artwork.

### Settings

- Make Settings feel like part of the same high-quality SONORA app: clear title, back button, grouped Listening / Appearance / Visualization / Diagnostics / About controls, tidy card/row spacing and coherent icons.
- Preserve all existing functionality, permission handling, start/stop concurrency guard, Reduced Motion behavior and About privacy/safety disclaimer.
- Use the current navy/lavender/mint/gold Dark and pearl/lilac/turquoise Light palette from `theme.ts`; keep accessible contrast and readable state labels.
- Do not introduce native dependencies solely for decorative icons. Prefer current primitives/assets. If a new native dependency is unavoidable, report first rather than unexpectedly invalidating the existing dev build.

## Accessibility, correctness and guardrails

- Microphone status always reflects reality; no fake detection labels, no direction claims, no emergency/safety reliability claims.
- Fullscreen, Settings/Back and presentation toggles must be explicit accessible controls; preserve screen reader announcements for real sound events.
- Artwork remains decorative; all meaningful recognition information is available in text.
- Support larger text/Dynamic Type, contrast, safe areas, Light/Dark and Reduced Motion. Prefer >=4.5:1 normal-text contrast where applicable.
- Keep one `SoundSession`, preserve app foreground/background semantics, do not alter YAMNet model thresholds, native audio adapters or REQ-005 visual physics.
- Do not implement Sound Walk, Gallery, recording, export, onboarding, notification/haptic systems or more art styles in this REQ.

## Acceptance checklist

- [ ] On startup, the only main screen is Live; **no bottom navbar, no Sound Walk, no Gallery** visible or reachable.
- [ ] The gear button is visible and reachable on Live; Settings has a clear Back to Live affordance and no tab bar.
- [ ] Opening Settings and returning (repeatedly) preserves active listening, recognition timeline and logical Universe state; no second microphone or frame loop.
- [ ] Start/Stop controls exist in Settings, not Live; Live still shows accurate microphone state and permission/error messaging.
- [ ] Live's current sound tile and timeline have premium user-facing copy/icons without raw model labels or scores; diagnostics retains raw values.
- [ ] Fullscreen uses the current Universe across the viewport; no underlying chrome, duplicated canvas or black gaps; exit is always visible and returns to Live.
- [ ] Pure Art and Art + Sounds overlays behave as described; only genuinely detected sounds are labelled.
- [ ] Microphone OFF/starting/ON/blocked/error states are truthful and actionable in normal and immersive views.
- [ ] Animated/Reduced/Off, Dark/Light and app backgrounding behave correctly.
- [ ] iPhone 13 Pro Max portrait, safe areas, large text, both themes: no clipped header, gear, captions, exit or Settings back controls.
- [ ] `npm run typecheck` and `npm test` pass; add focused tests for Live/Settings/fullscreen state transitions and honest labels.
- [ ] Physical-device smoke test plus screenshots of Live Dark, Live Light, Settings, Immersive Pure Art and Immersive Art + Sounds. Report exactly what was tested on iPhone.

## P1 if time remains

- Persist Dark/Light appearance across restarts without new native build work.
- Add subtle, accessible Settings transition and recognition-tile microinteractions.
- Evaluate landscape/tablet immersive sizing separately.

## Performance handoff

REQ-005 was accepted visually on iPhone, but long-session memory/thermal measurements are still valuable because it builds one `SkPicture` per frame. **Do not rewrite `UniversePainter` in REQ-006.** Check that switching normal/fullscreen size neither mounts concurrent painters nor repeatedly rebuilds on every frame. Report any newly observed performance regression explicitly.

## Implementation entry points

- `App.tsx` — replace tab navigation with Live/Settings; keep session provider above view state
- `src/ui/LiveScreen.tsx` — settings gear, responsive artwork, immersive controls, current sound hierarchy
- `src/viz/SoundCanvasView.tsx` — one canvas across normal/fullscreen layout and responsive clip/bounds
- `src/ui/SettingsScreen.tsx` — secondary screen header, Back to Live, premium grouped styling
- `src/ui/CurrentSound.tsx`, `Timeline.tsx` — user-friendly text/icons and layout
- `src/ui/theme.ts`, `icons.ts` — shared coherent tokens and icons
- `src/ui/TabBar.tsx`, `ComingSoonScreen.tsx` — remove from active UI; safely clean dead code only if no references remain
- `src/app/SessionProvider.tsx` — retain one capture controller and feature stream

**Implementation stop:** Within ~60 minutes deliver the focused Live/Settings flow, polished UI and robust Immersive Mode. Do not expand to Sound Walk/Gallery or rewrite the validated REQ-005 artwork. Report tests, screenshots and remaining limitations.
