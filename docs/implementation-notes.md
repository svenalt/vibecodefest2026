# REQ-001 implementation notes

Last updated: 2026-10-24. Automated checks were run on a Mac without Xcode, so nothing below marked "not verified" has been built or run on an iPhone.

## Status against the acceptance criteria

| Criterion | Status |
| --- | --- |
| Fresh checkout installs; documented iOS build succeeds | `npm install` works. The iOS build is **not verified** (no Xcode here). `expo prebuild --platform ios --no-install` succeeds and writes the microphone usage string into `Info.plist`; `expo-modules-autolinking` finds the `SoundCanvasAudio` pod. `pod install` and the Xcode build have not run. |
| Expo project targets iOS and Android; platform code isolated | Done. One Expo app with `ios` and `android` config. Only `src/native/createSoundInput.ts` checks the platform; Swift lives in `modules/soundcanvas-audio/ios`. |
| Pinned YAMNet model and labels; I/O documented; Android design | Done. See `model.md` and `android-adapter.md`. Licence of the weights: Apache-2.0 text is embedded in the model metadata; the Kaggle page itself is **not confirmed**. |
| Development build launches on an iPhone 13 Pro Max | **Not verified.** |
| Permission granted and denied paths usable | Logic covered by unit tests with fakes. The real iOS prompt and denial UI are **not verified on a device**. |
| Start activates a live stream; Stop releases it | Logic and ordering covered by tests with fakes; the Swift teardown has not run. **Not verified on a device.** |
| Three categories demonstrated live on an iPhone | **Not verified.** |
| Live classification runs bundled YAMNet | The code path uses the bundled model through MediaPipe; **not run**. |
| Visualization responds to live energy and two categories; can be reduced | Implemented (animated, reduced, off, follows the device's Reduce Motion). Its state model is unit-tested; the Skia rendering has **not been seen on a screen**. |
| Labels and icons legible independent of the visualization | By construction: the visualization is hidden from accessibility and the text card does not depend on it. Not checked with VoiceOver. |
| Runs offline; no audio persisted or uploaded | By construction: no network calls or storage in the code; model is bundled. **Not verified** with networking disabled on a device. |
| Automated tests for mapping, ordering, schema, smoothing, cooldown, unknown | Done: 57 tests in 7 files (`npm test`), using fake adapters impersonating iOS and Android. |
| Type checking and tests pass; latency recorded | `npm run typecheck` and `npm test` pass. **Latency has not been measured** (see below). |

Also checked on this Mac: the pure-Swift `WindowBuffer` and `FeatureExtractor` were compiled with `swiftc` and exercised with a throwaway harness (window size, average hop of about 7,850 samples with 1,365-sample chunks, 20 feature frames per second, band split for 100 Hz / 800 Hz / 5 kHz tones, RMS of a sine, silence). That harness is not in the repo. All other Swift files pass `swiftc -parse` only; they were never type-checked against the iOS SDK.

## iOS YAMNet runtime details (as designed)

- Runtime: MediaPipe Tasks Audio, pod `MediaPipeTasksAudio` 1.0.0 (iOS 15+; the app targets 16.4), audio-clips mode.
- Each inference gets exactly one 15,600-sample, 16 kHz, mono, float32 window; hop is 7,800 samples (0.4875 s). Expected steady-state cadence is one result about every 0.49 s after the first window (about 0.98 s of audio plus inference time). One inference runs at a time; windows that arrive while one is running are dropped.
- Capture is one `AVAudioEngine` tap (4,096-frame buffers at the hardware rate), converted to 16 kHz mono by `AVAudioConverter`. The same samples feed the feature extractor (50 ms frames, about 20 Hz to JS) and the window buffer.
- Native sends the top 10 classes per inference plus the class count (all 521 are requested from MediaPipe with `maxResults = -1` and `scoreThreshold = 0`).

## Latency

Not measured. The app records them: the diagnostics view shows time from Start to first result and the last and mean interval between results. Record the numbers here after the first run on the iPhone:

| Metric | iPhone 13 Pro Max |
| --- | --- |
| Start to first result | _not measured_ |
| Mean update interval | _not measured_ |

## Things most likely to need a fix on first device build

These are guesses from reading code and headers, not observed failures.

1. **MediaPipe API names.** The Swift calls (`AudioClassifierOptions`, `AudioData(format:sampleCount:)`, `load(buffer:offset:length:)`, `MPPFloatBuffer(data:length:)`, `classify(audioClip:)`) were taken from the MediaPipe `master` headers. The pod is 1.0.0; if a signature differs, the compiler will say so in `YamnetClassifier.swift`.
2. **Class count.** The runtime check requires exactly 521 classes. If MediaPipe filters some categories despite `scoreThreshold = 0`, the app will stop with a "Model reported N classes" error. Loosening that check is a one-line change in `src/core/normalize.ts`, but decide it from what the device reports.
3. **Label names.** The check compares MediaPipe's `categoryName` with the CSV `display_name`. If the runtime reports something different (for example the MID instead of the name), you will see "Class order mismatch" immediately.
4. **Static frameworks.** The pod is a static framework. If CocoaPods complains about Swift pods and static libraries, set `ios.useFrameworks: "static"` through `expo-build-properties`.
5. **Thresholds.** Per-category thresholds in `src/core/eventTracker.ts` are starting values, not tuned on real sounds.

## Known limitations

- Foreground only. The microphone stops when the app leaves the foreground, on audio interruptions and on route changes. Returning to the foreground starts listening again (and clears the in-memory timeline); after an interruption or route change the user has to press Start again.
- Mono analysis only; no direction, distance or radar.
- Only six demo categories plus silence are surfaced; everything else is shown as "No confident sound".
- Icons are a small line-icon set drawn with Skia (REQ-006); they are decorative and always paired with text.
- Raw labels and scores appear only in Settings > Diagnostics (REQ-006), never in the main UI.
- Not a safety, emergency, navigation or medical system.

## Follow-up

- Native Android adapter and device testing (`android-adapter.md`).
- Tune thresholds and extend the taxonomy toward 10-15 categories after device testing.
- Check usability with deaf and hard-of-hearing users before making any assistive claims.

# REQ-005 Universe V2 notes

Last updated: 2026-10-24. Not yet run on an iPhone; frames were rendered headlessly with CanvasKit (the WASM build of the same Skia API) to review the composition in Dark and Light.

## What changed

- `src/viz/vizModel.ts`: the same adaptive ambient baseline now also tracks `peak`, so short taps register. Onsets (a rise of the foreground intensity above its recent value) emit at most 6 short-lived **bursts**, rate-limited to about 4 per second. `bands` is now band energy (tone balance × intensity), so Forms is ~0 in silence. `flow` drives drift and advances faster with sound; `time` only does slow breathing. `presence` fades the scene between listening and stopped.
- `src/viz/universePainter.ts`: draws the scene into one `SkPicture` per frame with reused paints, gradient sprites and path builder; the gradient background and far stars are a cached picture. Layers: nebula, parallax stars, central halo, music orbs, light ribbons, rain motes, glints, bursts.
- `src/viz/SoundCanvasView.tsx`: React renders one `<Picture>` and swaps a single prop per frame (previously ~100 elements and paths). Drops to 15 fps when stopped and settled.

## Motifs (real detections only)

| Detection | Treatment |
| --- | --- |
| Speech | Two extra strands fade in; all ribbons drift toward lavender, widen and ripple outward from onsets |
| Rain | Mint and gold motes drift down, faster and brighter with sound; onsets scatter a small spray |
| Bell, dog bark, applause | Thin expanding rings with glints, only on onsets; no rings in silence |
| Music | Three soft orbs, each swelling with its own band's energy |
| Unknown / quiet | Neutral lavender and white bloom on onsets |

## Not verified on device

- Frame time and JS load on the iPhone 13 Pro Max. Headless recording took about 1.8 ms per frame in WASM; native JSI cost is not measured.
- Memory: a new `SkPicture` per frame is left to garbage collection. Watch memory in Instruments during a long session.
- Onset sensitivity (`ONSET_MIN`, `PEAK_WEIGHT`) is tuned on synthetic inputs only.

# REQ-006 Premium UI and immersive mode notes

Last updated: 2026-10-24. Typecheck and unit tests pass; **nothing in this section has been run on an iPhone or Android device**, and there was no simulator or web target on the development Mac. The Universe was rendered headlessly with CanvasKit at card size (396×389) and full-screen iPhone 13 Pro Max size (428×926) in both themes to confirm the painter recomposes for a tall viewport without stretching.

## What changed

- **Live-only navigation.** The REQ-004 four-tab shell is gone: no bottom bar, and Sound Walk and Gallery are removed (`TabBar.tsx` and `ComingSoonScreen.tsx` deleted). Live is the root screen. A gear button ("Open settings") at the top right of the Live header opens Settings as a secondary screen with a "Back to Live" button. View state is a pure reducer (`src/app/navigation.ts`, unit-tested): Android back leaves immersion, then Settings, then the app. Live stays mounted and paused while Settings is open, and `SessionProvider` stays above both, so switching never starts or stops listening or clears recent sounds.
- **Microphone status only in Settings** (product decision, overriding the REQ-006 text that asks for it on Live and in immersion). Live and immersive mode have no ON/OFF indicator. They still show a blocked permission (with "Open system settings") and capture errors, so failures are not silent. The sound tile states plainly when nothing is being heard ("Not listening"), and Live offers "Open Settings to start listening" when listening is off or has failed.
- **Immersive mode.** An expand button at the top right of the Live artwork ("Enter immersive mode") makes the same artwork fill the screen. `LiveScreen` keeps one tree: the header, sound tile, notices and timeline unmount, and the artwork's container grows from a fixed height to `flex: 1`. The status bar is hidden while immersed. `SoundCanvasView` always fills its parent and measures its own size, so the one painter is rebuilt once for the new size while `VizState`, the frame loop and the session stay as they are. No start/stop, timeline reset, second canvas or second loop.
- **Immersive overlay** (`ImmersiveOverlay.tsx`): an always-visible Exit button at the top right inside the safe area, on an opaque scrim, plus the blocked/error notices above.
- **Pure Art / Art + Sounds**: a two-option radio group at the bottom (not persisted). Art + Sounds shows an icon and category caption for about 3 s on a real newly confirmed category (`captionKey` in `status.ts`: never for silence, unknown or a stopped mic), and a "Current sound" button to show the current state again. Captions do not fade with Reduce Motion or Reduced visualization.
- **Visualization setting**: Off removes the artwork and the expand button, explains why on Live, and ends immersion. Reduced shows the still artwork full screen.
- **Live polish**: `CurrentSound` is a compact tile with plain-English state ("Detected just now", "Listening for sounds", "Not listening", "Microphone blocked", "Listening stopped") and no raw label or score. `Timeline` shows the latest 3 sounds with a session-time stamp; "Show all N" expands the full in-memory list.
- **Icons and tokens**: one 24 pt line-icon set in `icons.ts` (including a generated gear), drawn with Skia by `Icon.tsx` (no font or new native dependency). `theme.ts` adds `SPACE`, `RADIUS`, `TYPE` scales and scrim, muted-card and icon-well colours. Settings uses grouped cards with icons.
- **Diagnostics** now also shows the current event's raw label and score.

## Not verified on device

- iPhone 13 Pro Max screenshots of Live Dark, Live Light, Settings, Immersive Pure Art and Immersive Art + Sounds: **not taken**.
- Android hardware back through immersion → Settings → Live.
- Whether `StatusBar hidden` takes effect on iOS in this build, and how hiding it shifts Android insets.
- Painter rebuild cost when toggling (one `UniversePainter` per size change) and any frame hitch on entering or leaving.
- VoiceOver/TalkBack order in the overlay, large Dynamic Type layouts and real contrast over the moving artwork.
- Skia icon rendering cost: each icon is a small `Canvas` (about 8 on Live).

