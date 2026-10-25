// No-op stand-in; see modules/soundcanvas-audio/android/src/noTelemetry/README.md. Nothing is stored or sent.
package com.google.android.datatransport.runtime;

import android.content.Context;
import com.google.android.datatransport.Transport;
import com.google.android.datatransport.TransportFactory;

public final class TransportRuntime {
  private static final TransportRuntime INSTANCE = new TransportRuntime();

  private TransportRuntime() {}

  public static void initialize(Context context) {}

  public static TransportRuntime getInstance() {
    return INSTANCE;
  }

  public TransportFactory newFactory(Destination destination) {
    return new TransportFactory() {
      @Override
      public <T> Transport<T> getTransport(
          String name, Class<T> payloadType, com.google.android.datatransport.Encoding encoding,
          com.google.android.datatransport.Transformer<T, byte[]> transformer) {
        return event -> {};
      }
    };
  }
}
