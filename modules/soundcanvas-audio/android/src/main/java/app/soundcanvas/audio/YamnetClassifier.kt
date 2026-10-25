package app.soundcanvas.audio

import android.content.Context
import com.google.mediapipe.tasks.audio.audioclassifier.AudioClassifier
import com.google.mediapipe.tasks.audio.core.RunningMode
import com.google.mediapipe.tasks.components.containers.AudioData
import com.google.mediapipe.tasks.core.BaseOptions
import java.io.File
import java.io.IOException
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.channels.FileChannel

/**
 * Runs the bundled YAMNet TFLite model through MediaPipe Tasks Audio in audio-clips mode, like
 * ios/YamnetClassifier.swift. Each call receives exactly one 15,600-sample, 16 kHz mono window,
 * so MediaPipe performs a single inference and windowing stays under our control.
 * Use from one thread at a time.
 */
internal class YamnetClassifier private constructor(private val classifier: AudioClassifier) : AutoCloseable {
  private val format = AudioData.AudioDataFormat.builder()
    .setNumOfChannels(1)
    .setSampleRate(Yamnet.SAMPLE_RATE.toFloat())
    .build()

  /** Every class the model returned for [window], unfiltered and in MediaPipe's order. */
  fun classify(window: FloatArray): List<ClassScore> {
    val audio = AudioData.create(format, window.size)
    audio.load(window)
    val results = classifier.classify(audio).classificationResults()
    if (results.size != 1) {
      throw ModelContractException("YAMNet returned ${results.size} results for one window, expected 1")
    }
    val categories = results[0].classifications().firstOrNull()?.categories()
    if (categories.isNullOrEmpty()) throw ModelContractException("YAMNet returned no classification result")
    // Same label choice as iOS: the metadata label name, else the display name.
    return categories.map { c ->
      val name = c.categoryName().orEmpty()
      ClassScore(c.index(), name.ifEmpty { c.displayName().orEmpty() }, c.score())
    }
  }

  override fun close() = classifier.close()

  companion object {
    /**
     * Loads the model from an app-private file (expo-asset copies it into the cache directory in
     * both development and release builds) after checking it is the pinned file. The file is
     * memory-mapped and handed over as a buffer: setModelAssetPath expects an APK asset name.
     */
    fun create(context: Context, modelPath: String): YamnetClassifier {
      val model = mapModel(modelPath)
      ModelIntegrity.requirePinned("YAMNet model", ModelIntegrity.sha256Hex(model), Yamnet.MODEL_SHA256)

      val options = AudioClassifier.AudioClassifierOptions.builder()
        .setBaseOptions(BaseOptions.builder().setModelAssetBuffer(model).build())
        .setRunningMode(RunningMode.AUDIO_CLIPS)
        // No maxResults: unset returns every class (this API rejects -1, which iOS uses), so all
        // 521 can be audited. A zero threshold overrides any threshold in the model metadata.
        .setScoreThreshold(0f)
        .build()
      return YamnetClassifier(AudioClassifier.createFromOptions(context, options))
    }

    private fun mapModel(path: String): ByteBuffer {
      val file = File(path)
      if (!file.isFile) throw IOException("YAMNet model file not found at $path")
      RandomAccessFile(file, "r").use { raf ->
        // The mapping stays valid after the channel is closed.
        return raf.channel.map(FileChannel.MapMode.READ_ONLY, 0, raf.length())
      }
    }
  }
}
