import Foundation

struct AudioFeatureFrame {
  let rms: Float
  let peak: Float
  let low: Float
  let mid: Float
  let high: Float
}

/// Cheap per-window acoustic features from the same 16 kHz mono stream the classifier uses.
/// Three broad bands are split with one-pole filters (below ~250 Hz, 250 Hz-2 kHz, above 2 kHz).
/// Not thread-safe; owned by a single queue.
struct FeatureExtractor {
  private let windowSamples: Int
  private let lowCoefficient: Float
  private let highCoefficient: Float

  private var lowState: Float = 0
  private var highState: Float = 0
  private var count = 0
  private var sumAll: Float = 0
  private var sumLow: Float = 0
  private var sumMid: Float = 0
  private var sumHigh: Float = 0
  private var peak: Float = 0

  init(sampleRate: Float, windowSamples: Int) {
    self.windowSamples = windowSamples
    lowCoefficient = 1 - exp(-2 * Float.pi * 250 / sampleRate)
    highCoefficient = 1 - exp(-2 * Float.pi * 2000 / sampleRate)
  }

  /// Feeds samples; calls `emit` once per completed window (800 samples = 50 ms at 16 kHz).
  mutating func process(_ chunk: [Float], emit: (AudioFeatureFrame) -> Void) {
    for x in chunk {
      lowState += lowCoefficient * (x - lowState)
      highState += highCoefficient * (x - highState)
      let low = lowState
      let mid = highState - lowState
      let high = x - highState

      sumAll += x * x
      sumLow += low * low
      sumMid += mid * mid
      sumHigh += high * high
      peak = max(peak, abs(x))
      count += 1

      if count == windowSamples {
        emit(finishWindow())
      }
    }
  }

  mutating func reset() {
    lowState = 0
    highState = 0
    clearWindow()
  }

  private mutating func finishWindow() -> AudioFeatureFrame {
    let n = Float(count)
    let bandTotal = sumLow + sumMid + sumHigh
    let frame = AudioFeatureFrame(
      rms: min(1, (sumAll / n).squareRoot()),
      peak: min(1, peak),
      low: bandTotal > 1e-12 ? sumLow / bandTotal : 0,
      mid: bandTotal > 1e-12 ? sumMid / bandTotal : 0,
      high: bandTotal > 1e-12 ? sumHigh / bandTotal : 0
    )
    clearWindow()
    return frame
  }

  private mutating func clearWindow() {
    count = 0
    sumAll = 0
    sumLow = 0
    sumMid = 0
    sumHigh = 0
    peak = 0
  }
}
