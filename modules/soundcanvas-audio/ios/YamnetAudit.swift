import Foundation

/// YAMNet output contract shared with android/.../YamnetContract.kt and src/core/yamnet/constants.ts.
enum YamnetContract {
  static let numClasses = 521
  /// Classes sent to JS per inference; pinned with the Kotlin and TypeScript constants.
  static let topK = 10
}

struct ClassScore {
  let index: Int
  let label: String
  let score: Float
}

/// The runtime output does not match the pinned model contract; results cannot be trusted.
struct ModelContractError: LocalizedError {
  let message: String
  var errorDescription: String? { message }
}

/// Same rules as Android's ClassificationAudit: the complete output is checked before anything is
/// filtered (exactly 521 classes, each index once, finite scores), then the `topK` best are kept,
/// best first, ties by lower index. Labels are checked against the pinned list in JS on iOS.
enum ClassificationAudit {
  static func audit(_ all: [ClassScore], topK: Int = YamnetContract.topK) throws -> [ClassScore] {
    guard all.count == YamnetContract.numClasses else {
      throw ModelContractError(message: "Model reported \(all.count) classes, expected \(YamnetContract.numClasses)")
    }
    var seen = [Bool](repeating: false, count: YamnetContract.numClasses)
    for c in all {
      guard c.index >= 0, c.index < YamnetContract.numClasses, !seen[c.index] else {
        throw ModelContractError(message: "Model reported class index \(c.index) out of range or twice")
      }
      seen[c.index] = true
      guard c.score.isFinite else {
        throw ModelContractError(message: "Model reported a non-finite score for \"\(c.label)\"")
      }
    }
    let ranked = all.sorted { $0.score != $1.score ? $0.score > $1.score : $0.index < $1.index }
    return Array(ranked.prefix(topK))
  }
}
