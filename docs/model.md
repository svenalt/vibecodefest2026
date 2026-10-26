# Pinned model: YAMNet (TFLite, fixed window)

One model artifact and one label map are shared by iOS and Android. Nothing is downloaded at runtime.

| File | Bytes | SHA-256 |
| --- | --- | --- |
| `assets/model/yamnet.tflite` | 4,126,810 | `4d8b4a53282dc83ef04e3e7dbc4fbc98082e34e44ed798e16c3a0cdd4c584faf` |
| `assets/model/yamnet_class_map.csv` | 14,096 | `cdf24d193e196d9e95912a2667051ae203e92a2ba09449218ccb40ef787c6df2` |

Check them with `npm run verify-model`.

## Sources

- Model: `https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite` (MediaPipe's model bucket, the YAMNet classification variant with embedded metadata and labels). Re-downloading on 2026-10-24 gave the same hash.
- Labels: `https://raw.githubusercontent.com/tensorflow/models/master/research/audioset/yamnet/yamnet_class_map.csv`, same hash.
- Upstream: https://github.com/tensorflow/models/tree/master/research/audioset/yamnet and https://www.kaggle.com/models/google/yamnet/tfLite/classification-tflite/1

## Model I/O

- Input: 15,600 samples = 0.975 s of mono, 16 kHz, float32 audio in [-1, 1].
- Output: 521 scores, in the order of `yamnet_class_map.csv` (and of `src/core/yamnet/labels.ts`, generated from it by `npm run gen-labels`).
- Scores are per-class sigmoid outputs. They are **not calibrated probabilities**.
- Scores are 8-bit quantized: only about 32 distinct values occur (…, 0.33, 0.41, 0.50, 0.59, 0.67, 0.74, 0.80, 0.85, …; measured on the host evaluation below). Thresholds only matter at these steps.

How the contract is checked:

- Automated (`src/core/yamnet/yamnet.test.ts`): the bundled label list equals the CSV in count and order; the taxonomy has exactly one entry per index 0–520, each carrying the pinned label.
- Offline, done once: the 521 labels embedded in the `.tflite` metadata matched the CSV, in order, with no mismatches.
- At runtime, on every result (`src/core/normalize.ts`): the class count must be 521, at most `YAMNET_TOP_K` (10) entries arrive, every index is an integer in 0–520 and appears once, every `(index, label)` pair equals the pinned label at that index, and scores and the timestamp are finite. A violation stops capture and shows an error instead of guessing.
- iOS, natively (`modules/soundcanvas-audio/ios/YamnetAudit.swift`, REQ-012): all classes MediaPipe returns are audited (exactly 521, each index once, finite score) before the top 10 are selected, best first with ties by lower index, the same rule as Android. Labels are checked in JS on iOS. `npm run check-ios-audit` compiles and checks the audit with `swiftc`, without Xcode.
- Top-K parity: `modules/soundcanvas-audio/test-fixtures/topk-parity.txt` holds five complete 521-score outputs (three real model windows, two constructed tie cases) and the top 10 every platform must pick. The Kotlin unit test, the Swift check and `src/native/nativePins.test.ts` read the same file; the pins test also keeps `TOP_K` equal in Kotlin, Swift and TypeScript.
- Android, natively, before anything reaches JS (`modules/soundcanvas-audio/android/.../YamnetContract.kt`): the model file's SHA-256 and the packaged label CSV's SHA-256 must equal the pins above; all classes MediaPipe returns are audited (exactly 521, each index once, label equal to the CSV, finite score) before the top 10 are selected, both on a silent warm-up window at start and on every result. `src/native/nativePins.test.ts` keeps the Kotlin pins equal to `scripts/verify-model.mjs`.

## Licence

- The YAMNet implementation in `tensorflow/models` is Apache-2.0.
- The bundled `.tflite` model embeds: "Apache License. Version 2.0 ... Copyright 2022 Google LLC."
- The [official Google/Kaggle model card](https://www.kaggle.com/models/google/yamnet/tfLite/classification-tflite/1) lists **Apache 2.0** for the TensorFlow Lite classification model, confirming the model-weight licence.
- The original AudioSet training annotations have separate CC BY 4.0 terms; they are **not included** in this repository.

For redistributed model artifacts retain the attribution and the Apache-2.0 licence text in [LICENSES/Apache-2.0.txt](../LICENSES/Apache-2.0.txt). This model and the upstream labels are not part of the MIT grant for AUVIONA's original source code.

## Taxonomy (REQ-012)

`src/core/yamnet/taxonomy.ts` (`TAXONOMY_VERSION = 2`) describes **every** YAMNet output, index 0–520, exactly once. Each entry holds the exact pinned raw label, a short display name, one of 11 broad **visual families**, a finer **subtype group** and a role. Groups and spans are written as raw labels, so drift in the pinned label list fails the tests.

| Family | Examples | Artwork |
| --- | --- | --- |
| Voices | speech, conversation, laughter, crying, shouting, crowd | lavender strands (waves) |
| People | clapping, applause, cheering, footsteps, coughing, breathing | gold pulses |
| Music | music, singing, every instrument, genre and style | aqua forms |
| Animals | dog, cat, birds, insects, farm animals | gold pulses |
| Nature and water | rain, wind, thunder, water, fire, liquids | mint particles |
| Vehicles and traffic | car, traffic, train, aircraft, engine | amber strands |
| Home and objects | door, dishes, typing, tap, keys, rustling | aqua pulses |
| Machines and tools | fan, vacuum, drill, clock, hum | mint strands |
| Bells and signals | bell, doorbell, phone, alarm, siren, horn, beep | gold pulses |
| Impacts | bang, glass, wood, thump, crash | amber pulses |
| Other sounds | noise, tones, sound effects, TV/radio | calm ambient |

- **Roles.** 509 classes are `sound`s that can be shown. `Silence` is the explicit quiet state and is never logged. Eleven `context` classes describe the room, the recording or unspecified background and are never shown or logged as sounds: Inside, small room; Inside, large room or hall; Inside, public space; Outside, urban or manmade; Outside, rural or natural; Reverberation; Echo; Noise; Environmental noise; Sidetone; Field recording.
- **Groups (deduplication).** Classes that describe one kind of source form one group, and a group is tracked and shown as one sound, named by its best-supported member: Dog, Bark, Howl, Bow-wow are one sound; Music, Musical instrument, Guitar, Jazz and Singing are one sound; Siren, Police car (siren), Ambulance (siren) are one sound. Generic parents (`Animal`, `Domestic animals, pets`, `Wild animals`, `Vehicle`, `Motor vehicle (road)`, `Hands`, `Mechanisms`, `Tools`) are umbrellas that give way to any specific sound of their family. At most one sound per family is shown, so related labels (Car + Engine + Traffic) never look like separate sources.
- **Display names.** Default: the raw label up to its first comma, without a parenthetical ("Fly, housefly" → "Fly"). The original six keep their names (Speech, Music, Dog barking, Applause, Rain, Bell).
- **Deliberate fallbacks.** A classifier score is not evidence for a weapon, a specific emergency service, a medical condition, a religion, a region or a mood, so these are shown with a neutral description: Gunshot, Explosion, Artillery fire → "Loud bang"; Machine gun, Fusillade → "Rapid bangs"; Police car, Ambulance, Fire engine, Emergency vehicle, Civil defense siren → "Siren"; Smoke detector, Fire alarm, Car alarm → "Alarm"; Heart murmur → "Heartbeat"; Dental drill → "Drill"; Snake → "Hissing"; Fart → "Body sound"; Mantra → "Chant"; Christian, Gospel, Carnatic, Bollywood, Traditional, Christmas, Wedding music, "Music of Africa/Asia/Latin America", Middle Eastern music and the mood classes (Happy … Scary music) → "Music".

## Recognition (REQ-012)

`src/core/normalize.ts` keeps the validated top 10 as ranked candidates (index, raw label, score, family). `src/core/eventTracker.ts` turns them into what is shown:

1. **Confidence gate.** A class counts as evidence for its group only at or above its threshold (most specific wins: raw label, group, family, default). Silence counts only as the best candidate. Context classes never count. A class in the top 10 below its threshold is ignored.
2. **Contradiction.** Water classes count only when they outscore the broadband-noise classes (White/Pink noise, Static, …) in the same inference.
3. **Smoothing and hysteresis, per sound.** A group becomes present after 2 supporting inferences out of 3 (about 1 s), stays while supported at 80 % of its threshold, is held 1.5 s after support ends and is then released. Each sound has its own onset, hold and release.
4. **Selection.** One sound per family (specific before umbrella), then the strongest families, at most three: one primary plus up to two secondary. Sounds already shown, and the primary, get a 0.1 head start, so near-equal sounds and names do not take turns. Ties are broken by onset time, then taxonomy order.
5. **Recent sounds.** A sound is logged once per presence when it is first shown (primary and secondary), not again within 4 s, newest first, at most 30, in memory only. Silence and context are never logged.
6. **States.** Quiet (`silence`), "No confident sound" (`none`) and capture/error (from the microphone state) stay distinct. Stopping, backgrounding or a failure ends the session and clears every present sound at once (REQ-011).

Several shown sounds are concurrent classifications, not a claim of several physical sources; nothing infers direction, distance or identity.

### Thresholds and their evidence

| Applies to | Threshold | Reason |
| --- | --- | --- |
| Default | 0.50 | The model's own decision point (logit 0); the lowest quantized level where it leans "present". |
| Original six (Speech, Child speech, Conversation, Music; Dog, Bark; Clapping, Applause; Rain, Raindrop, Rain on surface; Bell, Church/Jingle/Bicycle bell) | 0.5 / 0.45 / 0.4 / 0.4 / 0.35 | Values accepted on devices in REQ-001–010, unchanged. |
| Bells and signals family | 0.41 | The accepted bell level. No signal class reached 0.41 twice in any clip without a signal. |
| Alarm, Siren groups | 0.50 | Stronger real-world claims than other signals. |
| Bang, Pop groups (incl. Fireworks) | 0.85 | Synthetic rain and applause reach 0.80 for Explosion and Fireworks. |
| Broadband noise (White/Pink noise, Static, …), Water | 0.66 | Steady fans and rumble otherwise keep "Pink noise" on screen; pure pink noise reaches 0.85 "Waterfall". |
| Screaming, Heartbeat, Snake, Body sound groups; Crying | 0.66; 0.58 | Distressing or bodily claims: a false label costs more than a miss. |
| Silence | 0.50 | Unchanged. |

## Host evaluation (REQ-012)

`scripts/eval-yamnet-clips.py` generates 58 rights-clear clips locally (40 isolated, 18 mixtures of two or three sounds, across all families plus silence, room tone and noise) with numpy and the macOS `say` voices, runs the pinned model on the host (TensorFlow Lite 2.16.2) and stores each window's top 10 in `src/core/testing/fixtures/yamnet-clips.json`. `src/core/clipEvaluation.test.ts` replays them through the shared normalization and tracker on every `npm test`. Regeneration is deterministic. `--wav DIR` also writes the clips for playback during device QA. Results and the comparison with the six-category build are in [evaluation/req-012-host-evaluation.md](evaluation/req-012-host-evaluation.md).

This is host evidence on synthetic sounds, not device QA and not an accuracy benchmark: most synthetic signals, knocks and animal calls are not recognized as such by YAMNet.
