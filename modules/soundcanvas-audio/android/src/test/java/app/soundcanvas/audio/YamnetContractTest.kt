package app.soundcanvas.audio

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.io.RandomAccessFile
import java.nio.channels.FileChannel

class YamnetContractTest {
  private val labels = Signals.pinnedLabels

  /** A full runtime result: every class, scores from [score], in MediaPipe-like (shuffled) order. */
  private fun fullResult(score: (Int) -> Float = { 0.001f * (it % 7) }): List<ClassScore> =
    labels.indices.map { ClassScore(it, labels[it], score(it)) }.shuffled(kotlin.random.Random(3))

  @Test
  fun `pinned class map parses to 521 labels in model order`() {
    assertEquals(Yamnet.NUM_CLASSES, labels.size)
    assertEquals("Speech", labels[0])
    assertEquals("Child speech, kid speaking", labels[1]) // quoted in the CSV
    assertEquals("Music", labels[132])
    assertEquals("Silence", labels[494])
  }

  @Test
  fun `Kotlin pins match the bundled files`() {
    assertEquals(Yamnet.CLASS_MAP_SHA256, ModelIntegrity.sha256Hex(Signals.classMapFile.readBytes()))
    RandomAccessFile(Signals.modelFile, "r").use { raf ->
      val mapped = raf.channel.map(FileChannel.MapMode.READ_ONLY, 0, raf.length())
      assertEquals(Yamnet.MODEL_SHA256, ModelIntegrity.sha256Hex(mapped))
      assertEquals("hashing must not move the buffer handed to MediaPipe", 0, mapped.position())
    }
    assertThrows(ModelContractException::class.java) {
      ModelIntegrity.requirePinned("YAMNet model", "00", Yamnet.MODEL_SHA256)
    }
  }

  @Test
  fun `audit keeps the 10 best of all 521, best first`() {
    val result = ClassificationAudit.audit(fullResult { if (it == 132) 0.9f else if (it == 0) 0.6f else 0.01f }, labels)
    assertEquals(521, result.classCount)
    assertEquals(10, result.top.size)
    assertEquals(listOf(132, 0), result.top.take(2).map { it.index })
    assertEquals("Music", result.top[0].label)
    assertTrue(result.top.zipWithNext().all { (a, b) -> a.score >= b.score })
  }

  @Test
  fun `equal scores are ordered by class index`() {
    val result = ClassificationAudit.audit(fullResult { 0.5f }, labels)
    assertEquals((0 until 10).toList(), result.top.map { it.index })
  }

  @Test
  fun `a truncated result is rejected instead of padded to 521`() {
    val top10 = fullResult().sortedByDescending { it.score }.take(10)
    val e = assertThrows(ModelContractException::class.java) { ClassificationAudit.audit(top10, labels) }
    assertEquals("Model reported 10 classes, expected 521", e.message)
    assertThrows(ModelContractException::class.java) { ClassificationAudit.audit(fullResult().drop(1), labels) }
  }

  @Test
  fun `a label that differs from the pinned map is rejected`() {
    val wrong = fullResult().map { if (it.index == 7) it.copy(label = "/m/0brhx") else it }
    val e = assertThrows(ModelContractException::class.java) { ClassificationAudit.audit(wrong, labels) }
    assertTrue(e.message!!, e.message!!.startsWith("Class order mismatch at index 7"))
  }

  @Test
  fun `duplicate or out-of-range indices and non-finite scores are rejected`() {
    val all = fullResult()
    val duplicate = all.map { if (it.index == 5) ClassScore(4, labels[4], it.score) else it }
    val outOfRange = all.map { if (it.index == 5) ClassScore(521, "x", it.score) else it }
    val nan = all.map { if (it.index == 5) it.copy(score = Float.NaN) else it }
    for (bad in listOf(duplicate, outOfRange, nan)) {
      assertThrows(ModelContractException::class.java) { ClassificationAudit.audit(bad, labels) }
    }
  }

  @Test
  fun `selects the same top 10 as iOS and JS for the shared parity cases`() {
    val cases = File(System.getProperty("soundcanvas.topkParity")!!).readLines().filter { it.isNotBlank() && !it.startsWith("#") }
    assertEquals(5, cases.size)
    for (line in cases) {
      val (name, expected, scores) = line.split('|')
      val values = scores.split(',').map { it.toFloat() }
      // MediaPipe's own order is not guaranteed; the audit must not depend on it.
      val all = values.mapIndexed { i, s -> ClassScore(i, labels[i], s) }.shuffled(kotlin.random.Random(name.hashCode()))
      val top = ClassificationAudit.audit(all, labels).top
      assertEquals(name, expected.split(',').map { it.toInt() }, top.map { it.index })
    }
  }

  @Test
  fun `audit refuses a wrong pinned map`() {
    assertThrows(ModelContractException::class.java) { ClassificationAudit.audit(fullResult(), labels.dropLast(1)) }
  }

  @Test
  fun `class map parser rejects rows out of order`() {
    assertThrows(ModelContractException::class.java) {
      YamnetLabels.parse("index,mid,display_name\n0,/m/a,A\n2,/m/b,B\n")
    }
  }

  @Test
  fun `session time is analysis samples at 16 kHz`() {
    assertEquals(0L, Yamnet.streamTimeMs(0))
    assertEquals(975L, Yamnet.streamTimeMs(15_600))
    assertEquals(487L, Yamnet.streamTimeMs(7_800))
    assertEquals(15L * 60 * 1000, Yamnet.streamTimeMs(16_000L * 60 * 15))
  }
}
