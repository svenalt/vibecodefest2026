package app.soundcanvas.audio

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Build

/**
 * One AudioRecord in a format it really delivers. 16 kHz mono float32 is preferred; otherwise the
 * first configuration the device accepts is used and converted to 16 kHz mono by
 * [AnalysisConverter]. The configuration is checked after construction, so a stream is never
 * treated as a rate or layout it does not have.
 */
internal class MicrophoneCapture private constructor(
  val record: AudioRecord,
  val source: Int,
  val sampleRate: Int,
  val channelCount: Int,
  val encoding: Int,
) {
  /** About 50 ms per read, in samples (frames x channels). */
  private val chunkSamples = maxOf(channelCount, sampleRate / 20 * channelCount)
  val floatBuffer = if (encoding == AudioFormat.ENCODING_PCM_FLOAT) FloatArray(chunkSamples) else null
  val shortBuffer = if (encoding == AudioFormat.ENCODING_PCM_16BIT) ShortArray(chunkSamples) else null

  /** Blocking read into the matching buffer. Returns the number of samples or an AudioRecord error code. */
  fun read(): Int =
    if (floatBuffer != null) {
      record.read(floatBuffer, 0, floatBuffer.size, AudioRecord.READ_BLOCKING)
    } else {
      record.read(shortBuffer!!, 0, shortBuffer.size, AudioRecord.READ_BLOCKING)
    }

  /**
   * Rate and channels the device records at, which can differ from what this AudioRecord delivers
   * (Android resamples for the app). Before Android 10 only the delivered format is known.
   */
  fun deviceFormat(): Pair<Int, Int> {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      record.activeRecordingConfiguration?.format?.let { f ->
        if (f.sampleRate > 0 && f.channelCount > 0) return f.sampleRate to f.channelCount
      }
    }
    return sampleRate to channelCount
  }

  fun describe(): String =
    "source=${sourceName(source)} client=${sampleRate}Hz/${channelCount}ch/" +
      (if (encoding == AudioFormat.ENCODING_PCM_FLOAT) "float" else "pcm16")

  companion object {
    private class Candidate(val rate: Int, val channelMask: Int, val channels: Int, val encoding: Int)

    private val CANDIDATES = listOf(
      Candidate(16_000, AudioFormat.CHANNEL_IN_MONO, 1, AudioFormat.ENCODING_PCM_FLOAT),
      Candidate(16_000, AudioFormat.CHANNEL_IN_MONO, 1, AudioFormat.ENCODING_PCM_16BIT),
      Candidate(48_000, AudioFormat.CHANNEL_IN_MONO, 1, AudioFormat.ENCODING_PCM_FLOAT),
      Candidate(48_000, AudioFormat.CHANNEL_IN_MONO, 1, AudioFormat.ENCODING_PCM_16BIT),
      Candidate(44_100, AudioFormat.CHANNEL_IN_MONO, 1, AudioFormat.ENCODING_PCM_16BIT),
      Candidate(48_000, AudioFormat.CHANNEL_IN_STEREO, 2, AudioFormat.ENCODING_PCM_16BIT),
      Candidate(44_100, AudioFormat.CHANNEL_IN_STEREO, 2, AudioFormat.ENCODING_PCM_16BIT),
    )

    /**
     * Opens the microphone. Sources in order: UNPROCESSED where the device declares it (closest to
     * iOS measurement mode), VOICE_RECOGNITION (no noise suppression or AGC by default), MIC.
     * The caller must hold RECORD_AUDIO.
     */
    @SuppressLint("MissingPermission")
    fun open(audioManager: AudioManager): MicrophoneCapture {
      val sources = buildList {
        if (audioManager.getProperty(AudioManager.PROPERTY_SUPPORT_AUDIO_SOURCE_UNPROCESSED) == "true") {
          add(MediaRecorder.AudioSource.UNPROCESSED)
        }
        add(MediaRecorder.AudioSource.VOICE_RECOGNITION)
        add(MediaRecorder.AudioSource.MIC)
      }
      var lastProblem = "no supported recording format"
      for (source in sources) {
        for (c in CANDIDATES) {
          val minBytes = AudioRecord.getMinBufferSize(c.rate, c.channelMask, c.encoding)
          if (minBytes <= 0) continue
          val bytesPerSample = if (c.encoding == AudioFormat.ENCODING_PCM_FLOAT) 4 else 2
          // At least half a second of headroom so a busy moment does not overrun the device buffer.
          val bufferBytes = maxOf(minBytes * 2, c.rate / 2 * c.channels * bytesPerSample)
          val record = try {
            AudioRecord(source, c.rate, c.channelMask, c.encoding, bufferBytes)
          } catch (e: IllegalArgumentException) {
            lastProblem = e.message ?: "invalid configuration"
            continue
          }
          val honest = record.state == AudioRecord.STATE_INITIALIZED &&
            record.sampleRate == c.rate &&
            record.channelCount == c.channels &&
            record.audioFormat == c.encoding
          if (honest) return MicrophoneCapture(record, source, c.rate, c.channels, c.encoding)
          lastProblem = "AudioRecord did not initialise at ${c.rate} Hz"
          record.release()
        }
      }
      throw IllegalStateException("Could not open the microphone ($lastProblem)")
    }

    private fun sourceName(source: Int) = when (source) {
      MediaRecorder.AudioSource.UNPROCESSED -> "UNPROCESSED"
      MediaRecorder.AudioSource.VOICE_RECOGNITION -> "VOICE_RECOGNITION"
      MediaRecorder.AudioSource.MIC -> "MIC"
      else -> source.toString()
    }
  }
}
