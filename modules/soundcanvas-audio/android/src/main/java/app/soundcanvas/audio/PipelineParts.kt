package app.soundcanvas.audio

import java.nio.ByteBuffer
import java.security.MessageDigest
import java.util.concurrent.Executor
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

/**
 * The 16 kHz mono analysis stream: one feature frame per 800 samples and a 15,600-sample window
 * every 7,800 samples, both stamped with session audio time (ms since the first analysed sample).
 * A window's timestamp is the time of its newest sample. Not thread-safe; owned by the capture thread.
 */
class AnalysisStream(
  private val onFeatures: (frame: AudioFeatureFrame, timestampMs: Long) -> Unit,
  private val onWindow: (window: FloatArray, timestampMs: Long) -> Unit,
) {
  private val features = FeatureExtractor(Yamnet.SAMPLE_RATE.toFloat(), Yamnet.FEATURE_WINDOW_SAMPLES)
  private val window = WindowBuffer(Yamnet.WINDOW_SAMPLES, Yamnet.HOP_SAMPLES)

  var totalSamples = 0L
    private set

  fun push(samples: FloatArray, count: Int = samples.size) {
    if (count <= 0) return
    features.process(samples, count) { onFeatures(it, Yamnet.streamTimeMs(it.endSample)) }
    totalSamples += count
    window.append(samples, count)?.let { onWindow(it, Yamnet.streamTimeMs(totalSamples)) }
  }
}

/**
 * Runs at most one inference at a time. A window offered while one is running is dropped, so a
 * slow device never blocks capture or builds a backlog.
 */
class InferenceSlot(private val executor: Executor) {
  private val busy = AtomicBoolean(false)
  private val submitted = AtomicLong()
  private val dropped = AtomicLong()

  val submittedCount: Long get() = submitted.get()
  val droppedCount: Long get() = dropped.get()

  /** Returns false if the window was dropped. */
  fun offer(task: () -> Unit): Boolean {
    if (!busy.compareAndSet(false, true)) {
      dropped.incrementAndGet()
      return false
    }
    try {
      executor.execute {
        try {
          task()
        } finally {
          busy.set(false)
        }
      }
    } catch (e: RejectedExecutionException) {
      busy.set(false)
      return false
    }
    submitted.incrementAndGet()
    return true
  }
}

/**
 * Session epochs. Every event is emitted through [emitIfCurrent] under the same lock that [close]
 * takes, so once close() returns no event of an earlier session can be emitted.
 */
class SessionGate {
  private val lock = Any()
  private var epoch = 0
  private var active = false

  fun open(): Int = synchronized(lock) {
    active = true
    ++epoch
  }

  fun close() = synchronized(lock) {
    active = false
    epoch++
  }

  /** Closes only if [sessionEpoch] is still the live session. False if it already ended. */
  fun close(sessionEpoch: Int): Boolean = synchronized(lock) {
    if (!active || sessionEpoch != epoch) return@synchronized false
    active = false
    epoch++
    true
  }

  fun isCurrent(sessionEpoch: Int): Boolean = synchronized(lock) { active && sessionEpoch == epoch }

  /** Runs [emit] only while [sessionEpoch] is the live session. Keep [emit] non-blocking. */
  fun emitIfCurrent(sessionEpoch: Int, emit: () -> Unit): Boolean = synchronized(lock) {
    if (active && sessionEpoch == epoch) {
      emit()
      true
    } else {
      false
    }
  }
}

/** Inference timing for the session summary in logcat (no audio content). */
class InferenceStats {
  private val durationsMs = ArrayList<Double>()

  @Synchronized
  fun record(durationMs: Double) {
    durationsMs.add(durationMs)
  }

  @Synchronized
  fun summary(): String {
    if (durationsMs.isEmpty()) return "no inferences"
    val sorted = durationsMs.sorted()
    val p95 = sorted[minOf(sorted.size - 1, (sorted.size * 0.95).toInt())]
    return "inferences=${sorted.size} median=%.1fms p95=%.1fms max=%.1fms".format(
      sorted[sorted.size / 2], p95, sorted.last())
  }
}

object ModelIntegrity {
  fun sha256Hex(bytes: ByteBuffer): String {
    val digest = MessageDigest.getInstance("SHA-256")
    digest.update(bytes.duplicate())
    return digest.digest().joinToString("") { "%02x".format(it) }
  }

  fun sha256Hex(bytes: ByteArray): String = sha256Hex(ByteBuffer.wrap(bytes))

  fun requirePinned(name: String, actual: String, expected: String) {
    if (actual != expected) {
      throw ModelContractException("$name does not match the pinned file (sha256 $actual, expected $expected)")
    }
  }
}
