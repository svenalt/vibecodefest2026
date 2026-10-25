package app.soundcanvas.audio

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioManager
import android.media.AudioRecord
import android.media.AudioRecordingConfiguration
import android.media.AudioRouting
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.Process
import android.os.SystemClock
import android.util.Log
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

/**
 * One AudioRecord capture pipeline feeding both YAMNet and the feature extractor, so there is never
 * a second competing microphone session. Mirrors ios/AudioPipeline.swift:
 *
 *   AudioRecord -> capture thread: convert to 16 kHz mono, features (every 50 ms), window buffer
 *               -> inference thread: YAMNet (one in flight; extra windows are dropped)
 *
 * Start and stop run in order on one lifecycle thread. Nothing ever waits for that thread, so
 * teardown (which waits for the capture and inference threads) cannot deadlock.
 */
internal class AudioPipeline(context: Context, private val sinks: Sinks) {
  class Sinks(
    val state: (Map<String, Any?>) -> Unit,
    val classification: (Map<String, Any?>) -> Unit,
    val features: (Map<String, Any?>) -> Unit,
    val error: (String) -> Unit,
  )

  private val context = context.applicationContext
  private val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
  private val lifecycle = Executors.newSingleThreadExecutor { Thread(it, "soundcanvas.lifecycle") }
  private val gate = SessionGate()
  /** Bumped by every stop request, at once, so a start still loading the model can give up early. */
  private val stopRequests = AtomicInteger()

  // Owned by the lifecycle thread.
  private var session: Session? = null
  private var pinnedLabels: List<String>? = null

  fun start(modelPath: String, done: (Throwable?) -> Unit) {
    val stopsAtCall = stopRequests.get()
    val queued = post {
      try {
        startOnLifecycle(modelPath, stopsAtCall)
        done(null)
      } catch (e: Throwable) {
        done(e)
      }
    }
    if (!queued) done(IllegalStateException("The audio module was shut down"))
  }

  /** Releases the microphone and all processing. Safe to call repeatedly; [done] runs afterwards. */
  fun stop(done: () -> Unit = {}) {
    stopRequests.incrementAndGet()
    val queued = post {
      sinks.state(stateBody("stopping"))
      teardown()
      sinks.state(stateBody("idle"))
      done()
    }
    if (!queued) done()
  }

  /** Module teardown: stop, then end the lifecycle thread. */
  fun destroy() {
    stop()
    lifecycle.shutdown()
  }

  // region Lifecycle (lifecycle thread only)

