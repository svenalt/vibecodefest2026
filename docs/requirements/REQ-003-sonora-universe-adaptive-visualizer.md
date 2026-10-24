# REQ-003 — SONORA Universe visualizer with adaptive relative sound intensity

**Status:** Ready for implementation after REQ-001 and compatible with REQ-002
**Date:** 2026-10-24
**Priority:** High / signature experience
**Target:** Shared iOS + Android React Native rendering
**Recommended Claude Code:** Sonnet 5.5, High effort
**Depends on:** REQ-001 acoustic-feature and category event contracts; REQ-002 design tokens/themes (can be integrated incrementally)

## 1. Goal

Create SONORA's signature **Universe** generative sound-art visualization. Ambient sounds organize thousands of luminous, organic particles, filaments, waves, and clustered nebula-like forms. The artwork evolves continuously from live sound and remains beautiful even during quiet passages.

### Fundamental product rule — ADAPTIVE RELATIVE LOUDNESS

Visual intensity must react **relative to the recent surrounding sound environment**, not just to an absolute microphone amplitude.

- In a quiet forest, a comparatively soft bird call should cause a prominent, delicate, visible response.
- In a busy, noisy street, a constant traffic bed should create a subdued underlying texture, not permanently max out the animation. A foreground event that stands out from that background creates a visible accent.
- As the user moves from quiet to loud (or back), sensitivity adapts smoothly. The visualization must not abruptly jump, flicker, or become totally inert.
- **Sound-event detection and accessible text/icons are independent of visual intensity.** An event can remain legibly indicated even when its artistic response is subtle. This is not a safety-grade detection or alert mechanism.

The design principle is **local acoustic contrast / foreground salience**: “How much does this sound stand out here, now?”

## 2. Preserve REQ-001 architecture

- Reuse the **single active audio capture pipeline** and normalized YAMNet category events provided by REQ-001. Never open a competing microphone stream.
- Keep iOS and Android native audio adapters beneath a shared TypeScript feature/event contract. The renderer and adaptation logic must not import Swift/Kotlin-specific internals.
- Reuse the lightweight RMS / optional frequency-band features emitted by REQ-001; do not run YAMNet for visual animation frames.
- Sound-class outputs arrive on the model's slower cadence; energy/feature updates arrive more frequently and are smoothly interpolated.
- All logic runs on device. No raw audio is persisted, uploaded, or needed for artwork.
- Do not change pinned YAMNet weights, class ordering, recognition thresholds, or safety disclaimers merely to make the visual look more energetic.

## 3. Adaptive envelope and local background estimator

Implement a deterministic, testable **RelativeSoundDynamics** module above the native boundary. Exact tuning constants below are *initial suggestions*, to be calibrated in testing; do not treat device dBFS as a calibrated physical sound-pressure-level measurement.

### Input and scale
- Given normalized PCM RMS r, use a stable logarithmic level L = 20 × log10(max(r, epsilon)) (dBFS or equivalent normalized log scale), with epsilon/limits protecting against log(0), NaN, infinity, clipping, and unexpected values.
- Track one continuous feature timeline with monotonic timestamps. Feature samples may be about 10–20 Hz (or a practical throttled rate), independent of animation frames.
- Respect the actual acoustic feature values from REQ-001; use mock streams only in isolated tests/demo fixtures.

### Recent environmental reference
- Maintain a robust, slowly moving **ambient reference B(t)** from a recent window, initially around **20–30 seconds**. Prefer a lower quantile/robust floor estimate over an instantaneous mean so brief impulses do not immediately redefine “normal.”
- During the first few seconds, use a provisional reference with a smooth transition into the stable window. The app must render immediately; no black screen while calibrating.
- Adapt to extended city traffic or sustained wind over time, but do not let a short bird call, clap, or horn immediately lift the baseline.
- Slowly follow upward changes in ambience and accommodate downward changes when surroundings become quieter. Bound adaptation rate; reset sensibly for a new listening session.
- Apply a modest noise gate/minimum meaningful delta so digital mic self-noise in a nearly silent room does not explode into bright particles. Do not entirely suppress genuine classified low-amplitude events.

