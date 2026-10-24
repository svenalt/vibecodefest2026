import AVFoundation
import Foundation

enum PipelineError: LocalizedError {
  case alreadyRunning
  case noInput
  case converterUnavailable

  var errorDescription: String? {
    switch self {
    case .alreadyRunning: return "Capture is already running"
    case .noInput: return "No usable microphone input (sample rate or channel count is 0)"
    case .converterUnavailable: return "Cannot convert the microphone format to 16 kHz mono"
    }
  }
}

/// One AVAudioEngine capture pipeline feeding both the YAMNet classifier and the feature
/// extractor, so there is never a second competing microphone session.
///
///   mic -> AVAudioEngine tap -> AVAudioConverter (16 kHz mono float32)
///       -> processingQueue: features (every 50 ms) + overlapping window buffer
///       -> inferenceQueue: YAMNet (one in flight at a time; extra windows are dropped)
final class AudioPipeline {
  struct Sinks {
    let state: ([String: Any?]) -> Void
    let classification: ([String: Any?]) -> Void
    let features: ([String: Any?]) -> Void
    let error: (String) -> Void
  }

  private static let topK = 10
  private static let featureWindowSamples = 800

  private let sinks: Sinks
  private let targetFormat = AVAudioFormat(
    commonFormat: .pcmFormatFloat32, sampleRate: YamnetClassifier.sampleRate, channels: 1,
    interleaved: false)!

  /// Serializes start/stop. Never taken from the processing or inference queues.
  private let lifecycleLock = NSLock()
  /// Guards `active`/`epoch` only; held briefly, never while waiting on a queue.
  private let stateLock = NSLock()
  private let engine = AVAudioEngine()
  private var active = false
  private var epoch = 0
  private var observers: [NSObjectProtocol] = []

  private let processingQueue = DispatchQueue(label: "soundcanvas.processing", qos: .userInitiated)
  private let inferenceQueue = DispatchQueue(label: "soundcanvas.inference", qos: .userInitiated)

  // Owned by processingQueue.
  private var window = WindowBuffer(windowSize: YamnetClassifier.windowSamples, hop: 7_800)
  private var features = FeatureExtractor(
    sampleRate: Float(YamnetClassifier.sampleRate), windowSamples: AudioPipeline.featureWindowSamples)
  private var totalSamples = 0
  private var inferenceInFlight = false

  // Owned by inferenceQueue.
  private var classifier: YamnetClassifier?

  init(sinks: Sinks) {
    self.sinks = sinks
  }

  func start(modelPath: String) throws {
    lifecycleLock.lock()
    defer { lifecycleLock.unlock() }
    guard !isActive else { throw PipelineError.alreadyRunning }

    emitState("starting")
    do {
      try startLocked(modelPath: modelPath)
    } catch {
      teardownLocked()
      emitState("error", error: error.localizedDescription)
      throw error
    }
  }

  /// Releases the microphone and all processing. Safe to call repeatedly.
  func stop() {
    lifecycleLock.lock()
    defer { lifecycleLock.unlock() }
    emitState("stopping")
    teardownLocked()
    emitState("idle")
  }

  // MARK: - Lifecycle

  private func startLocked(modelPath: String) throws {
    let session = AVAudioSession.sharedInstance()
    try session.setCategory(.record, mode: .measurement, options: [])
    try session.setPreferredSampleRate(YamnetClassifier.sampleRate)
    try session.setActive(true, options: [])

    let loaded = try YamnetClassifier(modelPath: modelPath)
    inferenceQueue.sync { classifier = loaded }

    let input = engine.inputNode
    let hardwareFormat = input.outputFormat(forBus: 0)
    guard hardwareFormat.sampleRate > 0, hardwareFormat.channelCount > 0 else {
      throw PipelineError.noInput
    }
    guard let converter = AVAudioConverter(from: hardwareFormat, to: targetFormat) else {
      throw PipelineError.converterUnavailable
    }

    let myEpoch = activate()
    processingQueue.sync {
      window.reset()
      features.reset()
      totalSamples = 0
      inferenceInFlight = false
    }

    input.installTap(onBus: 0, bufferSize: 4096, format: hardwareFormat) { [weak self] buffer, _ in
      self?.handle(buffer: buffer, converter: converter, epoch: myEpoch)
    }
    engine.prepare()
    try engine.start()
    observeInterruptions()

    emitState(
      "listening",
      hardware: (hardwareFormat.sampleRate, Int(hardwareFormat.channelCount)))
  }

  private func teardownLocked() {
    deactivate()  // invalidates any in-flight tap and queue callbacks
    removeObservers()
    engine.inputNode.removeTap(onBus: 0)  // no-op if no tap is installed
    engine.stop()
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    processingQueue.sync {
      window.reset()
      features.reset()
      totalSamples = 0
      inferenceInFlight = false
    }
    inferenceQueue.sync { classifier = nil }
  }

