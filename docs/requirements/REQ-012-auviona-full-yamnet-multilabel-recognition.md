# REQ-012 — AUVIONA: full YAMNet sound taxonomy and simultaneous sound recognition

**Status:** Ready for implementation — not yet implemented or accepted  
**Date:** 2026-10-26  
**Priority:** P1 — capability expansion; do not implicitly make this a new App Store release gate  
**Difficulty:** High (8/10) — multi-label temporal logic, taxonomy design and device validation  
**Recommended Claude Code:** Opus 5.5, High effort  
**Depends on:** Accepted REQ-001–010 baseline and the current 521-class on-device YAMNet pipeline; preserve the REQ-011 recovery and release-configuration fixes. Re-inspect current main before implementation.

## 1. Goal and interpretation

Sven wants AUVIONA to recognise as many everyday sounds as possible, instead of exposing only six categories. The bundled YAMNet model already produces **521 independent class scores**, but the current application deliberately maps only 15 YAMNet labels to speech, music, dog bark, applause, rain and bell; all other classes become unknown.

Expose the **full existing 521-class YAMNet vocabulary** for classification and human-readable presentation, and recognise **more than one credible sound in the same scene** (e.g. speech + music + traffic) without cluttering the artwork. Retain the promise of local, offline processing. This does **not** mean that literally every possible sound can be identified, that all 521 classes are equally accurate, or that model scores are calibrated probabilities.

Implementation must be technically honest: confidence gating, unrecognised sound states and realistic communication are essential. No new foundation model is required for this REQ.

## 2. Product and design constraints

- Maintain the current AUVIONA identity, minimal Live-only navigation, Light/Dark styling and immersive Art / Art + Sounds flows.
- Preserve REQ-010's simplified Settings: do **not** restore the removed Visualization / Diagnostics settings or the "Current sound" button. In immersive Art + Sounds, recognised sounds remain directly visible.
- AUVIONA is an artistic sound-accessibility experience, **not a safety alert or reliable emergency detector**. Do not infer sound direction, distance or speaker identity.
- Microphone processing stays on-device on iOS and Android; no audio uploads, cloud fallback, server inference, automatic raw-audio storage, runtime model downloads or newly required accounts.
- Existing YAMNet TFLite artifact, 521 ordered labels, pinned SHA-256 checks and license/attribution remain intact. Do not edit generated labels by hand or weaken contract validation.
- Existing recognised six categories and their visual signatures should continue to work; accepted device behavior is not re-opened wholesale.
- Prefer meaningful, stable results over maximum label throughput or jittery guesses.

## 3. Required behavior

### A. Full vocabulary and semantic hierarchy

1. Make all 521 model outputs eligible for recognition (subject to confidence filtering); do not maintain a six-category allowlist. Reuse the pinned class IDs/labels from src/core/yamnet/labels.ts.
2. Introduce a versioned, deterministic taxonomy with:
   - unique YAMNet class index and exact pinned raw label;
   - concise user-facing English display name (a safe raw-label fallback is acceptable);
   - a **broad visual family** used by the renderer (examples: human/voice, music, animals, nature/weather/water, vehicles/transport, household/objects, machines/tools, alarms/impacts, other);
   - optional finer subtype; no requirement for 521 animations or icons.
3. Keep taxonomy exhaustive and validated: each model index 0–520 is covered exactly once; preserved source labels and ordering agree with the model; silence is handled explicitly and is never logged as a foreground event.
4. Existing six prominent labels retain intuitive display names. Avoid showing opaque AudioSet taxonomy strings, unintelligible aliases or redundant hierarchy in the primary UI.
5. Do not silently map semantically sensitive, ambiguous or irrelevant classifications to strong real-world claims; document display fallbacks and exclusions.

### B. Multi-label inference and reliable selection

1. YAMNet has multi-label scores. Preserve a ranked collection of candidates per inference, including class index, raw label, score, timestamp and visual family; do **not** collapse immediately to one mapped six-category result.
2. iOS and Android already return the native top 10. Audit their ordering/contract and keep a configurable top-K (default 10 is acceptable) without transmitting all 521 scores across the native bridge unnecessarily. The complete model output is still checked where currently required; do not remove Android contract audits or iOS/JS label validation.
3. Apply explainable **confidence filtering** (scores are not calibrated probabilities), temporal smoothing and hysteresis. Thresholds may be tuned globally or by family/class with documented reasoning and test evidence. A low-confidence class must not appear just because it is in the top 10.
4. Allow simultaneous independent sound events: select at most **three** credible, distinct displayed labels at once, with one primary sound and optional secondary sounds. Deduplicate overlapping parent/child or synonymous YAMNet labels (e.g. Music + Musical instrument) to avoid pretending these are separate sources.
5. Do not infer that different class scores necessarily represent separate physical sound sources. Co-occurrence is only concurrent sound classification.
6. Handle sound onset, stable presence, hold and release independently for concurrent labels; prevent rapid switching and duplicate event spam. Keep a bounded session-only Recent sounds list with sensible per-label cooldowns.
7. For silence, weak/contradictory model evidence, model failure or stopped listening: clearly distinguish Quiet, No confident sound, and Capture/Error states. Never retain a stale active label after a stopped/failed session; preserve REQ-011 failure recovery behavior.
8. Keep performance bounded in a continuous microphone session. If bridge/UI update frequency needs throttling, do so without sacrificing foreground sound responsiveness.

### C. Visualisation and interface

