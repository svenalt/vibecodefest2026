// No-op stand-in; see modules/soundcanvas-audio/android/src/noTelemetry/README.md. Nothing is stored or sent.
package com.google.android.datatransport.cct;

import com.google.android.datatransport.runtime.Destination;

public final class CCTDestination implements Destination {
  public static final CCTDestination INSTANCE = new CCTDestination();

  private CCTDestination() {}
}
