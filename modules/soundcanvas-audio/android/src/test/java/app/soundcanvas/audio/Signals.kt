package app.soundcanvas.audio

import java.io.File
import kotlin.math.PI
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.random.Random

/** Deterministic test signals and pinned fixtures. */
object Signals {
  fun sine(hz: Double, rate: Int, count: Int, amplitude: Double = 0.5, phase: Double = 0.0) =
    FloatArray(count) { (amplitude * sin(2 * PI * hz * it / rate + phase)).toFloat() }

  fun noise(count: Int, amplitude: Float = 0.5f, seed: Int = 7): FloatArray {
    val random = Random(seed)
    return FloatArray(count) { (random.nextFloat() * 2 - 1) * amplitude }
  }

  fun rms(x: FloatArray, from: Int = 0, to: Int = x.size): Double {
    var sum = 0.0
    for (i in from until to) sum += x[i].toDouble() * x[i]
    return sqrt(sum / (to - from))
  }

  /** Feeds [input] in chunks of the given sizes (cycled) and concatenates the outputs. */
  fun chunked(input: FloatArray, sizes: List<Int>, process: (FloatArray, Int) -> FloatArray): FloatArray {
    val out = ArrayList<Float>()
    var offset = 0
    var i = 0
    while (offset < input.size) {
      val n = minOf(sizes[i++ % sizes.size], input.size - offset)
      out.addAll(process(input.copyOfRange(offset, offset + n), n).toList())
      offset += n
    }
    return out.toFloatArray()
  }

  val classMapFile: File get() = File(System.getProperty("soundcanvas.classMap")!!)
  val modelFile: File get() = File(System.getProperty("soundcanvas.model")!!)
  val pinnedLabels: List<String> by lazy { YamnetLabels.parse(classMapFile.readText()) }
}