  private fun startOnLifecycle(modelPath: String, stopsAtCall: Int) {
    if (session != null) throw IllegalStateException("Capture is already running")
    sinks.state(stateBody("starting"))
    try {
      if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
        throw SecurityException("Microphone access is not granted.")
      }
      if (!context.packageManager.hasSystemFeature(PackageManager.FEATURE_MICROPHONE)) {
        throw IllegalStateException("This device has no microphone.")
      }
      if (inCall(audioManager.mode)) {
        throw IllegalStateException("The microphone is in use by a call. Start listening again after the call.")
      }

      val labels = loadPinnedLabels()
      val classifier = YamnetClassifier.create(context, modelPath)
      val capture = try {
        // Audit the full output once before reporting "listening", so a wrong model or label map
        // shows up as a start error rather than as a listening state with bad results.
        ClassificationAudit.audit(classifier.classify(FloatArray(Yamnet.WINDOW_SAMPLES)), labels)
        if (stopRequests.get() != stopsAtCall) {
          // A stop arrived while the model loaded; it will report idle. Never open the microphone.
          classifier.close()
          return
        }
        MicrophoneCapture.open(audioManager)
      } catch (e: Throwable) {
        classifier.close()
        throw e
      }
      val session = Session(gate.open(), capture, classifier, labels)
      this.session = session
      session.begin()
      val (rate, channels) = session.capture.deviceFormat()
      Log.i(TAG, "Listening: ${session.capture.describe()} device=${rate}Hz/${channels}ch model=${Yamnet.MODEL_SHA256.take(12)}")
      sinks.state(stateBody("listening", rate.toDouble(), channels))
    } catch (e: Throwable) {
      teardown()
      sinks.state(stateBody("error", error = e.message ?: e.toString()))
      throw e
    }
  }

  private fun teardown() {
    val s = session ?: return
    session = null
    gate.close() // from here on no event of this session is emitted
    s.end()
  }

  /** Stops on the lifecycle thread and reports why, unless that session has already ended. */
  private fun fail(epoch: Int, message: String) {
    post {
      if (session?.epoch != epoch) return@post
      sinks.state(stateBody("stopping"))
      teardown()
      sinks.state(stateBody("idle"))
      sinks.error(message)
    }
  }

  /** Queues work on the lifecycle thread. False once the module was destroyed (its stop already ran). */
  private fun post(work: () -> Unit): Boolean =
    try {
      lifecycle.execute(work)
      true
    } catch (e: RejectedExecutionException) {
      false
    }

  private fun loadPinnedLabels(): List<String> {
    pinnedLabels?.let { return it }
    val bytes = context.assets.open(Yamnet.CLASS_MAP_ASSET).use { it.readBytes() }
    ModelIntegrity.requirePinned("YAMNet class map", ModelIntegrity.sha256Hex(bytes), Yamnet.CLASS_MAP_SHA256)
    return YamnetLabels.parse(String(bytes, Charsets.UTF_8)).also { pinnedLabels = it }
  }

  // endregion

  private inner class Session(
    val epoch: Int,
    val capture: MicrophoneCapture,
    private val classifier: YamnetClassifier,
    private val labels: List<String>,
  ) {
    private val inference: ExecutorService = Executors.newSingleThreadExecutor { Thread(it, "soundcanvas.inference") }
    private val slot = InferenceSlot(inference)
    private val stats = InferenceStats()
    private val callbacks = HandlerThread("soundcanvas.callbacks").apply { start() }
    private val handler = Handler(callbacks.looper)
    private val reader = Thread({ readLoop() }, "soundcanvas.capture")
    private val failed = AtomicBoolean(false)
    @Volatile private var cancelled = false
    private var listenersAdded = false

    @Volatile private var routedDeviceId: Int? = null
    private val routingListener = AudioRouting.OnRoutingChangedListener { router ->
      val id = router.routedDevice?.id ?: return@OnRoutingChangedListener
      val known = routedDeviceId
      if (known == null) routedDeviceId = id
      else if (id != known) failOnce("The audio route changed. Start listening again.")
    }
    private val recordingCallback = object : AudioManager.AudioRecordingCallback() {
      override fun onRecordingConfigChanged(configs: MutableList<AudioRecordingConfiguration>) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return
        val mine = configs.firstOrNull { it.clientAudioSessionId == capture.record.audioSessionId } ?: return
        if (mine.isClientSilenced) failOnce(SILENCED_MESSAGE)
      }
    }
    private val modeListener: Any? =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        AudioManager.OnModeChangedListener { mode ->
          if (inCall(mode)) failOnce("Audio was interrupted (for example by a call). Start listening again.")
        }
      } else {
        null
      }

    fun begin() {
      listenersAdded = true
      audioManager.registerAudioRecordingCallback(recordingCallback, handler)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        audioManager.addOnModeChangedListener({ handler.post(it) }, modeListener as AudioManager.OnModeChangedListener)
      }
      capture.record.addOnRoutingChangedListener(routingListener, handler)

      capture.record.startRecording()
      if (capture.record.recordingState != AudioRecord.RECORDSTATE_RECORDING) {
        throw IllegalStateException("The microphone could not start. Another app may be using it.")
      }
      routedDeviceId = capture.record.routedDevice?.id
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
        capture.record.activeRecordingConfiguration?.isClientSilenced == true
      ) {
        throw IllegalStateException(SILENCED_MESSAGE)
      }
      reader.start()
    }

    /** Releases everything. Called once, on the lifecycle thread, after the gate is closed. */
    fun end() {
      cancelled = true
      if (listenersAdded) {
        // Removing listeners that were never added throws on some API levels; begin() adds them first.
        runCatching { audioManager.unregisterAudioRecordingCallback(recordingCallback) }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
          runCatching { audioManager.removeOnModeChangedListener(modeListener as AudioManager.OnModeChangedListener) }
        }
        runCatching { capture.record.removeOnRoutingChangedListener(routingListener) }
      }

      // stop() makes a blocking read return, so the capture thread can finish.
      try {
        capture.record.stop()
      } catch (e: IllegalStateException) {
        // Never started recording.
      }
      if (reader.isAlive) {
        reader.join(READER_JOIN_MS)
        if (reader.isAlive) Log.w(TAG, "Capture thread did not finish within ${READER_JOIN_MS} ms")
      }
      capture.record.release()

      // Runs after any inference in flight, on the thread that uses the classifier.
      val closed = inference.submit { classifier.close() }
      try {
        closed.get(INFERENCE_CLOSE_MS, TimeUnit.MILLISECONDS)
      } catch (e: TimeoutException) {
        Log.w(TAG, "Inference did not finish within ${INFERENCE_CLOSE_MS} ms; abandoning it")
      } catch (e: Exception) {
        Log.w(TAG, "Closing the classifier failed: ${e.message}")
      }
      inference.shutdownNow()
      callbacks.quitSafely()
      Log.i(TAG, "Stopped: ${stats.summary()} windows=${slot.submittedCount} dropped=${slot.droppedCount}")
    }

    private fun failOnce(message: String) {
      if (failed.compareAndSet(false, true)) fail(epoch, message)
    }

    private fun readLoop() {
      Process.setThreadPriority(Process.THREAD_PRIORITY_URGENT_AUDIO)
      val converter = AnalysisConverter(capture.sampleRate, capture.channelCount)
      val stream = AnalysisStream(::emitFeatures, ::offerWindow)
      var emptyReads = 0
      while (!cancelled) {
        val n = capture.read()
        if (cancelled) break
        when {
          n > 0 -> {
            emptyReads = 0
            val mono = capture.floatBuffer?.let { converter.convert(it, n) }
              ?: converter.convert(capture.shortBuffer!!, n)
            stream.push(mono)
          }
          n == 0 -> {
            if (++emptyReads > MAX_EMPTY_READS) {
              failOnce("The microphone stopped delivering audio. Start listening again.")
              return
            }
            SystemClock.sleep(EMPTY_READ_BACKOFF_MS)
          }
          else -> {
            failOnce(readErrorMessage(n))
            return
          }
        }
      }
    }

    private fun emitFeatures(frame: AudioFeatureFrame, timestampMs: Long) {
      gate.emitIfCurrent(epoch) {
        sinks.features(
          mapOf(
            "timestampMs" to timestampMs.toDouble(),
            "rms" to frame.rms.toDouble(),
            "peak" to frame.peak.toDouble(),
            "bands" to mapOf(
              "low" to frame.low.toDouble(),
              "mid" to frame.mid.toDouble(),
              "high" to frame.high.toDouble(),
            ),
          ),
        )
      }
    }

    private fun offerWindow(window: FloatArray, timestampMs: Long) {
      slot.offer { classify(window, timestampMs) }
    }

    /** Inference thread. */
    private fun classify(window: FloatArray, timestampMs: Long) {
      if (!gate.isCurrent(epoch)) return
      val started = SystemClock.elapsedRealtimeNanos()
      val audited = try {
        ClassificationAudit.audit(classifier.classify(window), labels)
      } catch (e: ModelContractException) {
        failOnce(e.message ?: "Model output does not match the pinned YAMNet contract")
        return
      } catch (e: Exception) {
        failOnce("Inference failed: ${e.message ?: e}")
        return
      }
      stats.record((SystemClock.elapsedRealtimeNanos() - started) / 1e6)
      gate.emitIfCurrent(epoch) {
        sinks.classification(
          mapOf(
            "timestampMs" to timestampMs.toDouble(),
            "classCount" to audited.classCount,
            "top" to audited.top.map { mapOf("index" to it.index, "label" to it.label, "score" to it.score.toDouble()) },
          ),
        )
      }
    }
  }

  private fun stateBody(
    status: String,
    hardwareSampleRate: Double? = null,
    hardwareChannelCount: Int? = null,
    error: String? = null,
  ): Map<String, Any?> {
    val listening = status == "listening"
    return mapOf(
      "status" to status,
      "hardwareSampleRate" to hardwareSampleRate,
      "hardwareChannelCount" to hardwareChannelCount,
      "analysisSampleRate" to if (listening) Yamnet.SAMPLE_RATE.toDouble() else null,
      "analysisChannelCount" to if (listening) 1 else null,
      "error" to error,
    )
  }

  private companion object {
    const val TAG = "SoundCanvasAudio"
    const val READER_JOIN_MS = 2_000L
    const val INFERENCE_CLOSE_MS = 3_000L
    const val MAX_EMPTY_READS = 200
    const val EMPTY_READ_BACKOFF_MS = 10L
    const val SILENCED_MESSAGE =
      "Android is silencing the microphone for AUVIONA (for example during a call or while another app records). Start listening again."

    fun inCall(mode: Int) = mode == AudioManager.MODE_IN_CALL || mode == AudioManager.MODE_IN_COMMUNICATION

    fun readErrorMessage(code: Int) = when (code) {
      AudioRecord.ERROR_DEAD_OBJECT -> "The microphone was disconnected. Start listening again."
      AudioRecord.ERROR_INVALID_OPERATION -> "The microphone is not recording. Start listening again."
      else -> "Reading the microphone failed (error $code). Start listening again."
    }
  }
}