### Foreground prominence
- Define a **relative contrast** value from L(t) - B(t), with a configurable small onset margin.
- Map positive excess level into a bounded [0, 1] intensity through a soft-knee/compressed curve rather than unbounded linear gain. A sustained very loud background must not saturate the canvas forever.
- Provide separate smoothly filtered attack and release (initial exploration: attack ~100–250 ms, release ~1–3 s), so short acoustic events are responsive but not visually jittery.
- Blend slower recognized-category identity/persistence with the higher-rate envelope; do not flash a totally new scene every ~0.5-second model result.
- Include a gentle minimum idle animation so silence looks intentional rather than broken; idle particles must not misleadingly imply an identified sound.

### Priority constraints
- Displayed recognition events and text/icons are never gated away by adaptive visual intensity.
- A *newly recognized* low-level event can get a restrained minimum artistic motif even when RMS contrast is small, but should not become a maximal explosion solely due to a noisy classifier.
- Unknown/no confident sound means neutral ambience, not a fabricated bird/traffic category.
- This algorithm drives **art intensity only**. It must not change microphone permissions, classifier scores, recognition thresholds, event cooldown, haptics, or alerts.

## 4. Universe visual grammar

Render a premium, fluid, organic cosmos. Thousands of efficient visual particles are an aesthetic target, **not** an obligation to allocate thousands of individual React components. Prefer a performant Skia/shader/batched approach compatible with the existing Expo native build; use deterministic seeds and bounded allocations.

| Semantic category | Core color | Motif / motion |
| --- | --- | --- |
| Birds | Gold | Rising sparkling clusters and delicate arcs |
| Wind | Mint/green | Long, flexible flowing ribbons |
| Water | Turquoise | Expanding fluid concentric currents |
| Voices/speech | Violet | Soft pulsating nebulae |
| Traffic | Orange | Directed streaks, slow underlying current |
| Rain | Blue | Fine dense falling/scattered particles |
| Sirens | Pink | Distinct rhythmic luminous arcs, *art only; no safety promise* |
| Unknown / silence | Neutral pearl/muted star field | Gentle idle drift without class-specific claim |

This table is a **visual taxonomy**, not a demand that REQ-001 detect every listed class. Bind a motif only when the shared label-to-category mapper supports that category; otherwise use unknown/ambient. Keep the initial 3–5 reliable categories from REQ-001 testable and extensible.

- Relative intensity controls opacity, density, size, speed and/or energy without making the picture unreadable.
- Category controls hue and motion family, with transitions that blend when multiple supported sounds occur or when confidence is ambiguous.
- Optional broad frequency-band features may shape texture/geometry when available; must gracefully degrade with RMS + category only.
- Keep motion restrained and elegant, not aggressive arcade particles. Avoid decorative literal planet imagery, directional radar claims, and visual inference of sound-source location.

## 5. Universe Light / Dark and accessibility

