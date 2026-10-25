import type { Current } from '../core/eventTracker';
import type { SessionSnapshot } from '../core/soundSession';
import type { PredictionCategory } from '../core/types';
import { CATEGORY_DISPLAY } from '../core/yamnet/taxonomy';

export type MicKind = 'on' | 'off' | 'starting' | 'stopping' | 'blocked' | 'error';

export interface MicState {
  kind: MicKind;
  label: string;
}

/** Microphone truth, in priority order. Never reports ON unless capture is actually listening. */
export function micState(snapshot: SessionSnapshot, busy: boolean): MicState {
  const { status } = snapshot.capture;
  if (status === 'listening') return { kind: 'on', label: 'Microphone ON' };
  if (status === 'error' || snapshot.error !== null) return { kind: 'error', label: 'Microphone error' };
  if (snapshot.permission === 'denied') return { kind: 'blocked', label: 'Microphone blocked' };
  if (status === 'stopping') return { kind: 'stopping', label: 'Microphone stopping…' };
  if (status === 'starting' || busy) return { kind: 'starting', label: 'Microphone starting…' };
  return { kind: 'off', label: 'Microphone OFF' };
}

/** `event` = a real confirmed detection; `calm` = listening with nothing to report; `off` and `alert` are mic states. */
export type SoundTone = 'event' | 'calm' | 'off' | 'alert';

export interface SoundSummary {
  /** Icon to show; `null` means "use the microphone icon for this mic state". */
  category: PredictionCategory | null;
  title: string;
  detail: string;
  tone: SoundTone;
}

/**
 * Plain-English description of what the phone hears now. No raw labels, scores or
 * probabilistic wording: those live in Diagnostics.
 */
export function soundSummary(mic: MicKind, current: Current, hasPrediction: boolean): SoundSummary {
  switch (mic) {
    case 'blocked':
      return {
        category: null,
        title: 'Microphone blocked',
        detail: 'Allow microphone access in system settings to see sounds here.',
        tone: 'alert',
      };
    case 'error':
      return { category: null, title: 'Listening stopped', detail: 'A problem stopped the microphone.', tone: 'alert' };
    case 'starting':
      return { category: null, title: 'Starting…', detail: 'Turning the microphone on.', tone: 'off' };
    case 'stopping':
      return { category: null, title: 'Stopping…', detail: 'Turning the microphone off.', tone: 'off' };
    case 'off':
      return {
        category: null,
        title: 'Not listening',
        detail: 'Turn listening on in Settings to see sounds here.',
        tone: 'off',
      };
    case 'on':
      break;
  }
  if (current.kind === 'event') {
    return { category: current.category, title: CATEGORY_DISPLAY[current.category], detail: 'Detected just now', tone: 'event' };
  }
  if (current.kind === 'silence') {
    return { category: 'silence', title: CATEGORY_DISPLAY.silence, detail: 'Very little sound right now', tone: 'calm' };
  }
  return {
    category: 'unknown',
    title: 'Listening for sounds',
    detail: hasPrediction ? 'Nothing recognized right now' : 'First result in about a second',
    tone: 'calm',
  };
}

/** Immersive presentations: the artwork alone, or the artwork with the live sound card. */
export type Presentation = 'art' | 'sounds';

/**
 * The card shown over the immersive artwork, or null in Pure Art. In Art + Sounds it is always
 * present and always current: the confirmed sound while the microphone is on, otherwise the
 * truthful listening status, so a past detection can never linger on screen.
 */
export function immersiveCard(
  presentation: Presentation,
  mic: MicKind,
  current: Current,
  hasPrediction: boolean,
): SoundSummary | null {
  return presentation === 'sounds' ? soundSummary(mic, current, hasPrediction) : null;
}
