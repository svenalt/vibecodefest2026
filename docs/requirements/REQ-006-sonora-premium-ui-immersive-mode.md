# REQ-006 — SONORA Premium UI Polish & Immersive Fullscreen Mode

**Status:** Ready for implementation after REQ-005 iPhone smoke test  
**Date:** 2026-10-24  
**Priority:** P0 — design quality and immersive experience  
**Recommended Claude Code:** **Sonnet 5.5, High effort** (Medium for purely cosmetic follow-up changes)  
**Timebox:** 50–65 minutes for P0, excluding physical iPhone build and visual tuning  
**Target:** Shared React Native/TypeScript UI for iOS and Android; iPhone 13 Pro Max first  
**Depends on:** REQ-004 navigation/session ownership and REQ-005 Universe V2 renderer on main (`f10336f`)  

## Why

SONORA must feel like an elegant, art-first app **and** an honest, accessible live sound recognition tool. The REQ-005 artwork is substantially improved, but the surrounding UI remains visibly utilitarian:

- `src/ui/TabBar.tsx` mixes emoji, Unicode glyphs and text instead of one coherent icon language.
- `src/ui/CurrentSound.tsx` places `Model label` and `Raw score` directly in the primary sound card. These belong in developer diagnostics.
- `src/ui/Timeline.tsx` exposes score values and has dense rows.
- Live, Settings and Coming Soon screens have basic styles without a unified premium hierarchy.
- The user explicitly requested a **fullscreen artwork option** so the Universe can become an immersive, living digital painting.

Do not undermine the functional accessibility purpose: microphone truth, sound labels, errors, permission state and legibility remain more important than decorative effects.

## P0 — Immersive Fullscreen Mode (highest-value feature)

1. Add a discoverable expand/fullscreen control at the top-right of the existing Live artwork. It is a genuine button with an accessible label such as **"Enter immersive mode"**, >=44 pt touch target and a visible focus/pressed state.
2. Entering the mode makes the **same live Universe scene** fill the device viewport edge to edge (including behind safe-area backgrounds where supported). Remove the rounded artwork-card treatment, SONORA header, CurrentSound card, Timeline and bottom tab bar while immersed. Avoid stretching or cropping the visual in a way that breaks its composition; let the Skia painter use the actual available dimensions.
3. Provide an always-discoverable **Exit immersive mode** button at the top-right within the safe area. Do not rely on invisible gestures as the only exit. The app's back action on Android should leave immersion before navigating away, where applicable.
4. In immersive mode, keep a small unobtrusive but readable **microphone ON/OFF/starting/blocked/error** status, using text and shape as well as color. Never imply capture is active while off. Permission errors or capture failures must remain actionable (show a legible overlay or exit immersion with the error displayed).
5. Provide two *presentation modes* inside immersion:
   - **Pure Art** (default): beautiful art with minimal persistent microphone and exit affordances, no event feed overlay.
   - **Art + Sounds**: on a **real recognized** category change, show a concise unobtrusive icon + category label (e.g. "Birdsong") near the bottom for ~3 seconds, then fade. Also provide a discoverable, accessible way to inspect the current sound if captions fade. Silence, unknown or absent predictions must not fabricate events. Do not show raw score.
   The choice can live in a small fullscreen overlay control; it need not be persisted in this sprint.
6. Keep exactly **one SoundSession**, **one microphone stream** and one logical visualization state; toggling fullscreen must not call start/stop, reset the event timeline, create a second renderer loop or restart the artwork transition unnecessarily. Prefer restructuring the existing `LiveScreen`/canvas layout over mounting a second independent `SoundCanvasView`. Avoid competing `SkPicture` allocations or duplicate per-frame updates.
7. Respect Settings > Visualization:
   - Animated: normal full sound-driven Universe.
   - Reduced: genuinely restrained/static art, usable labels and clear exit.
   - Off: hide/disable entry into an otherwise empty fullscreen art view; explain why if needed.
   Backgrounding the app must still stop the microphone, as REQ-004 requires.
8. Portrait first, tested on iPhone 13 Pro Max. Shared code must adapt to other screen dimensions and Android. Landscape/tablet immersive layouts are a later enhancement unless they work trivially without regressions.
9. No new native fullscreen library for this prototype. Use the existing layout, safe-area and status-bar facilities. Keep transitions restrained; no flashes, strobing or motion that ignores system Reduced Motion.

## P0 — Premium visual polish around the artwork

### Live screen

- Make the Universe the clear visual hero **without hiding the current detected sound or microphone truth below an excessive scroll** on iPhone 13 Pro Max.
- Preserve the compact **SONORA** / **Visualize Your Surroundings** brand header from REQ-004.
- Redesign `CurrentSound` as a refined, compact, highly legible category tile: consistent icon, user-facing category, succinct plain-English state ("Detected just now", "Listening for sounds", "Not listening", or clearly distinguished permission/error state as appropriate). No developer `rawLabel`, `Raw score`, numeric confidence or misleading probabilistic language in the main UI. Keep raw values available in Diagnostics.
- Make off/idle and unknown/silence states visually intentional, not warning-like. Preserve clear honest text.
- Recent sounds should read like a lightweight curated session history with concise time metadata and consistent spacing. Prioritize the latest ~3 events on Live; keep the underlying event history intact. A "See all" affordance is optional only if it can be implemented truthfully within timebox.

