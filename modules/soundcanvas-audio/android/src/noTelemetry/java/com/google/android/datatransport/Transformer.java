// No-op stand-in; see modules/soundcanvas-audio/android/src/noTelemetry/README.md. Nothing is stored or sent.
package com.google.android.datatransport;

public interface Transformer<T, U> {
  U apply(T input);
}
