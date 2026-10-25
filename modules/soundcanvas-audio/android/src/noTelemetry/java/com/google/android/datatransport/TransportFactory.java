// No-op stand-in; see modules/soundcanvas-audio/android/src/noTelemetry/README.md. Nothing is stored or sent.
package com.google.android.datatransport;

public interface TransportFactory {
  <T> Transport<T> getTransport(String name, Class<T> payloadType, Encoding encoding, Transformer<T, byte[]> transformer);
}
