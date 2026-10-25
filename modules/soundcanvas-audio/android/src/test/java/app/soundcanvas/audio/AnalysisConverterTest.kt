package app.soundcanvas.audio

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs

class AnalysisConverterTest {
  @Test
  fun `16 kHz mono float passes through unchanged`() {
    val input = Signals.noise(1000)
    val out = AnalysisConverter(16_000, 1).convert(input, input.size)
    assertArrayEquals(input, out, 0f)
  }

  @Test
  fun `PCM16 is scaled to -1 to 1`() {
    val out = AnalysisConverter(16_000, 1).convert(shortArrayOf(0, 16384, -32768, 32767), 4)
    assertArrayEquals(floatArrayOf(0f, 0.5f, -1f, 32767f / 32768f), out, 0f)
  }

  @Test
  fun `stereo is averaged to mono, also when a frame is split across reads`() {
    val c = AnalysisConverter(16_000, 2)
    val first = c.convert(floatArrayOf(0.2f, 0.4f, 1f), 3) // last sample is half a frame
    val second = c.convert(floatArrayOf(-1f, 0.5f, 0.5f), 3)
    assertArrayEquals(floatArrayOf(0.3f), first, 1e-7f)
    assertArrayEquals(floatArrayOf(0f, 0.5f), second, 1e-7f)
  }

  @Test
  fun `non-finite samples become silence`() {
    val out = AnalysisConverter(16_000, 1).convert(floatArrayOf(Float.NaN, Float.POSITIVE_INFINITY, 0.25f), 3)
    assertArrayEquals(floatArrayOf(0f, 0f, 0.25f), out, 0f)
  }

  @Test
  fun `48 kHz becomes exactly a third as many 16 kHz samples`() {
    val c = AnalysisConverter(48_000, 1)
    var total = 0
    repeat(200) { total += c.convert(Signals.noise(2400, seed = it), 2400).size }
    // 480,000 input samples; the kernel holds back its half-width at the end.
    assertTrue("got $total", total in 159_900..160_000)
  }

  @Test
  fun `44_1 kHz keeps the 16 kHz cadence without drift`() {
    val r = Resampler(44_100, 16_000)
    var total = 0
    // 60 s in 50 ms reads.
    repeat(1200) { total += r.process(FloatArray(2205), 2205).size }
    assertTrue("got $total", abs(total - 960_000) <= 64)
  }

  @Test
  fun `output does not depend on how the input is chunked`() {
    val input = Signals.noise(48_000 * 2)
    val whole = Resampler(48_000, 16_000).process(input, input.size)
    val r = Resampler(48_000, 16_000)
    val pieces = Signals.chunked(input, listOf(1, 480, 4096, 7, 2400)) { chunk, n -> r.process(chunk, n) }
    assertArrayEquals(whole, pieces, 0f)
  }

  @Test
  fun `a 1 kHz tone keeps its level and frequency through 48 kHz to 16 kHz`() {
    val out = Resampler(48_000, 16_000).let { it.process(Signals.sine(1000.0, 48_000, 48_000), 48_000) }
    val steady = out.copyOfRange(1000, out.size - 1000)
    assertEquals(0.5 / Math.sqrt(2.0), Signals.rms(steady), 0.005)
    // Zero crossings per second of steady signal: 2 per cycle.
    var crossings = 0
    for (i in 1 until steady.size) if ((steady[i - 1] < 0) != (steady[i] < 0)) crossings++
    val seconds = steady.size / 16_000.0
    assertEquals(2000.0, crossings / seconds, 5.0)
  }

  @Test
  fun `tones above 8 kHz are removed instead of aliasing into the analysis band`() {
    for (hz in listOf(9_000.0, 12_000.0, 20_000.0)) {
      val out = Resampler(48_000, 16_000).process(Signals.sine(hz, 48_000, 48_000), 48_000)
      val level = Signals.rms(out, 1000, out.size - 1000) / (0.5 / Math.sqrt(2.0))
      assertTrue("$hz Hz leaked at ${20 * Math.log10(level)} dB", level < 0.01) // below -40 dB
    }
  }

  @Test
  fun `the analysis band below 6 kHz is kept within 0_5 dB`() {
    for (hz in listOf(100.0, 2_000.0, 6_000.0)) {
      val out = Resampler(44_100, 16_000).process(Signals.sine(hz, 44_100, 44_100), 44_100)
      val gainDb = 20 * Math.log10(Signals.rms(out, 1000, out.size - 1000) / (0.5 / Math.sqrt(2.0)))
      assertTrue("$hz Hz gain $gainDb dB", abs(gainDb) < 0.5)
    }
  }

  @Test
  fun `silence stays silent and finite`() {
    val out = AnalysisConverter(48_000, 2).convert(ShortArray(9600), 9600)
    assertTrue(out.all { it == 0f })
  }
}
