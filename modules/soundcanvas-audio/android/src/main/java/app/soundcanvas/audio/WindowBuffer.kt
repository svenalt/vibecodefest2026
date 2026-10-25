package app.soundcanvas.audio

/**
 * Overlapping window buffer, ported from ios/WindowBuffer.swift: once [windowSize] samples have
 * arrived it hands out the latest window roughly every [hop] samples. Not thread-safe; owned by
 * the capture thread.
 */
class WindowBuffer(private val windowSize: Int, private val hop: Int) {
  private val ring = FloatArray(windowSize)
  private var writeIndex = 0
  private var filled = 0
  private var sinceLast = 0
  private var primed = false

  /** Appends mono samples; returns a copy of the full window when one is due, otherwise null. */
  fun append(chunk: FloatArray, count: Int = chunk.size): FloatArray? {
    // Only the newest windowSize samples can end up in a window.
    val skip = maxOf(0, count - windowSize)
    for (i in skip until count) {
      ring[writeIndex] = chunk[i]
      writeIndex = (writeIndex + 1) % windowSize
    }
    filled = minOf(windowSize, filled + count)
    sinceLast += count

    if (filled < windowSize) return null
    if (!primed) {
      primed = true
      sinceLast = 0
      return snapshot()
    }
    if (sinceLast < hop) return null
    // Carry the remainder so the average cadence stays at one window per hop; after a stall, resync.
    sinceLast = if (sinceLast >= 2 * hop) 0 else sinceLast - hop
    return snapshot()
  }

  fun reset() {
    writeIndex = 0
    filled = 0
    sinceLast = 0
    primed = false
  }

  private fun snapshot(): FloatArray {
    val out = FloatArray(windowSize)
    val tail = windowSize - writeIndex
    System.arraycopy(ring, writeIndex, out, 0, tail)
    System.arraycopy(ring, 0, out, tail, writeIndex)
    return out
  }
}
