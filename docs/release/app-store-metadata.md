# AUVIONA 1.0 App Store metadata (draft)

Status: **draft for owner review.** Do not enter it in App Store Connect until the release checklist gates are cleared. Each claim below matches the current app; if the app changes, update this file.

The Privacy Policy and Support URLs are the canonical URLs the live site declares for its footer pages (checked 2026-10-25: HTTPS, no sign-in, one same-site redirect to the trailing-slash path, intended page shown). Their **content** still describes the app as unreleased ("No public app release exists yet, so a final policy will be published with the first release"; the support page says there is no public release) and the privacy page still lists a "motion" preference that REQ-010 removed. The owner must update both pages before submission; see the release checklist.

## App information

| Field | Draft |
| --- | --- |
| Name | AUVIONA |
| Subtitle (≤30) | See sound as living art |
| Primary category | Lifestyle (alternative: Entertainment) |
| Age rating | 4+ (questionnaire: no objectionable content, no web access in app, no user-generated content, no gambling, no contests). Owner to confirm in the questionnaire. |
| Privacy Policy URL | https://auviona.swarmz.cloud/privacy |
| Support URL | https://auviona.swarmz.cloud/support |
| Marketing URL | optional: https://auviona.swarmz.cloud (owner decision) |
| Copyright | _pending owner: "© 2026 <operator>"_ |
| Price | _owner decision_ |
| Devices | iPhone only (`supportsTablet: false`), iOS 16.4+ |

## Description

> AUVIONA turns the sounds around you into flowing, living artwork, with clear labels and icons for what it hears.
>
> Open the app and AUVIONA listens through your iPhone's microphone and recognises a small set of everyday sounds: speech, music, a barking dog, applause, rain and bells. Each confirmed sound appears as a label and icon, joins a short list of recent sounds, and shapes the light ribbons of the live artwork. Go full screen with immersive mode for pure art, or art with sound captions.
>
> Private by design: sound is analysed on your iPhone. Audio is held in memory only long enough to be analysed and is never recorded, saved or uploaded. There is no account, no ads and no tracking, and it works offline.
>
> You are in control: stop listening at any time in Settings and AUVIONA stays off until you start it again. The microphone is only used while the app is open. Choose Dark or Light and optional haptic alerts; the artwork follows your iPhone's Reduce Motion setting.
>
> Important: AUVIONA is made for art and general sound awareness. It can miss or mislabel sounds and is not reliable for emergencies, alarms, safety-critical decisions, navigation or medical decisions.

Do not add claims about accessibility for deaf or hard-of-hearing people, sound direction or distance, accuracy, or medical or clinical use. The app does none of these, or they have not been validated. Mention haptic alerts only if they were physically validated (see checklist).

**Promotional text (≤170):** Sound, made visible. AUVIONA paints the sounds around you as living light and labels what it hears, all on your iPhone.

**Keywords (≤100):** sound,visualizer,audio art,ambient,listen,microphone,generative art,sound labels,offline,relax

## Screenshots

To be captured from the **TestFlight build on an iPhone**, 6.9" or 6.7" display set, Dark and Light. Use real detections only, never mocked UI:

1. Live with a confirmed sound (e.g. Music) and the artwork.
2. Immersive Pure Art.
3. Immersive Art + Sounds with the current-sound card.
4. Live sound list (recent sounds).
5. Settings: Listening, Appearance, About with the limitation text.

Not yet taken.

## App Review notes (draft)

> AUVIONA needs microphone access to work. On first launch iOS asks for permission; after you allow it, listening starts automatically while the app is open. To test recognition, play speech, music, applause, a dog bark, rain or a bell sound near the iPhone (a YouTube video on another device works). The label and icon update within about one second; other sounds show "No confident sound" and quiet rooms show "Quiet".
>
> Listening is controlled in Settings (gear icon, top right): "Stop listening" turns the microphone off, and it stays off across app switches and relaunches until "Start listening" is pressed. The microphone is never used in the background. If the audio pipeline fails, listening stops, the screen shows the problem, and "Start listening" tries again.
>
> All analysis runs on-device with a bundled model (Google YAMNet via MediaPipe). The app makes no network requests, has no account and collects no data. Settings > About links to the privacy policy and support page.
>
> If permission is denied, the app explains this and offers a button to open iOS Settings.

No demo account is needed.

## App Privacy ("nutrition label")

Draft answer: **Data Not Collected.** This is conditional on the binary audit in the release checklist (MediaPipe pods, final archive). Basis:

- Microphone audio is processed on-device in memory and never leaves the device or gets stored.
- The only stored data are local preferences (theme, listening on/off, haptic alerts), never transmitted.
- No analytics, crash-reporting, advertising or tracking SDKs; no network requests.
- Crash and usage data that Apple collects from users who opt in to share with developers is Apple's processing. It does not count as collection by the app.

Tracking: **No.**

## Rights and licences to confirm

- YAMNet weights licence (Apache-2.0 per model metadata; Kaggle page not confirmed). See `docs/model.md`.
- AudioSet annotations: CC BY 4.0 (attribution in support page or acknowledgements, if required).
- MediaPipe (Apache-2.0), React Native (MIT), Expo (MIT), Skia (BSD-3), AsyncStorage (MIT): include an acknowledgements page if the owner wants one.
- App icon and splash artwork: confirm who created them and that commercial use is permitted.
- Name AUVIONA: trademark and collision review is a separate legal gate.
