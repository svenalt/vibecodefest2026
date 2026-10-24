# REQ-003 — SONORA Universe adaptive sound visualizer (2-hour prototype scope)

**Status:** Ready for rapid implementation after REQ-001; integrate with simplified REQ-002  
**Date:** 2026-10-24  
**Priority:** P0 — signature demo experience  
**Recommended Claude Code:** Sonnet 5.5, **Medium** effort (High only for a concrete difficult renderer/native issue)  
**Timebox:** **50 minutes of implementation**, excluding iPhone-build troubleshooting  
**Target:** One shared Skia/React Native visualizer for iOS and Android; iPhone demo first  
**Depends on:** REQ-001 feature/event contract and optional REQ-002 theme colors

## 1. Goal: real audio → beautiful adaptive Universe

Deliver an attractive, unmistakably **sound-reactive** Universe artwork on the existing SONORA Live screen.

**Critical product rule:** React to a sound's prominence **relative to the recent ambient level**. A soft bird call in quiet surroundings should be noticeable; constant traffic should settle to a restrained background, while an unusual foreground sound still produces a visible response. The visualizer is not a direction radar or a calibrated sound meter.

**Use the single microphone pipeline, RMS/acoustic features, YAMNet labels and existing Skia visualization from REQ-001.** Do not open a second audio session or change the classifier to fit the artwork. Never invent recognized categories.

## 2. P0 — smallest workable implementation

### A. Adaptive relative loudness — simple, not research-grade

- Consume REQ-001's actual normalized RMS/amplitude feature stream (about 20 Hz where available); convert safely to a log-level or equivalent compressed scale. Handle zero, invalid values and silence.
- Maintain a **simple slowly adapting ambient baseline** (e.g. bounded exponential moving average or tiny rolling history). Prefer a baseline that follows sustained changes over several seconds but is not immediately dragged upward by a short transient. Avoid a complex quantile engine or 20–30-second calibration requirement.
- Compute foreground contrast as current level minus ambient baseline; map it through a bounded smooth curve to visual intensity **0–1**, with a small noise gate, faster attack and slower release.
- Constant loud ambience must gradually calm rather than keep the artwork saturated; quieter surroundings must regain sensitivity. Begin rendering instantly: no blocking calibration screen.
- Sound-class labels/icons are independent of the intensity value and must remain visible even if the artwork is subtle.
- This adaptation is **artistic only**, never an adjustment to YAMNet scores, event thresholds, haptics or safety alerts.

### B. Extend the existing Skia renderer

- Keep the current working REQ-001 Skia component and improve it incrementally. Prefer a modest number of efficient reusable shapes/particles, glows, pulses and arcs; **no thousands-of-particles mandate, custom GPU shader or elaborate particle engine**.
- Use the relative intensity to change bloom/opacity/scale/motion fluidly.
- Support **two or three visual motif families** chosen only from categories actually surfaced by REQ-001 (e.g. speech → lavender waves, music/impact → expanding pulses, environmental/nature → mint/gold drifting sparks). Unsupported/unknown category → neutral calm stars.
- Blend category changes gently; show elegant low-motion idle art when not listening. The artwork does not claim sound direction or distance.
- Integrate **Universe Dark** (navy, luminous mint/lavender/gold) and **Universe Light** (pearl, turquoise/lilac/soft gold). For this prototype, palettes may follow REQ-002 Light/Dark toggle; independent artwork palette control is deferred.
- Respect the already implemented REQ-001 Reduced Motion setting. Keep labels/controls outside the visual complexity.

### C. Performance and lifecycle

- Draw smoothly enough for a live demonstration; avoid expensive per-frame JS re-renders or unbounded allocations.
- Existing Start/Stop, background/interruption behavior and capture cleanup must continue to work. On Stop, settle the art without implying microphone access continues.
- On-device only; **no raw audio persistence/upload**. Do not add Sound Walk recording or export here.

## 3. P1 — only if genuinely ahead of schedule

- Slight category-specific motion differences beyond simple color/motif.
- Minor tuning of baseline/attack/release after testing quiet room versus steady background noise.
- Two or three tiny pure-logic tests for a quiet transient, sustained loud background and invalid/silent RMS, **only if they help prevent a real bug**.

Do not expand P1 into a full diagnostics or test project.

## 4. Explicitly deferred after prototype

Retain the full creative vision for later development, but it is **out of scope now**:

- Thousands of luminous particles, complex ribbons, shaders, deterministic seeded scenes, seven distinct category animations and simultaneous category blending.
- Robust 20–30-second lower-quantile ambient estimation, multi-timescale tuning, calibration curves, extensive environmental fixtures and detailed numerical telemetry.
- Independent Universe Light/Dark selection versus app theme, advanced accessibility polish and quantitative FPS/thermal benchmarking.
- Sound Walk cumulative artwork, Gallery, PNG/JSON export, location tracking, raw audio storage, cloud, reliable alarm recognition or directional sound radar.
- Native Android feature validation; keep shared code compatible without claiming Android works.

## 5. Prototype acceptance / stop conditions

- [ ] The artwork visibly responds to **real REQ-001 microphone energy** when available, not just a repeating timer.
- [ ] A modest transient is visible against quiet ambience; sustained loud ambience visibly settles after several seconds; sudden foreground changes remain responsive.
- [ ] At least **two supported category motifs** render correctly when genuine or explicitly labeled demo-category events arrive; unsupported sounds remain neutral.
- [ ] Light and Dark palettes render legibly; existing Start/Stop and Reduced Motion behavior are preserved.
- [ ] No extra microphone stream, raw-audio persistence or classifier rewrite.
- [ ] `npm run typecheck` passes and a short **manual** smoke check is performed. Avoid a large new test suite and extensive documentation.
- [ ] Handoff clearly distinguishes working live device evidence, simulated visual-demo fixtures, and unverified native YAMNet assumptions.

**Rule:** Stop at 50 minutes. Prioritize an attractive running iPhone demo over sophisticated algorithms. If native audio is blocked, demo the renderer with clearly labeled simulated feature/events while keeping the integration contract ready; never claim simulated labels came from live YAMNet.
