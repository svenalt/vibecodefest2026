import Foundation

/// Overlapping ring buffer: once `windowSize` samples have arrived it hands out the latest
/// window roughly every `hop` samples. Not thread-safe; owned by a single queue.
struct WindowBuffer {
  private let windowSize: Int
  private let hop: Int
  private var samples: [Float] = []
  private var sinceLast = 0
  private var primed = false

  init(windowSize: Int, hop: Int) {
    self.windowSize = windowSize
    self.hop = hop
    samples.reserveCapacity(windowSize * 2)
  }

  /// Appends mono samples; returns a full window when one is due, otherwise nil.
  mutating func append(_ chunk: [Float]) -> [Float]? {
    samples.append(contentsOf: chunk)
    if samples.count > windowSize {
      samples.removeFirst(samples.count - windowSize)
    }
    sinceLast += chunk.count

    guard samples.count >= windowSize else { return nil }
    if !primed {
      primed = true
      sinceLast = 0
      return samples
    }
    guard sinceLast >= hop else { return nil }
    // Carry the remainder so the average cadence stays at one window per hop; after a stall, resync.
    sinceLast = sinceLast >= 2 * hop ? 0 : sinceLast - hop
    return samples
  }

  mutating func reset() {
    samples.removeAll(keepingCapacity: true)
    sinceLast = 0
    primed = false
  }
}
