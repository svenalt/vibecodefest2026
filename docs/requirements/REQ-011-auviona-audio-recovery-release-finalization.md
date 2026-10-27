# REQ-011 — AUVIONA: audio recovery, reliable Stop persistence and final release configuration

**Status:** Implemented and covered by automated tests; device regression pending, not yet accepted
**Date:** 2026-10-25
**Priority:** P0 before public release
**Difficulty:** Medium–high (7/10): native failure handling and asynchronous lifecycle ordering
**Depends on:** REQ-008/009/010, accepted by the owner after physical-device testing.
**Baseline:** main `ed7b4c472e9795bc64228f03af5c7a0a7a04026b`; re-inspect current main before editing.

## 1. Owner decisions and scope

The owner confirmed on 2026-10-25 that all delivered functionality was tested on devices. REQ-001 through REQ-010 are accepted for their delivered product/device scope, including changes superseded by later requirements.

This new requirement is not implemented or accepted yet. It closes three review findings and completes release configuration. Preserve the accepted REQ-010 UI: only Listening, Appearance and About in public Settings; device-driven Reduce Motion; persistent current sound/status in immersive Art + Sounds; no Current sound button.

The user authorizes replacing `app.soundcanvas.poc`. Use **`ch.auviona.app`** for both `expo.ios.bundleIdentifier` and `expo.android.package`. Keep internal module names and Kotlin namespace `app.soundcanvas.audio` unless the build actually requires a change.

Privacy and Support pages already exist on **https://auviona.swarmz.cloud/**, as confirmed by the owner. Reuse those pages; do not create duplicate pages or invent contact details. Exact canonical page URLs must be read from the website footer/routes. The review environment could not retrieve the website (403); no guessed `/privacy` or `/support` paths have been verified.

## 2. P0-A — Fatal audio errors must stop capture and invalidate the current detection

Evidence: `modules/soundcanvas-audio/ios/AudioPipeline.swift` emits `sinks.error` on conversion/inference failures without tearing down. `SoundSession` records the message while capture remains listening; `micState` prioritizes listening. A source-level reproduction emitted `Inference failed` while listening: capture stayed listening, the UI reported Microphone ON and retained the last Speech event, with zero stop calls. This was a deterministic fake-input reproduction, not a hardware fault injection.

Requirements:
- Route fatal conversion/inference failures through one controlled native teardown path. Release the microphone, stop processing and emit a coherent terminal error state. Avoid locks/queue waits that deadlock when failure originates on the processing or inference queue.
- Scope asynchronous error/stop callbacks to their session generation: an old error cannot stop a newer session or overwrite its state.
- Shared session/UI must display a truthful failure, not an apparently healthy recognition state. Clear the current detection and live features; keep historical timeline entries only as history. Ignore late events from an ended/failed session.
- Explicit Start after failure must clear the old error and start exactly one session. Do not add an automatic retry loop on a persistent model failure.
- Check equivalent Android handling and keep the shared contract consistent.

Acceptance: inject conversion/inference failures, verify capture stops and Live/immersive views show failure without stale detection; successful explicit retry; late old-session callbacks cannot affect retry; no deadlock or haptic after failure.

## 3. P0-B — Reconcile after asynchronous Stop completion

Evidence: `ListeningController.reconcile` fires stop without awaiting/reconciling its completion. Reproduction: start; hold input.stop before it reports idle; background then foreground; finish stop. Result: desired=true, foreground=true, capture=idle, startCalls=1. Existing tests use a mostly immediate stop and miss this ordering.

Requirements:
- Track/serialize in-flight stops alongside starts; re-evaluate the latest desired/foreground state after asynchronous operations finish, including native stopping transitions.
- If the latest intent is on and foreground, resume exactly once after teardown. If Stop was requested or the app is backgrounded, remain stopped.
- Never overlap native sessions, start while teardown is still active, leak promises or spin on persistent failure. Initial foreground detection must require active state rather than assuming every non-background state is active.
- Preserve cancellation while permissions/model loading are pending and prevent duplicate foreground notifications from starting duplicate sessions.

