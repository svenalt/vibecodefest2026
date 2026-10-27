# REQ-012 host evaluation: full taxonomy and simultaneous sounds

Date: 2026-10-26. Model: pinned `yamnet.tflite` (SHA-256 `4d8b4a53…4faf`), run on the development Mac with TensorFlow Lite 2.16.2. **Host evidence only.** Nothing here was played to an iPhone or Android device; device QA is still open (see the end).

## Method

- `scripts/eval-yamnet-clips.py` generates 58 five-second, 16 kHz mono clips locally: 40 isolated (speech in six voices and three languages plus one quiet clip, synthesized music, bells, doorbell, sirens, phone ring, beeps, car horn, rain, wind, stream, engine, traffic, birds, crickets, knocks, claps, applause, glass, ticking, typing, silence, near-silence, room tone, white/pink/brown noise, mains hum, a pure tone) and 18 mixtures of two or three of them. Sources: numpy synthesis and the macOS `say` voices only, so the set is rights-clear and reproducible. Expected outcomes are **broad families**, not exact classes.
- Each clip is classified in the adapters' windows (15,600 samples, 7,800 hop, 9 windows), keeping the top 10 per window, best first with ties by lower index.
- `src/core/clipEvaluation.test.ts` replays every window through the shared normalization and tracker (`CLIP_REPORT=1 npx vitest run src/core/clipEvaluation.test.ts` prints the table below). The "six-category build" column replays the same windows through `HEAD` before REQ-012 (`3d42a48`).
- A clip is a hit when at least one expected family is shown at some point; clips expecting nothing must never show a sound.

## Summary

| | REQ-012 | Six-category build |
| --- | --- | --- |
| Isolated clips with an expected family shown | 21 / 40 | 14 / 40 (only the six could ever be shown) |
| Mixtures with an expected family shown | 15 / 18 | 14 / 18 |
| Mixture windows with two or more sounds shown | `speech+groove` (Speech + Music) | never (one category at a time) |
| Silence, near-silence, room tone | Quiet, nothing shown | Quiet, nothing shown |
| Speech clips (7) / music clips (4) | Speech 8/9 windows each; Music 8/9 each | identical |
| Strong claims (bang, siren, alarm, scream, crying, heartbeat) on any clip | none | n/a |

The original six behave as before on every clip that exercises them (same windows for Speech and Music; `speech+groove` now adds Music next to Speech; `speech+rain` shows Speech in 5 instead of 4 windows). No regression was found; the trade-off is that sounds which used to be "No confident sound" now get a label, which is the goal of REQ-012.

## Per clip

Shown = sounds on screen per window (out of 9; the first window can never show a sound, debounce). Quiet = windows in the Quiet state.

