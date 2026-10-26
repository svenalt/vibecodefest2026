import { currentSounds, type Current } from '../core/eventTracker';
import { joinLabels } from '../ui/status';

/** Minimum time between two announcements that only add a secondary sound. */
export const SECONDARY_ANNOUNCE_GAP_MS = 4000;

/**
 * Decides what to tell screen readers about the confirmed sounds. A new primary sound is always
 * announced (it already passed smoothing and hold); a new secondary sound only now and then, so
 * busy scenes do not turn into a stream of speech. Renames within one sound, removals, quiet and
 * "no confident sound" are never announced: the sound tile states them as text.
 */
export class SoundAnnouncer {
  private primary: string | null = null;
  private shown = new Set<string>();
  private lastMs = Number.NEGATIVE_INFINITY;

  observe(current: Current, listening: boolean, nowMs: number): string | null {
    const sounds = listening ? currentSounds(current) : [];
    const [primary, ...secondary] = sounds;
    const added = secondary.filter((s) => !this.shown.has(s.group));
    const newPrimary = primary !== undefined && primary.group !== this.primary;
    this.primary = primary?.group ?? null;
    this.shown = new Set(sounds.map((s) => s.group));

    if (newPrimary) {
      this.lastMs = nowMs;
      const also = secondary.length > 0 ? `. Also: ${joinLabels(secondary.map((s) => s.label))}` : '';
      return `Sound detected: ${primary.label}${also}`;
    }
    if (added.length > 0 && nowMs - this.lastMs >= SECONDARY_ANNOUNCE_GAP_MS) {
      this.lastMs = nowMs;
      return `Also hearing: ${joinLabels(added.map((s) => s.label))}`;
    }
    return null;
  }
}
