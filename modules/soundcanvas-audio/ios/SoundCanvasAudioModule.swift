import AVFoundation
import ExpoModulesCore

public class SoundCanvasAudioModule: Module {
  private lazy var pipeline = AudioPipeline(
    sinks: AudioPipeline.Sinks(
      state: { [weak self] body in self?.sendEvent("onState", body) },
      classification: { [weak self] body in self?.sendEvent("onClassification", body) },
      features: { [weak self] body in self?.sendEvent("onFeatures", body) },
      error: { [weak self] message in self?.sendEvent("onError", ["message": message]) }
    ))

  public func definition() -> ModuleDefinition {
    Name("SoundCanvasAudio")

    Events("onState", "onClassification", "onFeatures", "onError")

    AsyncFunction("getPermissionStatus") { () -> String in
      Self.permissionStatus()
    }

    AsyncFunction("requestPermission") { (promise: Promise) in
      Self.requestPermission { promise.resolve($0) }
    }

    AsyncFunction("start") { (modelPath: String, promise: Promise) in
      do {
        try self.pipeline.start(modelPath: modelPath)
        promise.resolve(nil)
      } catch {
        promise.reject("ERR_SOUNDCANVAS_START", error.localizedDescription)
      }
    }

    AsyncFunction("stop") { () -> Void in
      self.pipeline.stop()
    }

    // Capture is foreground-only: never keep the microphone open once the app leaves the foreground.
    OnAppEntersBackground {
      self.pipeline.stop()
    }

    OnDestroy {
      self.pipeline.stop()
    }
  }

  private static func permissionStatus() -> String {
    if #available(iOS 17.0, *) {
      switch AVAudioApplication.shared.recordPermission {
      case .granted: return "granted"
      case .denied: return "denied"
      default: return "undetermined"
      }
    } else {
      switch AVAudioSession.sharedInstance().recordPermission {
      case .granted: return "granted"
      case .denied: return "denied"
      default: return "undetermined"
      }
    }
  }

  private static func requestPermission(_ completion: @escaping (String) -> Void) {
    if #available(iOS 17.0, *) {
      AVAudioApplication.requestRecordPermission { granted in
        completion(granted ? "granted" : "denied")
      }
    } else {
      AVAudioSession.sharedInstance().requestRecordPermission { granted in
        completion(granted ? "granted" : "denied")
      }
    }
  }
}