| Clip | Source | Expected families | REQ-012 shown | Hit | Six-category build shown |
| --- | --- | --- | --- | --- | --- |
| speech_alex | -20 dBFS | voice | Speech 8/9 | yes | Speech 8/9 |
| speech_samantha | -20 dBFS | voice | Speech 8/9 | yes | Speech 8/9 |
| speech_daniel | -20 dBFS | voice | Speech 8/9 | yes | Speech 8/9 |
| speech_karen | -22 dBFS | voice | Speech 8/9 | yes | Speech 8/9 |
| speech_anna_de | -20 dBFS | voice | Speech 8/9 | yes | Speech 8/9 |
| speech_kyoko_ja | -20 dBFS | voice | Speech 8/9 | yes | Speech 8/9 |
| speech_quiet_tessa | -38 dBFS | voice | Speech 8/9 | yes | Speech 8/9 |
| music_piano_chords | -20 dBFS | music | Music 8/9 | yes | Music 8/9 |
| music_band_groove | -20 dBFS | music | Music 8/9 | yes | Music 8/9 |
| music_drum_loop | -20 dBFS | music | Music 8/9 | yes | Music 8/9 |
| music_organ | -20 dBFS | music | Music 8/9 | yes | Music 8/9 |
| bell_strikes | -20 dBFS | signals | - | no | - |
| doorbell_ding_dong | -20 dBFS | signals | Music 6/9, Singing bowl 2/9 | no | Music 8/9 |
| siren_wail | -20 dBFS | signals | Theremin 3/9, Synthesizer 4/9 | no | - |
| siren_yelp | -20 dBFS | signals | - | no | - |
| phone_ring | -20 dBFS | signals | Synthesizer 8/9 | no | Music 6/9 |
| beeps_1khz | -20 dBFS | signals | - | no | - |
| alarm_3khz | -20 dBFS | signals | - | no | - |
| car_horn | -20 dBFS | signals, vehicles | Alarm 4/9, Phone 1/9 | yes | - |
| rain_synth | -20 dBFS | nature | Crackling 6/9 | yes | - |
| wind_synth | -20 dBFS | nature | Ocean 8/9 | yes | - |
| stream_synth | -20 dBFS | nature | Music 3/9, Synthesizer 5/9 | no | Music 8/9 |
| engine_idle | -20 dBFS | vehicles, machines | - | no | - |
| traffic_synth | -20 dBFS | vehicles | Pink noise 7/9 | no | - |
| birds_synth | -20 dBFS | animals | Pure tone 7/9 | no | - |
| crickets_synth | -24 dBFS | animals | Tone sweep 2/9 | no | - |
| knocks | -20 dBFS | household, impacts | Music 8/9 | no | Music 5/9 |
| claps_sparse | -20 dBFS | people, impacts | - | no | - |
| applause_synth | -20 dBFS | people | Crackling 7/9 | no | - |
| glass_clinks | -20 dBFS | impacts, signals | Ding 8/9 | yes | - |
| clock_ticking | -24 dBFS | machines, household | - | no | - |
| typing_synth | -22 dBFS | household | - | no | - |
| silence | digital zero | none | - | yes | - |
| near_silence | -72 dBFS | none | - | yes | - |
| room_tone | -52 dBFS | none | - | yes | - |
| white_noise | -20 dBFS | other | Static 8/9 | yes | - |
| pink_noise | -20 dBFS | other | Pink noise 8/9, Waterfall 1/9 | yes | - |
| brown_rumble | -24 dBFS | other, vehicles, nature, machines | - | no | - |
| mains_hum | -24 dBFS | machines, other | Music 8/9 | no | Music 8/9 |
| sine_1khz | -20 dBFS | other, signals | Beep 8/9 | yes | - |
| speech+music | mix: speech_alex + music_piano_chords (-3 dB) | voice, music | Music 8/9 | yes | Music 8/9 |
| speech+groove | mix: speech_samantha + music_band_groove (-4 dB) | voice, music | Speech 5/9, Music 4/9 | yes | Speech 5/9 |
| speech+traffic | mix: speech_daniel + traffic_synth (-6 dB) | voice, vehicles | Speech 8/9 | yes | Speech 8/9 |
| rain+traffic | mix: rain_synth + traffic_synth (-3 dB) | nature, vehicles | Fire 8/9 | yes | - |
| speech+rain | mix: speech_karen + rain_synth (-6 dB) | voice, nature | Speech 5/9 | yes | Speech 4/9 |
| music+birds | mix: music_organ + birds_synth (-3 dB) | music, animals | Music 8/9 | yes | Music 8/9 |
| speech+siren | mix: speech_alex + siren_wail (-6 dB) | voice, signals | - | no | - |
| speech+music+traffic | mix: speech_samantha + music_piano_chords (-4 dB) + traffic_synth (-8 dB) | voice, music, vehicles | Music 8/9 | yes | Music 6/9 |
| rain+wind+birds | mix: rain_synth + wind_synth (-3 dB) + birds_synth (-3 dB) | nature, animals | Rain 4/9 | yes | Rain 4/9 |
| applause+music | mix: applause_synth + music_band_groove (-3 dB) | people, music | Music 4/9 | yes | Music 4/9 |
| doorbell+speech | mix: speech_daniel + doorbell_ding_dong (-2 dB) | voice, signals | - | no | - |
| speech+white_noise | mix: speech_alex + white_noise (-10 dB) | voice | Speech 7/9 | yes | Speech 7/9 |
| music+engine | mix: music_band_groove + engine_idle (-4 dB) | music, vehicles | Music 8/9 | yes | Music 8/9 |
| speech+typing | mix: speech_karen + typing_synth (-4 dB) | voice, household | Speech 8/9 | yes | Speech 8/9 |
| birds+stream | mix: birds_synth + stream_synth (-3 dB) | animals, nature | - | no | - |
| phone+music | mix: phone_ring + music_piano_chords (-4 dB) | signals, music | Music 8/9 | yes | Music 8/9 |
| two_voices | mix: speech_daniel + speech_anna_de (-2 dB) | voice | Speech 8/9 | yes | Speech 8/9 |
| speech+room_tone | mix: speech_alex + room_tone | voice | Speech 8/9 | yes | Speech 8/9 |

