package app.soundcanvas.audio

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.sqrt

data class AudioFeatureFrame(
  /** Analysis-stream sample index just after the frame's last sample. */
  val endSample: Long,
  val rms: Float,
  val peak: Float,
  val low: Float,
  val mid: Float,
  val high: Float,
)

/**
 * Cheap per-window acoustic features from the same 16 kHz mono stream the classifier uses,
 * ported from ios/FeatureExtractor.swift with the same Float math. Three broad bands are split
 * with one-pole filters (below ~250 Hz, 250 Hz-2 kHz, above 2 kHz). Not thread-safe.
 */
class FeatureExtractor(sampleRate: Float, private val windowSamples: Int) {
  private val lowCoefficient = 1f - exp(-2f * PI.toFloat() * 250f / sampleRate)
  private val highCoefficient = 1f - exp(-2f * PI.toFloat() * 2000f / sampleRate)

  private var lowState = 0f
  private var highState = 0f
  private var samplesSeen = 0L
  private var count = 0
  private var sumAll = 0f
  private var sumLow = 0f
  private var sumMid = 0f
  private var sumHigh = 0f
  private var peak = 0f

  /** Feeds samples; calls [emit] once per completed window (800 samples = 50 ms at 16 kHz). */
  fun process(chunk: FloatArray, count: Int = chunk.size, emit: (AudioFeatureFrame) -> Unit) {
    for (i in 0 until count) {
      val frame = step(chunk[i])
      if (frame != null) emit(frame)
    }
  }

  private fun step(x: Float): AudioFeatureFrame? {
    lowState += lowCoefficient * (x - lowState)
    highState += highCoefficient * (x - highState)
    val low = lowState
    val mid = highState - lowState
    val high = x - highState

    sumAll += x * x
    sumLow += low * low
    sumMid += mid * mid
    sumHigh += high * high
    peak = maxOf(peak, abs(x))
    count += 1
    samplesSeen += 1

    return if (count == windowSamples) finishWindow() else null
  }

  fun reset() {
    lowState = 0f
    highState = 0f
    samplesSeen = 0
    clearWindow()
  }

  private fun finishWindow(): AudioFeatureFrame {
    val n = count.toFloat()
    val bandTotal = sumLow + sumMid + sumHigh
    val frame = AudioFeatureFrame(
      endSample = samplesSeen,
      rms = minOf(1f, sqrt(sumAll / n)),
      peak = minOf(1f, peak),
      low = if (bandTotal > 1e-12f) sumLow / bandTotal else 0f,
      mid = if (bandTotal > 1e-12f) sumMid / bandTotal else 0f,
      high = if (bandTotal > 1e-12f) sumHigh / bandTotal else 0f,
    )
    clearWindow()
    return frame
  }

  private fun clearWindow() {
    count = 0
    sumAll = 0f
    sumLow = 0f
    sumMid = 0f
    sumHigh = 0f
    peak = 0f
  }
}
