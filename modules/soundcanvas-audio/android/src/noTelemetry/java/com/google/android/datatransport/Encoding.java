// No-op stand-in; see modules/soundcanvas-audio/android/src/noTelemetry/README.md. Nothing is stored or sent.
package com.google.android.datatransport;

public final class Encoding {
  private Encoding() {}

  public static Encoding of(String name) {
    return new Encoding();
  }
}
