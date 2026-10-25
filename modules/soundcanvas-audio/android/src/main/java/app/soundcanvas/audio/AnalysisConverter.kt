package app.soundcanvas.audio

import kotlin.math.PI
import kotlin.math.ceil
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Turns what AudioRecord delivers (interleaved PCM16 or float, any rate, 1+ channels) into the
 * 16 kHz mono float32 stream YAMNet and the feature extractor expect. Channels are averaged;
 * non-finite samples become 0. Not thread-safe; owned by the capture thread.
 */
class AnalysisConverter(inputRate: Int, private val channels: Int) {
  init {
    require(inputRate > 0) { "Invalid input sample rate $inputRate" }
    require(channels > 0) { "Invalid channel count $channels" }
  }

  private val resampler = Resampler(inputRate, Yamnet.SAMPLE_RATE)
  private var mono = FloatArray(0)
  /** Samples of a frame split across two reads. */
  private val partial = FloatArray(channels)
  private var partialCount = 0

  fun convert(samples: FloatArray, count: Int): FloatArray = mix(count) { samples[it] }

  fun convert(samples: ShortArray, count: Int): FloatArray = mix(count) { samples[it] / 32768f }

  fun reset() {
    resampler.reset()
    partialCount = 0
  }

  private inline fun mix(count: Int, sample: (Int) -> Float): FloatArray {
    val frames = (partialCount + count) / channels
    if (mono.size < frames) mono = FloatArray(frames)
    var frame = 0
    for (i in 0 until count) {
      val x = sample(i)
      partial[partialCount++] = if (x.isFinite()) x else 0f
      if (partialCount == channels) {
        var sum = 0f
        for (c in 0 until channels) sum += partial[c]
        mono[frame++] = sum / channels
        partialCount = 0
      }
    }
    return resampler.process(mono, frame)
  }
}

/**
 * Streaming band-limited resampler (Kaiser-windowed sinc, cutoff at 47% of the lower rate).
 * The read position is kept as an exact fraction, so long sessions do not drift and the output
 * does not depend on how the input is split into chunks. Equal rates pass through untouched.
 */
class Resampler(private val inRate: Int, private val outRate: Int) {
  private val passthrough = inRate == outRate
  /** Kernel half-width in input samples. */
  private val halfWidth: Int
  private val table: FloatArray

  // Input history still reachable by the kernel; positions below are indices into it.
  private var buf = FloatArray(0)
  private var bufLen = 0
  // Position of the next output sample, in input samples: posInt + posFrac / outRate.
  private var posInt = 0L
  private var posFrac = 0L

  init {
    require(inRate > 0 && outRate > 0) { "Invalid resampler rates $inRate -> $outRate" }
    // Cutoff in cycles per input sample.
    val cutoff = CUTOFF * minOf(inRate, outRate) / inRate
    halfWidth = ceil(ZERO_CROSSINGS / (2 * cutoff)).toInt()
    table = FloatArray(halfWidth * TABLE_RES + 2)
    val i0Beta = besselI0(KAISER_BETA)
    for (i in table.indices) {
      val x = i.toDouble() / TABLE_RES
      if (x >= halfWidth) continue
      val t = x / halfWidth
      val window = besselI0(KAISER_BETA * sqrt(1 - t * t)) / i0Beta
      val arg = 2 * cutoff * x
      val sinc = if (arg == 0.0) 1.0 else sin(PI * arg) / (PI * arg)
      table[i] = (2 * cutoff * sinc * window).toFloat()
    }
    reset()
  }

  fun reset() {
    // Start with half a kernel of silence so output sample 0 lines up with input sample 0.
    buf = FloatArray(maxOf(4096, 4 * halfWidth))
    bufLen = halfWidth
    posInt = halfWidth.toLong()
    posFrac = 0
  }

  fun process(input: FloatArray, count: Int): FloatArray {
    if (passthrough) return input.copyOf(count)
    if (bufLen + count > buf.size) buf = buf.copyOf(maxOf(buf.size * 2, bufLen + count))
    System.arraycopy(input, 0, buf, bufLen, count)
    bufLen += count

    // Each output needs input up to posInt + halfWidth.
    val available = bufLen - halfWidth - posInt
    val estimate = if (available <= 0) 0 else (available * outRate / inRate + 2).toInt()
    val out = FloatArray(estimate)
    var n = 0
    while (posInt + halfWidth < bufLen && n < out.size) {
      out[n++] = sampleAt()
      posFrac += inRate
      posInt += posFrac / outRate
      posFrac %= outRate
    }

    // Drop history the next output can no longer reach.
    val drop = (posInt - halfWidth).toInt().coerceIn(0, bufLen)
    if (drop > 0) {
      System.arraycopy(buf, drop, buf, 0, bufLen - drop)
      bufLen -= drop
      posInt -= drop
    }
    return if (n == out.size) out else out.copyOf(n)
  }

  private fun sampleAt(): Float {
    val frac = posFrac.toDouble() / outRate
    var sum = 0f
    for (k in (posInt - halfWidth + 1).toInt()..(posInt + halfWidth).toInt()) {
      val x = kotlin.math.abs(k - posInt - frac) * TABLE_RES
      val i = x.toInt()
      if (i >= table.size - 1) continue
      val f = (x - i).toFloat()
      sum += buf[k] * (table[i] + f * (table[i + 1] - table[i]))
    }
    return sum
  }

  private companion object {
    // About 80 dB stopband from ~8.1 kHz and flat to ~6.9 kHz at a 16 kHz output, covering
    // YAMNet's mel range (to 7.5 kHz) with little aliasing. ~200 taps per output sample at 48 kHz.
    const val CUTOFF = 0.47
    const val ZERO_CROSSINGS = 32
    const val KAISER_BETA = 8.0
    const val TABLE_RES = 512

    fun besselI0(x: Double): Double {
      var sum = 1.0
      var term = 1.0
      val q = x * x / 4
      var k = 1
      while (term > 1e-12 * sum) {
        term *= q / (k.toDouble() * k)
        sum += term
        k++
      }
      return sum
    }
  }
}
