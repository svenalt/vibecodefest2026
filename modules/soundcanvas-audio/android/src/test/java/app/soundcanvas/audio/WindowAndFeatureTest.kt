package app.soundcanvas.audio

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WindowBufferTest {
  @Test
  fun `first window arrives once 15,600 samples are in, then every 7,800 on average`() {
    val buffer = WindowBuffer(Yamnet.WINDOW_SAMPLES, Yamnet.HOP_SAMPLES)
    val dueAt = ArrayList<Int>()
    var total = 0
    repeat(400) {
      total += 800
      if (buffer.append(FloatArray(800)) != null) dueAt.add(total)
    }
    assertEquals(16_000, dueAt.first()) // first 800-sample read that completes 15,600
    val hops = dueAt.zipWithNext { a, b -> b - a }
    val mean = hops.average()
    assertEquals(7_800.0, mean, 30.0)
    assertTrue(hops.all { it == 7_200 || it == 8_000 })
  }

  @Test
  fun `window holds the newest samples in order`() {
    val buffer = WindowBuffer(4, 2)
    assertNull(buffer.append(floatArrayOf(1f, 2f, 3f)))
    assertArrayEquals(floatArrayOf(2f, 3f, 4f, 5f), buffer.append(floatArrayOf(4f, 5f)), 0f)
    assertNull(buffer.append(floatArrayOf(6f)))
    assertArrayEquals(floatArrayOf(4f, 5f, 6f, 7f), buffer.append(floatArrayOf(7f)), 0f)
  }

  @Test
  fun `a chunk longer than the window keeps only its tail`() {
    val buffer = WindowBuffer(3, 3)
    assertArrayEquals(floatArrayOf(5f, 6f, 7f), buffer.append(floatArrayOf(1f, 2f, 3f, 4f, 5f, 6f, 7f)), 0f)
  }

  @Test
  fun `after a stall the cadence resyncs instead of bursting`() {
    val buffer = WindowBuffer(10, 5)
    buffer.append(FloatArray(10)) // primed
    assertTrue(buffer.append(FloatArray(23)) != null) // 23 >= 2 x hop: one window, then resync
    assertNull(buffer.append(FloatArray(4)))
    assertTrue(buffer.append(FloatArray(1)) != null)
  }

  @Test
  fun `reset forgets everything`() {
    val buffer = WindowBuffer(4, 2)
    buffer.append(FloatArray(4))
    buffer.reset()
    assertNull(buffer.append(FloatArray(3)))
  }
}

class FeatureExtractorTest {
  private fun frames(signal: FloatArray): List<AudioFeatureFrame> {
    val out = ArrayList<AudioFeatureFrame>()
    FeatureExtractor(16_000f, 800).process(signal) { out.add(it) }
    return out
  }

  @Test
  fun `one frame per 800 samples (50 ms), stamped with its end sample`() {
    val f = frames(FloatArray(16_000))
    assertEquals(20, f.size)
    assertEquals((1..20).map { it * 800L }, f.map { it.endSample })
  }

  @Test
  fun `silence gives zero level and zero bands`() {
    for (frame in frames(FloatArray(4000))) {
      assertEquals(0f, frame.rms, 0f)
      assertEquals(0f, frame.peak, 0f)
      assertEquals(0f, frame.low + frame.mid + frame.high, 0f)
    }
  }

  @Test
  fun `RMS and peak of a sine`() {
    val last = frames(Signals.sine(1000.0, 16_000, 8000, amplitude = 0.5)).last()
    assertEquals(0.5f / Math.sqrt(2.0).toFloat(), last.rms, 0.005f)
    assertEquals(0.5f, last.peak, 0.01f)
  }

  @Test
  fun `tones land in the expected band`() {
    fun dominant(hz: Double): String {
      val f = frames(Signals.sine(hz, 16_000, 16_000)).last()
      return listOf("low" to f.low, "mid" to f.mid, "high" to f.high).maxByOrNull { it.second }!!.first
    }
    assertEquals("low", dominant(100.0))
    assertEquals("mid", dominant(800.0))
    assertEquals("high", dominant(5000.0))
  }

  @Test
  fun `noise and clipping stay finite and inside 0 to 1`() {
    val loud = FloatArray(8000) { if (it % 2 == 0) 3f else -3f }
    for (frame in frames(Signals.noise(16_000)) + frames(loud)) {
      for (v in listOf(frame.rms, frame.peak, frame.low, frame.mid, frame.high)) {
        assertTrue("$v", v.isFinite() && v in 0f..1f)
      }
      val bands = frame.low + frame.mid + frame.high
      assertEquals(1f, bands, 1e-4f)
    }
  }
}

class AnalysisStreamTest {
  @Test
  fun `features and windows share one monotonic session clock`() {
    val featureTimes = ArrayList<Long>()
    val windowTimes = ArrayList<Long>()
    val stream = AnalysisStream({ _, t -> featureTimes.add(t) }, { w, t ->
      assertEquals(Yamnet.WINDOW_SAMPLES, w.size)
      windowTimes.add(t)
    })
    // 5 s of audio in uneven reads.
    Signals.chunked(Signals.noise(80_000), listOf(800, 533, 1600, 97)) { c, n ->
      stream.push(c, n)
      FloatArray(0)
    }
    assertEquals(100, featureTimes.size)
    assertEquals((1..100).map { it * 50L }, featureTimes)
    assertTrue(windowTimes.zipWithNext().all { (a, b) -> b > a })
    assertTrue("first window at ${windowTimes.first()} ms", windowTimes.first() in 975L..1025L)
    assertEquals(9, windowTimes.size)
    assertEquals(5000L, Yamnet.streamTimeMs(stream.totalSamples))
  }
}
