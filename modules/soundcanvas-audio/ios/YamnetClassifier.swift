import Foundation
import MediaPipeTasksAudio

struct ClassificationOutput {
  /// Number of classes the model returned for this window (always 521 once audited).
  let classCount: Int
  /// Highest-scoring classes, best first; ties keep the lower index first.
  let top: [ClassScore]
}

enum YamnetError: LocalizedError {
  case emptyResult

  var errorDescription: String? {
    switch self {
    case .emptyResult: return "YAMNet returned no classification result"
    }
  }
}

/// Runs the bundled YAMNet TFLite model through MediaPipe Tasks Audio in audio-clips mode.
/// Each call receives exactly one 15,600-sample, 16 kHz, mono, float32 window, so the
/// classifier performs a single inference and the windowing/hop stays under our control.
final class YamnetClassifier {
  static let sampleRate = 16_000.0
  static let windowSamples = 15_600

  private let classifier: AudioClassifier
  private let format = AudioDataFormat(channelCount: 1, sampleRate: YamnetClassifier.sampleRate)

  init(modelPath: String) throws {
    let options = AudioClassifierOptions()
    options.baseOptions.modelAssetPath = modelPath
    options.runningMode = .audioClips
    // Return every class (no truncation, no score filtering) so the 521-class contract can be checked.
    options.maxResults = -1
    options.scoreThreshold = 0
    classifier = try AudioClassifier(options: options)
  }

  func classify(window: [Float], topK: Int) throws -> ClassificationOutput {
    let audio = AudioData(format: format, sampleCount: UInt(window.count))
    let buffer = window.withUnsafeBufferPointer {
      MPPFloatBuffer(data: $0.baseAddress, length: UInt(window.count))
    }
    try audio.load(buffer: buffer, offset: 0, length: UInt(window.count))

    let result = try classifier.classify(audioClip: audio)
    guard let categories = result.classificationResults.first?.classifications.first?.categories,
      !categories.isEmpty
    else {
      throw YamnetError.emptyResult
    }

    let all = categories.map {
      ClassScore(index: $0.index, label: $0.categoryName ?? $0.displayName ?? "", score: $0.score)
    }
    let top = try ClassificationAudit.audit(all, topK: topK)
    return ClassificationOutput(classCount: all.count, top: top)
  }
}