Acceptance: delayed-stop reproduction, stopping-state variant, rapid transitions, explicit Stop during pending resume, pending start/permission cancellation, and final background state. Assert both final state and start/stop counts.

## 4. P1-C — Stop persistence failures must be observable and recoverable

Evidence: `PreferencesStore.update` swallows setItem failures. Reproduction: stored listening=true; setItem throws; user stops; restart from old stored JSON => listening=true again.

Requirements:
- Expose pending/success/failure persistence state and retry the latest preferences with bounded, ordered writes. An old queued write must not overwrite a newer Stop.
- Stop capture immediately even if storage is unavailable. Keep the in-memory intent off; never undo it because a save failed.
- Show a concise actionable message when Stop cannot be saved, e.g. “Listening is stopped, but this choice could not be saved for the next launch.” Offer Retry. Do not claim persistence succeeded before the write completed.
- Decide/document a conservative restart strategy for interrupted/failed writes, including whether to require an explicit Start on cold launch. Persisted Stop must remain authoritative; preserve existing preferences and REQ-010 migration.
- Do not promise crash-proof persistence when all durable writes fail: any remaining cold-start limitation must be explicit in the behavior and handoff.

Acceptance: failed and hung writes; failure followed by successful retry and restart; multiple ordered updates ending in Stop; no stale success/error messages; unreadable preferences remain fail-safe; no silent false promise of permanent Stop.

## 5. P0-D — App identity and real public links

- Replace the application identifiers in app.json with `ch.auviona.app` for iOS and Android. Update active documentation/tests/configuration references, not historical descriptions of the old ID.
- Preserve the EAS project association, version 1.0.0 and remote increment strategy. Regenerate native projects as appropriate; verify resolved native identifiers and signing configuration. Record a concrete portal/signing conflict if one exists; do not infer availability or ownership from the string alone.
- A new identifier installs as a different app: old preferences/permissions do not automatically migrate. Document this and verify fresh-install behavior. Do not promise continuity across package identities.
- Resolve the existing Privacy/Support canonical URLs from the website. Confirm each opens directly over HTTPS without authentication and shows the intended content. Set both constants in src/app/release.ts and matching URL fields in docs/release/app-store-metadata.md. If retrieval is unavailable, report the exact unresolved URL rather than guessing or treating a null link as complete.
- The owner has accepted the current device behavior: set PRE_RELEASE=false and retain genuine limitations. Keep validated optional haptics available. Do not remove safety/accuracy limitations or assert a completed binary privacy audit merely because device UX passed.
- Update stale “not tested on device”/“pages not published” statements in current-facing documentation. Preserve historical implementation records as dated evidence.

## 6. Acceptance and verification

- [ ] P0-A, P0-B and P1-C behavioral regressions covered by deterministic tests using genuinely asynchronous fake operations.
- [ ] Existing REQ-010 behavior and saved Stop migration preserved.
- [ ] `npm run typecheck`, `npm test`, `npm run verify-model` pass; record actual results.
- [ ] iOS native changes compile; Android checks run if native/shared integration changed. Record unavailable checks honestly.
- [ ] Both final native application identifiers resolve to ch.auviona.app; EAS association preserved; new-install implications documented.
- [ ] Both existing public page URLs are verified, configured and reflected in metadata; Settings opens them correctly.
- [ ] PRE_RELEASE=false; About is appropriate for the accepted product; limitations remain.
- [ ] Focused device regression of changed error/recovery behavior and identifier/links is recorded. The previous broad device acceptance remains valid and is not reopened.
- [ ] Final handoff separates implemented fixes, owner acceptance, automated evidence, and any remaining binary/privacy/signing or store-console work.

The iOS MediaPipe binary privacy/telemetry audit, signed-archive validation, App Store Connect metadata entry and actual submission are distinct from device acceptance; carry forward outstanding evidence in the release checklist. This REQ authorizes code/config/docs work, not public store submission. Do not mark these new fixes complete before implementation and verification.
