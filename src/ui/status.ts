import type { SaveState } from '../app/preferences';
import type { Current } from '../core/eventTracker';
import type { SessionSnapshot } from '../core/soundSession';
import { STATE_DISPLAY, type VisualFamily } from '../core/yamnet/taxonomy';
import type { SoundIcon } from './icons';

export type MicKind = 'on' | 'off' | 'starting' | 'stopping' | 'blocked' | 'error';

export interface MicState {
  kind: MicKind;
  label: string;
}

/**
 * Microphone truth, in priority order. Never reports ON unless capture is actually listening, and
 * a failure wins over a capture that has not finished stopping yet.
 */
export function micState(snapshot: SessionSnapshot, busy: boolean): MicState {
  const { status } = snapshot.capture;
  if (status === 'error' || snapshot.error !== null) return { kind: 'error', label: 'Microphone error' };
  if (status === 'listening') return { kind: 'on', label: 'Microphone ON' };
  if (snapshot.permission === 'denied') return { kind: 'blocked', label: 'Microphone blocked' };
  if (status === 'stopping') return { kind: 'stopping', label: 'Microphone stopping…' };
  if (status === 'starting' || busy) return { kind: 'starting', label: 'Microphone starting…' };
  return { kind: 'off', label: 'Microphone OFF' };
}

/** `event` = a real confirmed detection; `calm` = listening with nothing to report; `off` and `alert` are mic states. */
export type SoundTone = 'event' | 'calm' | 'off' | 'alert';

/** A secondary sound recognized at the same time as the primary one. */
export interface AlsoSound {
  label: string;
  family: VisualFamily;
}

export interface SoundSummary {
  /** Icon to show; `null` means "use the microphone icon for this mic state". */
  icon: SoundIcon | null;
  title: string;
  detail: string;
  tone: SoundTone;
  /** Up to two other sounds recognized at the same time; empty unless `tone` is `event`. */
  also: readonly AlsoSound[];
}

const NONE: readonly AlsoSound[] = [];

/**
 * Plain-English description of what the phone hears now: the primary sound as the title, other
 * concurrent sounds in `also`. No raw labels, scores or probabilistic wording: those live in
 * Diagnostics.
 */
export function soundSummary(mic: MicKind, current: Current, hasPrediction: boolean): SoundSummary {
  switch (mic) {
    case 'blocked':
      return {
        icon: null,
        title: 'Microphone blocked',
        detail: 'Allow microphone access in system settings to see sounds here.',
        tone: 'alert',
        also: NONE,
      };
    case 'error':
      return { icon: null, title: 'Listening stopped', detail: 'A problem stopped the microphone.', tone: 'alert', also: NONE };
    case 'starting':
      return { icon: null, title: 'Starting…', detail: 'Turning the microphone on.', tone: 'off', also: NONE };
    case 'stopping':
      return { icon: null, title: 'Stopping…', detail: 'Turning the microphone off.', tone: 'off', also: NONE };
    case 'off':
      return {
        icon: null,
        title: 'Not listening',
        detail: 'Turn listening on in Settings to see sounds here.',
        tone: 'off',
        also: NONE,
      };
    case 'on':
      break;
  }
  if (current.kind === 'event') {
    return {
      icon: current.primary.family,
      title: current.primary.label,
      detail: 'Detected just now',
      tone: 'event',
      also: current.secondary.map((s) => ({ label: s.label, family: s.family })),
    };
  }
  if (current.kind === 'silence') {
    return { icon: 'silence', title: STATE_DISPLAY.silence, detail: 'Very little sound right now', tone: 'calm', also: NONE };
  }
  return {
    icon: 'unknown',
    title: 'Listening for sounds',
    detail: hasPrediction ? `${STATE_DISPLAY.unknown} right now` : 'First result in about a second',
    tone: 'calm',
    also: NONE,
  };
}

/** "Speech", "Speech and Music", "Speech, Music and Traffic". */
export function joinLabels(labels: readonly string[]): string {
  if (labels.length <= 1) return labels[0] ?? '';
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

/** One sentence for screen readers with everything the tile shows. */
export function summaryAccessibilityLabel(s: SoundSummary): string {
  const also = s.also.length > 0 ? ` Also: ${joinLabels(s.also.map((a) => a.label))}.` : '';
  return `Current sound: ${s.title}.${also} ${s.detail}.`;
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

/**
 * The line under Start/Stop in Settings. It only promises that a Stop lasts across restarts once
 * that choice is actually stored.
 */
export function listeningHint(listeningOn: boolean, desired: boolean, save: SaveState): string {
  if (listeningOn) return 'Listening is on. It pauses whenever you leave AUVIONA and resumes when you come back.';
  if (desired) return 'Listening is not running right now. Start listening to try again.';
  if (save === 'saved') {
    return 'Listening is off. It stays off, even after you leave or restart AUVIONA, until you start it again.';
  }
  if (save === 'saving') return 'Listening is off. Saving this choice for the next launch…';
  return 'Listening is off for now.';
}

/**
 * Shown with a Retry action when the latest settings could not be stored. `launchListening` is
 * what the next launch would do with what storage holds.
 */
export function saveNotice(save: SaveState, listening: boolean, launchListening: boolean): string | null {
  if (save !== 'failed') return null;
  if (listening !== launchListening) {
    return listening
      ? 'Listening is on, but this choice could not be saved for the next launch.'
      : 'Listening is stopped, but this choice could not be saved for the next launch.';
  }
  return 'Your settings could not be saved for the next launch.';
}
