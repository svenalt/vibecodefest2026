/** Minimum time between two haptic cues, whatever the sounds (the Recent sounds cooldown is per sound). */
export const HAPTIC_MIN_GAP_MS = 4000;

/**
 * Decides when a confirmed sound event earns one haptic cue. It is fed the newest timeline
 * event id, which already passed smoothing, debounce and the per-sound cooldown, so raw
 * classifier output, silence, unknown and re-confirmations of the same event never vibrate.
 * Events seen while inactive (setting off, not listening, background) are consumed silently.
 */
export class HapticCueGate {
  private lastSeenId: number | null = null;
  private lastFiredMs = Number.NEGATIVE_INFINITY;

  observe(eventId: number | null, active: boolean, nowMs: number): boolean {
    if (eventId === null || eventId === this.lastSeenId) return false;
    this.lastSeenId = eventId;
    if (!active || nowMs - this.lastFiredMs < HAPTIC_MIN_GAP_MS) return false;
    this.lastFiredMs = nowMs;
    return true;
  }
}
