Pod::Spec.new do |s|
  s.name           = 'SoundCanvasAudio'
  s.version        = '0.1.0'
  s.summary        = 'Native microphone capture and on-device YAMNet inference for SoundCanvas'
  s.description    = 'AVAudioEngine capture, 16 kHz mono resampling and MediaPipe Tasks Audio YAMNet classification behind one Expo native module.'
  s.author         = 'SoundCanvas'
  s.homepage       = 'https://github.com/svenalt/vibecodefest2026'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/svenalt/vibecodefest2026.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  # Pinned to match docs/model.md; MediaPipeTasksCommon 1.0.0 comes in transitively.
  s.dependency 'MediaPipeTasksAudio', '1.0.0'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = '**/*.{h,m,mm,swift}'
end
