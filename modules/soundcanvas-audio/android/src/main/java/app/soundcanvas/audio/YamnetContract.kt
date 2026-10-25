package app.soundcanvas.audio

/** YAMNet I/O and the pinned artifacts (docs/model.md, scripts/verify-model.mjs). */
object Yamnet {
  const val SAMPLE_RATE = 16_000
  const val WINDOW_SAMPLES = 15_600
  const val HOP_SAMPLES = 7_800
  const val FEATURE_WINDOW_SAMPLES = 800
  const val NUM_CLASSES = 521
  const val TOP_K = 10

  const val MODEL_SHA256 = "4d8b4a53282dc83ef04e3e7dbc4fbc98082e34e44ed798e16c3a0cdd4c584faf"
  const val CLASS_MAP_SHA256 = "cdf24d193e196d9e95912a2667051ae203e92a2ba09449218ccb40ef787c6df2"
  const val CLASS_MAP_ASSET = "soundcanvas-audio/yamnet_class_map.csv"

  /** Session audio time of the sample count so far, in ms. The only clock events use. */
  fun streamTimeMs(samples: Long): Long = samples * 1000 / SAMPLE_RATE
}

data class ClassScore(val index: Int, val label: String, val score: Float)

data class AuditedClassification(
  /** Number of classes the model returned for this window (always 521 once audited). */
  val classCount: Int,
  /** Highest-scoring classes, best first; ties keep the lower index first. */
  val top: List<ClassScore>,
)

/** The runtime output does not match the pinned model contract; results cannot be trusted. */
class ModelContractException(message: String) : Exception(message)

object YamnetLabels {
  private val row = Regex("""^(\d+),([^,]+),(?:"(.*)"|(.*))$""")

  /** Parses yamnet_class_map.csv (`index,mid,display_name`) exactly like scripts/gen-labels.mjs. */
  fun parse(csv: String): List<String> {
    val lines = csv.trim().split('\n').drop(1)
    return lines.mapIndexed { i, raw ->
      val line = raw.removeSuffix("\r")
      val m = row.matchEntire(line) ?: throw ModelContractException("Unexpected class map row $i: $line")
      if (m.groupValues[1].toInt() != i) throw ModelContractException("Class map row $i has index ${m.groupValues[1]}")
      m.groups[3]?.value ?: m.groupValues[4]
    }
  }
}

object ClassificationAudit {
  /**
   * Checks the complete runtime output against the pinned labels before anything is filtered:
   * exactly 521 classes, each index present once and carrying the pinned label, finite scores.
   * Only then keeps the [topK] best.
   */
  fun audit(all: List<ClassScore>, pinnedLabels: List<String>, topK: Int = Yamnet.TOP_K): AuditedClassification {
    if (pinnedLabels.size != Yamnet.NUM_CLASSES) {
      throw ModelContractException("Pinned class map has ${pinnedLabels.size} labels, expected ${Yamnet.NUM_CLASSES}")
    }
    if (all.size != Yamnet.NUM_CLASSES) {
      throw ModelContractException("Model reported ${all.size} classes, expected ${Yamnet.NUM_CLASSES}")
    }
    val seen = BooleanArray(Yamnet.NUM_CLASSES)
    for (c in all) {
      if (c.index !in 0 until Yamnet.NUM_CLASSES || seen[c.index]) {
        throw ModelContractException("Model reported class index ${c.index} out of range or twice")
      }
      seen[c.index] = true
      if (c.label != pinnedLabels[c.index]) {
        throw ModelContractException(
          "Class order mismatch at index ${c.index}: runtime \"${c.label}\" vs pinned \"${pinnedLabels[c.index]}\"")
      }
      if (!c.score.isFinite()) {
        throw ModelContractException("Model reported a non-finite score for \"${c.label}\"")
      }
    }
    val top = all.sortedWith(compareByDescending<ClassScore> { it.score }.thenBy { it.index }).take(topK)
    return AuditedClassification(all.size, top)
  }
}
