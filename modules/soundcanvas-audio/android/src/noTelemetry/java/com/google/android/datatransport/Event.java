// No-op stand-in; see modules/soundcanvas-audio/android/src/noTelemetry/README.md. Nothing is stored or sent.
package com.google.android.datatransport;

public final class Event<T> {
  private Event() {}

  public static <T> Event<T> ofData(T payload) {
    return new Event<>();
  }
}