  // MARK: - Audio path

  /// Runs on the AVAudioEngine tap thread: convert, then hand off immediately.
  private func handle(buffer: AVAudioPCMBuffer, converter: AVAudioConverter, epoch tapEpoch: Int) {
    guard buffer.frameLength > 0, isCurrent(tapEpoch) else { return }

    let ratio = targetFormat.sampleRate / buffer.format.sampleRate
    let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 64
    guard let output = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: capacity) else {
      return
    }

    var consumed = false
    var conversionError: NSError?
    let status = converter.convert(to: output, error: &conversionError) { _, inputStatus in
      if consumed {
        inputStatus.pointee = .noDataNow
        return nil
      }
      consumed = true
      inputStatus.pointee = .haveData
      return buffer
    }
    if status == .error {
      sinks.error("Audio conversion failed: \(conversionError?.localizedDescription ?? "unknown")")
      return
    }

    let count = Int(output.frameLength)
    guard count > 0, let channel = output.floatChannelData?[0] else { return }
    let samples = Array(UnsafeBufferPointer(start: channel, count: count))

    processingQueue.async { [weak self] in
      self?.ingest(samples, epoch: tapEpoch)
    }
  }

  private func ingest(_ samples: [Float], epoch tapEpoch: Int) {
    guard isCurrent(tapEpoch) else { return }

    totalSamples += samples.count
    features.process(samples) { frame in
      sinks.features([
        "timestampMs": streamTimeMs(),
        "rms": Double(frame.rms),
        "peak": Double(frame.peak),
        "bands": [
          "low": Double(frame.low),
          "mid": Double(frame.mid),
          "high": Double(frame.high),
        ],
      ])
    }

    guard let ready = window.append(samples), !inferenceInFlight else { return }
    inferenceInFlight = true
    let timestampMs = streamTimeMs()

    inferenceQueue.async { [weak self] in
      guard let self = self else { return }
      defer {
        self.processingQueue.async { self.inferenceInFlight = false }
      }
      guard self.isCurrent(tapEpoch), let classifier = self.classifier else { return }
      do {
        let output = try classifier.classify(window: ready, topK: AudioPipeline.topK)
        guard self.isCurrent(tapEpoch) else { return }
        self.sinks.classification([
          "timestampMs": timestampMs,
          "classCount": output.classCount,
          "top": output.top.map { ["index": $0.index, "label": $0.label, "score": Double($0.score)] },
        ])
      } catch {
        self.sinks.error("Inference failed: \(error.localizedDescription)")
      }
    }
  }

  /// Stream time of the newest sample, in ms. Only call on processingQueue.
  private func streamTimeMs() -> Int {
    totalSamples * 1000 / Int(YamnetClassifier.sampleRate)
  }

  // MARK: - Epoch

  private var isActive: Bool {
    stateLock.lock()
    defer { stateLock.unlock() }
    return active
  }

  private func activate() -> Int {
    stateLock.lock()
    defer { stateLock.unlock() }
    active = true
    epoch += 1
    return epoch
  }

  private func deactivate() {
    stateLock.lock()
    defer { stateLock.unlock() }
    active = false
    epoch += 1
  }

  private func isCurrent(_ tapEpoch: Int) -> Bool {
    stateLock.lock()
    defer { stateLock.unlock() }
    return active && tapEpoch == epoch
  }

  // MARK: - State and interruptions

  private func emitState(
    _ status: String, error: String? = nil, hardware: (rate: Double, channels: Int)? = nil
  ) {
    sinks.state([
      "status": status,
      "hardwareSampleRate": hardware?.rate,
      "hardwareChannelCount": hardware?.channels,
      "analysisSampleRate": status == "listening" ? YamnetClassifier.sampleRate : nil,
      "analysisChannelCount": status == "listening" ? 1 : nil,
      "error": error,
    ])
  }

  private func observeInterruptions() {
    let center = NotificationCenter.default
    observers.append(
      center.addObserver(
        forName: AVAudioSession.interruptionNotification, object: nil, queue: nil
      ) { [weak self] note in
        let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
        if raw == AVAudioSession.InterruptionType.began.rawValue {
          self?.failAsync("Audio was interrupted (for example by a call). Start listening again.")
        }
      })
    observers.append(
      center.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: nil) {
        [weak self] _ in
        self?.failAsync("The audio route changed. Start listening again.")
      })
  }

  private func removeObservers() {
    observers.forEach(NotificationCenter.default.removeObserver)
    observers.removeAll()
  }

  /// Observer callbacks must not hold the lifecycle lock while we re-enter stop().
  private func failAsync(_ message: String) {
    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      guard let self = self else { return }
      self.stop()
      self.sinks.error(message)
    }
  }
}
