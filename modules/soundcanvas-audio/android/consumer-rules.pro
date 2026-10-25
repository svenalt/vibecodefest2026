# MediaPipe Tasks 1.0.0 ships no consumer rules. Its framework classes are called from JNI and its
# protobuf-lite messages are read reflectively, so keep them whole in minified release builds.
-keep class com.google.mediapipe.** { *; }
-keep class * extends com.google.protobuf.GeneratedMessageLite { *; }

# Referenced by MediaPipe but not shipped with it (R8 "missing classes", AGP 9.2.1):
# AutoValue annotations are compile-time only, and these two protos belong to graph profiling and
# graph-template APIs the audio classifier never calls.
-dontwarn com.google.auto.value.AutoValue
-dontwarn com.google.auto.value.AutoValue$Builder
-dontwarn com.google.auto.value.extension.memoized.Memoized
-dontwarn com.google.mediapipe.proto.CalculatorProfileProto$CalculatorProfile
-dontwarn com.google.mediapipe.proto.GraphTemplateProto$CalculatorGraphTemplate