- **Universe Dark:** deep navy surface (#0B1120) with luminous turquoise, violet, mint, gold, peach/pink sound particles.
- **Universe Light:** luminous pearl-white/ivory/fog-blue surface, pastel lavender/mint/turquoise/gold/peach particle fields with enough contrast to remain legible, airy atmosphere.
- Both share **identical sound-to-art semantics**. They differ in palette, glow strength, particle contrast, and background treatment.
- App appearance (REQ-002) and artwork palette are separate settings; Universe palette can initially follow app appearance but must not be hard-coupled to it.
- Render overlaid sound label, icon, listening state, and primary controls on stable contrast-aware surfaces.
- Honor Reduce Motion: static or substantially calmer compositional snapshots; preserve sound-event text/icon functionality. No strobe-like rapidly pulsing effects.

## 6. Deterministic test harness / observability

Create platform-independent input fixtures without microphone access:
1. Nearly silent room + one soft bird call relative to its recent baseline.
2. Steady heavy traffic over 30+ seconds + one transient horn/foreground event.
3. Abrupt move from quiet to loud ambience and back.
4. Prolonged steady wind/rain vs rapid impacts.
5. Silence, low-level mic self-noise, clipping, NaN/zero, missing feature updates, and unknown category.
6. Simulated mix of two successive categories with event cooldown/debounce.
7. Light and Dark palette using the **same** event/feature sequence.

Expose development-only numeric telemetry for ambient reference, current level, contrast, visual intensity, active motif, animation FPS/dropped frames where feasible. Do not persist raw audio; no end-user physical dB claims.

## 7. Performance and session behavior

- Draw at device-supported smooth frame rate where feasible, prioritize classifier/capture responsiveness and battery/thermal stability over visual detail.
- Throttle native-to-JS feature transport; animate/interpolate independently. Keep memory/particle counts bounded, and add a reduced-complexity fallback for older devices.
- Start/Stop should synchronize with REQ-001. On Stop, gracefully fade to a static artwork and cease all live microphone-driven updates. Release/destroy resources as specified in REQ-001.
- Keep the visual-event API usable later for Sound Walk aggregation/export in REQ-004; do not implement persistent recording/export in this REQ.
- This is a 2D generative sound artwork, not audio spatial localization.

## 8. Out of scope

- Raw audio recording/export, waveform-file persistence, Sound Walk gallery/storage, location tracking, directional radar, measured SPL/dBA claims, safety-critical siren reliability, new ML model training, cloud services, cross-device calibration promises.

## 9. Acceptance criteria

- [ ] The Universe artwork actually responds to live REQ-001 audio features (not a looping animation) and to at least two supported classifier category motifs.
- [ ] **Relative sensitivity:** a modest transient clearly stands out in a quiet fixture; a constant loud background settles into restrained ambient motion, while a foreground deviation remains noticeable.
- [ ] **Adaptation:** stepping between quiet/loud environments transitions smoothly rather than instantly rescaling all particles or locking intensity high; return to quiet recovers sensitivity.
- [ ] **Noise robustness:** digital silence/mic noise does not generate persistent exaggerated visuals.
- [ ] **Independent events:** recognized text/icon/history still show relevant events even when artistic intensity is small, with unknown/error states honest.
- [ ] Light and Dark render the same input sequence with consistent motifs/relative intensities, different accessible palettes.
- [ ] Reduced Motion produces an understandable still/low-motion state; no inaccessible color-only recognition.
- [ ] Pure unit tests cover log-level conversion, robust baseline, smoothing, bounds, adaptation, restarts, invalid values, and unknown categories.
- [ ] Rendering performance is measured on a physical iPhone 13 Pro Max, with actual frame/thermal limitations recorded. Shared visual logic remains Android-compatible; do not claim physical Android performance until tested.
- [ ] No competing microphone capture, unexpected background listening, raw-audio persistence, or network dependency is introduced.

## 10. Suggested implementation sequence

1. Lock the REQ-001 feature/event contract, build and test RelativeSoundDynamics using fixture timelines.
2. Implement a performant configurable Universe particle renderer fed by the normalized visual-intensity + category model.
3. Add Light/Dark artwork palette variants and Reduce Motion behavior.
4. Integrate with REQ-001 live listening lifecycle.
5. Test contrasting quiet forest / busy street fixtures and validate against live iPhone audio, adjusting parameters with documented results.

**Important:** Implement this **after REQ-001 reaches a stable checkpoint**. It must refine, not destabilize, the on-device YAMNet vertical slice. REQ-002 app-wide appearance is complementary, not a prerequisite for prototyping the dynamics logic.

## 11. Technical reference

- Existing contract and privacy rules: [REQ-001](REQ-001-soundcanvas-mvp.md)
- Appearance rules: [REQ-002](REQ-002-sonora-ui-and-themes.md)
- MediaPipe audio classification overview: https://ai.google.dev/edge/mediapipe/solutions/audio/audio_classifier
- Apple audio power metering (dBFS, not calibrated environmental SPL): https://developer.apple.com/documentation/avfaudio/avaudiorecorder/averagepower(forchannel:)