## Confusions and poorly performing families

- **Synthetic tonal sounds become Music.** A synthesized doorbell, phone ring, siren sweep, stream of chirps, knocks and a 50 Hz hum are rated as Music, Synthesizer, Theremin or Singing bowl (all in the Music family). The six-category build showed "Music" for the same clips. Real recordings must be checked on devices before drawing conclusions about Bells and signals.
- **Bells and signals** are under-detected on synthetic stimuli: bell strikes, beeps and a 3 kHz alarm stay below 0.41 most of the time; a car-horn pattern shows "Alarm". The pure 1 kHz tone shows "Beep", which is what it is.
- **Impacts, Home and objects, People** (knocks, claps, typing, ticking) are rarely recognized: short synthetic transients are rated as Silence, Sound effect or Music.
- **Animals.** Synthetic birds and crickets are rated as tones ("Tone sweep", "Pure tone"). No real animal recordings were available on the host.
- **Broadband noise ↔ water.** Noise is reported as Pink/White noise and also as Waterfall/Ocean. The contradiction rule removes most of it; one pink-noise window still shows "Waterfall" (the model rates it 0.80–0.85 there, above Pink noise). Synthetic wind is rated "Ocean".
- **Crackly noise ↔ fire, fireworks, explosions.** Synthetic rain and applause reach 0.74–0.80 for Fireworks and Explosion. With the 0.85 gate they show "Crackling" or "Fire" (Nature) instead, never "Loud bang".
- **Masking in mixtures.** Speech at the same level as dense piano chords is often not confident (0.10–0.33), so `speech+music` shows only Music; `speech+siren` and `doorbell+speech` show nothing confident.

## Device QA still to do (iOS and Android)

Not run yet. Play the clips (`python3 scripts/eval-yamnet-clips.py --wav DIR`) and real recordings through a speaker, at about 1 m, and record the results here:

- [ ] Original six against the accepted baseline: speech, music, dog bark, applause, rain, bell (real recordings).
- [ ] New classes with real recordings across at least eight families: e.g. laughter, birdsong, cat, car or traffic, vacuum or fan, door knock, glass clink, doorbell, phone ringtone, water tap, thunder.
- [ ] Quiet room, room with a fan, street ambience: nothing false, Quiet where appropriate.
- [ ] Mixtures: speech + music, nature + traffic, a triple; more than one label when the model supports it, no duplicated hierarchy.
- [ ] Stop, background/return, injected failure (REQ-011): labels disappear at once; resumed sessions start clean.
- [ ] VoiceOver and TalkBack: primary announced once, new secondary sounds at most every 4 s, no repetition.
- [ ] Light and Dark, Live, Art + Sounds (secondary labels visible), Pure Art (no overlay), Reduce Motion.
- [ ] 10 min continuous listening: CPU, temperature, battery and frame rate compared with the six-category build (3d42a48). The per-inference JS work grows from one lookup to about ten candidates and a few small maps; the native work is unchanged apart from the iOS audit, one sort of 521 values that the old code already did.
