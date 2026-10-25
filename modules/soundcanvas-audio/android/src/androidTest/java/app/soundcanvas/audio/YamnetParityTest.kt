package app.soundcanvas.audio

import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.sin

/** Must stay identical to fixtures() in scripts/gen-yamnet-reference.py. */
object YamnetFixtures {
  private const val N = Yamnet.WINDOW_SAMPLES
  private const val RATE = Yamnet.SAMPLE_RATE.toDouble()

  val all: Map<String, FloatArray> by lazy {
    mapOf(
      "silence" to FloatArray(N),
      "tone_440hz" to FloatArray(N) { (0.5 * sin(2 * PI * 440 * it / RATE)).toFloat() },
      "noise_lcg" to lcgNoise(0.3),
      "beeps_2khz" to FloatArray(N) { (0.6 * exp(-((it % 4000) / RATE) * 30) * sin(2 * PI * 2000 * it / RATE)).toFloat() },
    )
  }

  private fun lcgNoise(amplitude: Double): FloatArray {
    var state = 12345L
    return FloatArray(N) {
      state = (state * 1103515245L + 12345L) % 2147483648L
      ((state.toDouble() / 2147483648.0 * 2 - 1) * amplitude).toFloat()
    }
  }
}

/**
 * Runs fixed fixtures through the real MediaPipe classifier on a device and compares every one of
 * the 521 scores with the host TensorFlow Lite reference (scripts/gen-yamnet-reference.py).
 * The model's scores come in steps of 1/256, so ties are common. Tolerance: every score within
 * 0.02 (about five steps) of the reference, and the device's best class and top 5 each within 0.02
 * of the reference's best and fifth score. Identical weights on different hardware and kernels are
 * not expected to be byte-identical.
 *
 *   ./gradlew :soundcanvas-audio:connectedDebugAndroidTest   (from android/, device attached)
 */
@RunWith(AndroidJUnit4::class)
class YamnetParityTest {
  private companion object {
    const val TOLERANCE = 0.02f
  }

  private val context = InstrumentationRegistry.getInstrumentation().targetContext

  private fun modelFile(): File {
    // The test APK carries assets/model; copy it to a private file as expo-asset does in the app.
    val file = File(context.cacheDir, "parity-yamnet.tflite")
    InstrumentationRegistry.getInstrumentation().context.assets.open("yamnet.tflite").use { input ->
      file.outputStream().use { input.copyTo(it) }
    }
    return file
  }

  private fun asset(name: String) =
    InstrumentationRegistry.getInstrumentation().context.assets.open(name).use { String(it.readBytes()) }

  @Test
  fun fixturesMatchHostReference() {
    val labels = YamnetLabels.parse(asset("yamnet_class_map.csv"))
    val reference = JSONObject(asset("yamnet_reference.json"))
    assertEquals(Yamnet.MODEL_SHA256, reference.getString("model_sha256"))
    val expected = reference.getJSONObject("fixtures")

    YamnetClassifier.create(context, modelFile().absolutePath).use { classifier ->
      for ((name, samples) in YamnetFixtures.all) {
        val all = classifier.classify(samples)
        // Same audit the pipeline runs: all 521 classes with pinned labels.
        val audited = ClassificationAudit.audit(all, labels, topK = 5)
        val ref = expected.getJSONArray(name)
        val device = FloatArray(Yamnet.NUM_CLASSES).also { s -> all.forEach { s[it.index] = it.score } }
        var maxDiff = 0f
        for (i in 0 until Yamnet.NUM_CLASSES) maxDiff = maxOf(maxDiff, abs(device[i] - ref.getDouble(i).toFloat()))

        val refTop = (0 until Yamnet.NUM_CLASSES).sortedWith(
          compareByDescending<Int> { ref.getDouble(it) }.thenBy { it }).take(5)
        Log.i("YamnetParity", "$name: top=${audited.top.map { "${it.label}=%.4f".format(it.score) }} " +
          "refTop=${refTop.map { labels[it] }} maxAbsDiff=%.6f".format(maxDiff))

        assertTrue("$name: max score difference $maxDiff > $TOLERANCE", maxDiff <= TOLERANCE)
        // Ranks are compared through reference scores, because tied scores are common.
        val best = audited.top[0].index
        assertTrue("$name: best class ${labels[best]} vs ${labels[refTop[0]]}",
          ref.getDouble(best) >= ref.getDouble(refTop[0]) - TOLERANCE)
        for (c in audited.top) {
          assertTrue("$name: ${c.label} is not in the reference top 5",
            ref.getDouble(c.index) >= ref.getDouble(refTop[4]) - TOLERANCE)
        }
      }
    }
  }
}