1. Map detailed labels to a modest number of visually coherent **families**, retaining the existing visual language of responsive light ribbons, gentle pulses, particles and ambient motion.
2. Keep the existing sound-driven acoustics (relative ambient baseline, RMS/peaks, low/mid/high bands, smooth attack/release) as the primary motion source. Semantic classifications modulate colour/motif, not fabricate activity in silence.
3. For several credible sounds at once, blend visual influences **subtly and predictably**. A stable primary sound drives the main accent; secondary sounds add restrained nuance. No flickering, competing full-screen scenes or 521 bespoke animations.
4. Live and immersive Art + Sounds show the primary human-readable label and up to two secondary labels in an accessible, compact design. Immersive Art alone stays art-focused and does not gain intrusive overlays.
5. Reuse accessible text semantics; ensure useful VoiceOver/TalkBack announcements without rapid repetition. Respect system Reduce Motion, existing Light/Dark, start/stop and lifecycle behavior.
6. If icons are expanded, use a compact icon set for families rather than maintaining one icon per class. UI text should clearly separate recognition from visual mood.

### D. Platform, compatibility and documentation

1. Implement changes in shared TypeScript normalization, taxonomy, event tracking, presentation and visualization wherever possible; avoid platform-specific feature divergence.
2. Review src/core/types.ts, src/core/normalize.ts, src/core/yamnet/taxonomy.ts, src/core/eventTracker.ts, src/viz/vizModel.ts and native top-K adapters, plus all relevant consumers/tests. These are pointers, not a complete file list.
3. If data types and persisted/session structures change, migrate compatibly and preserve stop/listening intent. No new permissions are justified by a larger taxonomy.
4. Keep iOS/Android model-parity and the existing 16-kHz mono / TFLite contract. Report any difference from the current verified model hashes.
5. Update README, docs/model.md, user-visible About/Support/store draft and sample/demo language **only after the implemented behavior is verified**. Do not advertise literally "all sounds" or imply the browser demo performs native microphone classification. Keep the website as a separate project; no web publication in this REQ.
6. Preserve the MIT application licensing and separate Apache-2.0 YAMNet/model notices. Do not silently introduce an alternative model/license.

## 4. Verification and acceptance criteria

### Automated

- [ ] Taxonomy is exhaustive: exactly 521 unique IDs, correct pinned raw labels, stable family and display mappings; no index/name drift.
- [ ] Every one of the 521 class indices can become a candidate through the normalization path (when sufficiently ranked/confident). No fixed six-category allowlist remains.
- [ ] Multiple high-confidence independent candidates are retained and displayed; synonymous parent/child detections are merged; maximum three labels displayed.
- [ ] Below-threshold, contradictory, unknown, silence and stale predictions produce honest fallbacks with no false positive forced by a top-K rank.
- [ ] Multi-label tracker tests cover temporal smoothing, equal scores/ties, rapid changes, overlapping events, repeated events, timestamp boundaries, hold/release and cooldown.
- [ ] Native/JS contracts reject mismatched class count/index/label/nonfinite scores and preserve exactly the intended top-K. iOS/Android parity fixtures cover same input predictions where feasible.
- [ ] Visualization tests cover family mapping, simultaneous sound blending, quiet/unknown/stopped behavior, Reduce Motion, Light/Dark and immersive label visibility.
- [ ] REQ-010 Settings/immersive regressions and REQ-011 stop/error/lifecycle regressions remain green.
- [ ] Run and report actual results for npm run typecheck, npm test, npm run verify-model, relevant iOS/Android native tests/builds. Do not claim unperformed device QA.

### Device / qualitative QA (iOS and Android)

Prepare a reproducible small audio test set (rights-cleared or locally generated/recorded) with representative examples across **at least eight broad families**, plus silence, ambient noise, confusable classes and overlapping sound pairs/triples. Aim for at least 30 isolated test clips and 15 mixtures; document sources and expected **broad families** instead of assuming a perfect 521-class benchmark.

- [ ] Current six sounds still work at least as well as the accepted baseline in focused regression testing, or a quantified, explicitly justified tradeoff is reported.
- [ ] Representative new classes appear when confidence is sufficient and do not become false detections in silence/noise.
- [ ] Concurrent speech + music, nature + traffic and other suitable mixtures can show more than one credible sound when supported by model evidence, without duplicated hierarchy.
- [ ] Active labels disappear on actual Stop, background/pause and injected failure; resumed sessions behave correctly. No microphone/audio persistence regression.
- [ ] Listening responsiveness, sustained CPU/thermal/battery behavior and rendering smoothness are compared with the existing six-category build on physical devices; regressions are measured, not concealed.
- [ ] Visuals remain calm/legible in Light/Dark and both immersive modes; accessibility tested on each platform where available.

**Acceptance rule:** "Supports the full 521-class taxonomy" means every pinned output is technically reachable and confidence-gated, **not** guaranteed accuracy for every class. Record a confusion/failure summary and any poorly performing families. Sven's device acceptance of earlier REQs does not constitute acceptance of this new functionality.

## 5. Implementation sequence / handoff

1. Snapshot baseline classifications/performance, inspect actual iOS/Android output pipeline and lock taxonomy/data contract.
2. Implement exhaustive taxonomy plus structured, confidence-gated multi-label normalization; add tests.
3. Upgrade tracker, current sound and Recent sounds to one primary plus up to two secondary labels; add tests.
4. Extend visual family mapping and small UI adjustments while preserving accepted immersive/settings behavior.
5. Exercise device cases, tune thresholds with evidence, document limitations and results.

**Out of scope:** CLAP/open-vocabulary audio-language models, speech transcription, identifying people, sound direction/location, automatic safety alerts, cloud analytics, website publication, App Store submission, or changing model weights. A future separate REQ can evaluate open-vocabulary models once 521-class performance is measured.

**Definition of done:** Implemented on both mobile platforms, automated gates pass, evidence-based focused device QA is recorded, user-facing claims are truthful, and owner acceptance is requested for this new REQ. Until then status remains Ready for implementation.