### Navigation, icons and typography

- Replace the current mixed emoji/Unicode bottom-tab icons with **one visually consistent icon family**, in Live / Sound Walk / Gallery / Settings order. Use labels with icons, not icons alone; preserve clear selection state and >=44 pt touch targets.
- Avoid introducing new native dependencies or forcing another dev-build install merely for icons. Prefer already available assets/primitives; if an additional native dependency is unavoidable, stop and report instead of expanding scope.
- Establish a small shared spacing/radius/type scale so screens have consistent hierarchy and alignment; use restrained navy/lavender/mint/gold accents in Dark and pearl/lilac/turquoise in Light, consistent with `theme.ts`.
- Keep artwork visually rich, controls quiet. Prefer subtle elevation/opacity/separation over aggressive blur/glass effects. No UI text over busy artwork without a sufficiently opaque legibility treatment.
- Avoid truncation or overlapping controls at larger text sizes and safe-area boundaries.

### Settings and placeholders

- Keep Start/Stop listening, Appearance, Visualization, Diagnostics and About **in Settings**, as explicitly decided in REQ-004. Do not move microphone controls back onto Live.
- Polish grouped Settings spacing, labels and control hierarchy while preserving actual permission handling, state transitions and About safety disclaimer.
- Make Sound Walk and Gallery **Coming soon** screens feel consistent with the new look, but keep the wording honest. Do **not** implement recording, gallery persistence, artwork export, a new art-style selector or onboarding in REQ-006.

## Accessibility & correctness

- Use actual text labels and screen-reader semantics; the Skia artwork stays decorative for accessibility.
- Fullscreen open/close and Pure Art / Art + Sounds selection are keyboard/screen-reader reachable with descriptive state.
- Preserve user control, honest listening state and real detected category labels; do not use color, motion or haptics as the only signal.
- Respect device Reduced Motion, Dark/Light and dynamic text sizes. Verify sufficient contrast (target standard-text contrast >=4.5:1 where applicable).
- Never imply directional sound localization, safety reliability or a detected category when only uncertain/unknown data exist.

## Test/acceptance checklist

- [ ] Default Live looks visually coherent in Dark and Light; no raw YAMNet/debug values in the main sound tile or timeline.
- [ ] Four tabs have consistent recognizable icons, visible labels, selection and safe-area treatment.
- [ ] Fullscreen entry expands the **same** Universe to the actual viewport and hides chrome; exit is always reachable and restores the same Live session.
- [ ] Start listening in Settings → Live → fullscreen → exit → Gallery → Live: capture stays single and event timeline is preserved.
- [ ] Fullscreen while microphone OFF, starting, on, blocked and error: truthful visible state, no silent failure or fake capture.
- [ ] Pure Art has minimal controls; Art + Sounds shows **real** detected categories and never fabricated ones. Labels fade without causing overlap and remain retrievable accessibly.
- [ ] Reduced Motion and Visualization Off behave predictably; no inaccessible empty fullscreen.
- [ ] Backgrounding/foregrounding still stops/reports the capture according to existing app lifecycle rules.
- [ ] Small and large text, portrait safe area, iPhone 13 Pro Max and both themes: no obscured text, missing exit or clipped tab controls.
- [ ] No new native dependencies; no YAMNet/classification threshold changes or second mic/session.
- [ ] `npm run typecheck` and `npm test` pass; add focused UI/state tests for fullscreen transitions and truthful labels if feasible.
- [ ] Physical iPhone smoke test and screenshots of **Live Dark**, **Live Light**, **Immersive Pure Art** and **Immersive Art + Sounds**. State explicitly which checks were done on device versus only in code.

## P1 only if time remains

- Persist chosen Dark/Light appearance across app restarts, provided it does not require new native build work.
- Give Settings and Coming Soon pages more polished empty states and subtle, accessible microinteractions.
- A full-screen gallery of session history or a dedicated "See all recent sounds" screen, if genuinely useful after real-device review.

## Performance / REQ-005 handoff

REQ-005 now uses one new `SkPicture` per frame. Its CanvasKit measurement is not a native iPhone benchmark. Do not rewrite `UniversePainter`, thresholds or rendering physics as part of this UI task. When toggling fullscreen, avoid accidentally mounting two painters or causing continuous size-change reconstruction. If real-device testing reveals significant memory growth, frame hitches or missed quiet transients, report a separate REQ-005 follow-up rather than hiding the issue inside UI styling.

## File entry points

- `App.tsx` — app shell, tab bar visibility, app-wide immersive state if needed
- `src/ui/LiveScreen.tsx` — immersive entry and Live visual hierarchy
- `src/viz/SoundCanvasView.tsx` — same-canvas immersive dimensions, clip radius, pause/resume
- `src/ui/CurrentSound.tsx`, `Timeline.tsx` — concise user-facing presentation
- `src/ui/TabBar.tsx`, `icons.ts`, `theme.ts` — icon language and tokens
- `src/ui/SettingsScreen.tsx`, `ComingSoonScreen.tsx` — polish without functionality expansion
- `src/app/SessionProvider.tsx` — keep one session owner, avoid behavior changes

**Implementation stop:** Prioritize stable immersive mode and visibly improved Live/UI polish by 65 minutes. Report screenshots, tests, remaining caveats and actual iPhone observations; do not quietly expand into REQ-007 Sound Walk.
