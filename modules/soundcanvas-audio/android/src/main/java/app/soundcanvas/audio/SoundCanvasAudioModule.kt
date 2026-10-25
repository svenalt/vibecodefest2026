package app.soundcanvas.audio

import android.Manifest
import expo.modules.interfaces.permissions.PermissionsResponse
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SoundCanvasAudioModule : Module() {
  private var pipeline: AudioPipeline? = null

  private fun pipeline(): AudioPipeline =
    pipeline ?: AudioPipeline(
      appContext.reactContext ?: throw Exceptions.ReactContextLost(),
      AudioPipeline.Sinks(
        state = { sendEvent("onState", it) },
        classification = { sendEvent("onClassification", it) },
        features = { sendEvent("onFeatures", it) },
      ),
    ).also { pipeline = it }

  override fun definition() = ModuleDefinition {
    Name("SoundCanvasAudio")

    // Fatal failures arrive as a terminal onState `error` (after teardown). onError stays in the
    // shared contract and is treated as fatal by the JS session.
    Events("onState", "onClassification", "onFeatures", "onError")

    // Expo's permission service reports "undetermined" until it has asked once, then "denied" for
    // any refusal (including "don't ask again" and revocation in Settings), like iOS.
    AsyncFunction("getPermissionStatus") { promise: Promise ->
      val permissions = appContext.permissions ?: throw Exceptions.PermissionsModuleNotFound()
      permissions.getPermissions({ promise.resolve(statusOf(it)) }, Manifest.permission.RECORD_AUDIO)
    }

    AsyncFunction("requestPermission") { promise: Promise ->
      val permissions = appContext.permissions ?: throw Exceptions.PermissionsModuleNotFound()
      permissions.askForPermissions({ promise.resolve(statusOf(it)) }, Manifest.permission.RECORD_AUDIO)
    }

    AsyncFunction("start") { modelPath: String, promise: Promise ->
      pipeline().start(modelPath) { error ->
        if (error == null) promise.resolve(null)
        else promise.reject("ERR_SOUNDCANVAS_START", error.message ?: error.toString(), error)
      }
    }

    AsyncFunction("stop") { promise: Promise ->
      val running = pipeline
      if (running == null) promise.resolve(null) else running.stop { promise.resolve(null) }
    }

    // Capture is foreground-only: never keep the microphone open once the activity is paused.
    // This does not touch the user's persisted listening choice; the JS session layer owns that.
    OnActivityEntersBackground {
      pipeline?.stop()
    }

    OnActivityDestroys {
      pipeline?.stop()
    }

    OnDestroy {
      pipeline?.destroy()
      pipeline = null
    }
  }

  private fun statusOf(result: Map<String, PermissionsResponse>): String =
    result[Manifest.permission.RECORD_AUDIO]?.status?.status ?: "undetermined"
}
