# No MediaPipe usage telemetry in Android release builds

`com.google.mediapipe:tasks-core` (every version from 0.10.14 to 1.1.1 on Google Maven, including the pinned 1.0.0) creates a `TasksStatsProtoLogger` for every task. Its `RemoteLoggingClient` sends session start/end and invocation reports (task name and mode, app package and version, platform, latency counters; no audio) to Google through `com.google.android.datatransport` (the CCT backend) whenever the device is online. The MediaPipe API has no switch to turn it off.

AUVIONA's privacy policy says the app makes no network requests and contains no analytics. For **release** builds, `build.gradle` therefore excludes the `com.google.android.datatransport` group from the MediaPipe dependency, and this folder (a release-only source set) provides no-op versions of exactly the eight types `RemoteLoggingClient` links against (checked with `javap -v` against `tasks-core-1.0.0.aar`, and against the compiled stand-ins):

| Type | Member used by MediaPipe |
| --- | --- |
| `runtime.TransportRuntime` | `initialize(Context)`, `getInstance()`, `newFactory(Destination)` |
| `runtime.Destination` | parameter type |
| `cct.CCTDestination` | `INSTANCE` |
| `TransportFactory` | `getTransport(String, Class, Encoding, Transformer)` |
| `Transport` | `send(Event)` (drops it) |
| `Event` | `ofData(Object)` |
| `Encoding` | `of(String)` |
| `Transformer` | lambda target `apply(Object)` |

Nothing is stored, scheduled or sent. MediaPipe still counts its stats in memory; they are discarded.

**Debug builds are different.** `expo-dev-client` brings Google ML Kit (the dev launcher's QR scanner), which depends on the real datatransport library, but only in debug. A debug APK must not contain both copies: the debug dexer does not reject the duplicates, and which one loads would depend on dex order (seen in the first build of this module). So debug builds use MediaPipe with its normal dependencies, and MediaPipe telemetry may be sent from development builds, which also talk to Metro. Do not use a debug build to check network behaviour.

When upgrading MediaPipe, re-run the check: list every class in the new AARs that references `com/google/android/datatransport` and compare its member references with this table. A missing member fails with `NoSuchMethodError`/`NoSuchFieldError` when the classifier is created, which the app reports as a start error. If a release dependency ever brings in the real datatransport library, R8 (on by default for release in this Expo project) fails on the duplicate classes.

To accept MediaPipe's telemetry instead, delete this folder, the `release.java.srcDirs` line and the `releaseImplementation` exclusion in `build.gradle`, and update the privacy policy and the Play Data safety answers first.
