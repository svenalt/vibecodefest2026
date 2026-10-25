# REQ-005 — SONORA Universe V2: richer, truly sound-driven artwork

**Status:** Accepted by Sven on 2026-10-25 — delivered product/device scope; see [acceptance record](../release/device-acceptance-2026-10-25.md). Remaining release work and new review findings: REQ-011.
**Date:** 2026-10-24
**Priority:** P0 — signature artwork quality
**Recommended Claude Code:** Sonnet 5.5, **High** effort for the renderer (Medium for follow-up visual tuning)
**Timebox:** 50–65 minutes, excluding physical iPhone build
**Target:** One shared performant Skia scene for iOS and Android; iPhone demo first
**Depends on:** REQ-003 adaptive relative-loudness logic and REQ-004 Live layout

## Problem grounded in current implementation

The real REQ-003 visualizer is technically functional, but the calm scene looks like **three opaque concentric circles plus sparse dots**. The screenshot on iPhone 13 Pro Max reads as a placeholder, not a luminous Universe. `Ambient` in `src/viz/SoundCanvasView.tsx` uses flat circles and tiny blinking stars; `Waves` and `Pulses` move mostly by clock even if sound intensity is minimal. `Forms` can look active in low volume because feature bands are normalized to sum to one. `setFrame` triggers React re-render at about 30 fps, regenerating 70 particle elements and paths.

## Goal

Create a distinctive, sophisticated, living **Universe** soundscape that feels organic and premium, not like a radar, scientific meter, or generic audio equalizer. Preserve the agreed rule: **relative foreground sounds matter more than constant ambient loudness**, and actual YAMNet category recognition remains readable outside the artwork.

## P0 visual direction

- **Quiet/idle:** Deep layered nebula with subtle *soft* halo/glow, fine stars at multiple depths, organic curved light ribbons and very gentle breathing. Avoid large opaque hard-edged target circles. Even while stopped, show a beautiful *clearly idle* artwork; do not imply the microphone continues capturing.
- **Live foreground response:** A sound transient should emit/energize a luminous bloom or ripple and a brief responsive particle accent. Modulate brightness, radius, curvature, drift velocity and burst strength by the existing **relative contrast intensity**, ideally using RMS + peak transient information already supplied by the single microphone stream. Attacks are immediate, release is graceful. **No perpetual loud-looking bursts in silence.**
- **Motifs:** At least three visibly distinguishable yet stylistically cohesive treatments: speech → flowing lavender ribbons; rain/nature-like mapped event → delicate mint/gold drifting particles; bell/bark/applause → expansive thin pulses/glints. Music may be layered wave/forms. Use **only current supported** REQ-001 categories; unsupported/unknown remains neutral.
- **Transitions:** Gently blend palette/geometry/motif on recognized category changes rather than snapping or replacing the entire view. Background and composition continue smoothly. Foreground artwork never covers legible text.
- **Light/Dark:** Both polished using the existing SONORA palette; Light should feel luminous on pearl/lilac rather than merely an inverted dark image. Avoid excessive bloom, strobing, flicker and high-contrast flashes. Respect Reduced and Off modes.
- **Composition:** Responsive artwork occupies the available Live hero area, preserving rounded clipping, correct aspect ratio and touch-safe layout; no directional/spatial claims.

## P0 implementation and performance constraints

1. Reuse `VizState`'s ambient baseline and contrast mapping in `src/viz/vizModel.ts`. Keep the audio feature stream and YAMNet classification unmodified.
2. Improve `src/viz/SoundCanvasView.tsx` with layered semi-transparent geometry, soft gradients/blur where supported, organic paths, persistent seeded particle positions, and small bounded event bursts. Prefer quality of motion/composition over particle count. Do not need custom shaders or thousands of particles in this sprint.
3. Make key visible dynamic effects **depend on live features**; a clock can animate gentle drift but cannot substitute for sound. Specifically audit always-on `Pulses` and nonzero `Forms` in near silence.
4. Avoid rebuilding large React subtrees or path arrays on every frame where possible (e.g. stable geometry, Skia UI-thread/reanimated values if practical in the installed stack, otherwise tightly bounded memoized elements). Test for responsiveness, battery/thermal and JS stalls on iPhone.
5. Keep the visualizer decorative for accessibility; real recognized event labels/icons and microphone status remain separate and reliable. No raw audio storage, cloud, fake events, second microphone, or changes to classifier thresholds.

## Quick iPhone acceptance scenarios

- [ ] **Stop/off:** beautiful calm idle scene with unmistakable microphone OFF.
- [ ] **Quiet room:** restrained movement; quiet speech/tap still causes a noticeable short-lived response.
- [ ] **Constant noise:** after seconds of sustained noise, the artwork settles; a new stronger foreground sound still stands out.
- [ ] **Category change:** speech vs bell/applause or rain produce meaningfully different effects when the corresponding *real* detection occurs; if not recognized, do **not** simulate a category silently. A labeled demo fixture may be used separately for art QA.
- [ ] **Dark + Light:** artwork feels intentionally designed in both themes; no ugly opaque bullseye/circles.
- [ ] **Reduced/Off:** Reduced is static/subtle; Off removes the artwork without breaking sound recognition.
- [ ] **Performance:** no obvious stutter or runaway React rerender on physical iPhone; verify with basic FPS/JS profiling if practical.
- [ ] `npm run typecheck` and `npm test` pass; add small pure `VizState` tests for quiet transient/steady noise/silent pulses as useful.

## Scope guard

Do not implement recording Sound Walk, Gallery, saving/export, independent art-style selector, direction finding, custom GPU physics, or model re-training. Spend the time on **one beautiful Universe V2 composition with convincing real sound reactivity**, and record physical-device findings and remaining limitations.

**Implementation stop:** After 65 minutes deliver the best stable iPhone scene and a concise summary of visual proof, tests and performance.
