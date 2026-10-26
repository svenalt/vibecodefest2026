import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { EventTracker, currentSounds, type ActiveSound } from './eventTracker';
import { normalizeClassification } from './normalize';
import { YAMNET_LABELS } from './yamnet/labels';
import { TAXONOMY, type VisualFamily } from './yamnet/taxonomy';

/**
 * REQ-012 host evaluation. scripts/eval-yamnet-clips.py generates 58 rights-clear clips (40
 * isolated, 18 mixtures), runs the pinned YAMNet model on them window by window and stores the
 * top 10 per window, as the native adapters deliver it. This replays those windows through the
 * shared normalization and tracker. Synthetic sounds are not field recordings: this guards
 * thresholds, quiet/noise behaviour and simultaneous labels; it does not measure accuracy.
 * Set CLIP_REPORT=1 to print the per-clip table used in docs/model.md.
 */
interface Clip {
  id: string;
  kind: 'isolated' | 'mixture';
  expect: VisualFamily[];
  windows: { timestampMs: number; top: [number, number][] }[];
}

const fixture: { model_sha256: string; topK: number; clips: Clip[] } = JSON.parse(
  readFileSync(new URL('./testing/fixtures/yamnet-clips.json', import.meta.url), 'utf8'),
);

interface Replay {
  clip: Clip;
  /** Shown sounds after each window, primary first. */
  shown: (readonly ActiveSound[])[];
  quiet: number;
}

function replay(clip: Clip): Replay {
  const tracker = new EventTracker();
  const shown: (readonly ActiveSound[])[] = [];
  let quiet = 0;
  for (const w of clip.windows) {
    const top = w.top.map(([index, score]) => ({ index, label: YAMNET_LABELS[index]!, score }));
    const snap = tracker.push(normalizeClassification({ timestampMs: w.timestampMs, top, classCount: 521 }, 'ios'));
    shown.push(currentSounds(snap.current));
    if (snap.current.kind === 'silence') quiet++;
  }
  return { clip, shown, quiet };
}

const replays = fixture.clips.map(replay);
const byId = new Map(replays.map((r) => [r.clip.id, r]));
const families = (r: Replay) => new Set(r.shown.flat().map((s) => s.family));
const hit = (r: Replay) =>
  r.clip.expect.length === 0 ? families(r).size === 0 : r.clip.expect.some((f) => families(r).has(f));
const primaryWindows = (r: Replay, family: VisualFamily) => r.shown.filter((s) => s[0]?.family === family).length;

if (process.env.CLIP_REPORT) {
  const rows = replays.map((r) => {
    const counts = new Map<string, number>();
    for (const s of r.shown.flat()) counts.set(s.label, (counts.get(s.label) ?? 0) + 1);
    const shown = [...counts].map(([label, n]) => `${label} ${n}/${r.shown.length}`).join(', ') || '-';
    return `| ${r.clip.id} | ${r.clip.expect.join(', ') || 'none'} | ${shown} | ${r.quiet} | ${hit(r) ? 'yes' : 'no'} |`;
  });
  console.log(['| Clip | Expected families | Shown (windows) | Quiet | Hit |', '|---|---|---|---|---|', ...rows].join('\n'));
}

describe('host clip evaluation (REQ-012)', () => {
  it('replays the pinned model with the shared top-K contract', () => {
    expect(fixture.model_sha256).toBe('4d8b4a53282dc83ef04e3e7dbc4fbc98082e34e44ed798e16c3a0cdd4c584faf');
    expect(fixture.topK).toBe(10);
    expect(replays.filter((r) => r.clip.kind === 'isolated').length).toBeGreaterThanOrEqual(30);
    expect(replays.filter((r) => r.clip.kind === 'mixture').length).toBeGreaterThanOrEqual(15);
    const expected = new Set(replays.flatMap((r) => r.clip.expect));
    expect(expected.size).toBeGreaterThanOrEqual(8);
  });

  it('silence, near-silence and room tone show Quiet and never a sound', () => {
    for (const id of ['silence', 'near_silence', 'room_tone']) {
      const r = byId.get(id)!;
      expect(r.shown.flat(), id).toEqual([]);
      expect(r.quiet, id).toBeGreaterThanOrEqual(r.shown.length - 1);
    }
  });

  it('never shows more than three sounds, two of one family, or room/recording context', () => {
    for (const r of replays) {
      for (const sounds of r.shown) {
        expect(sounds.length, r.clip.id).toBeLessThanOrEqual(3);
        expect(new Set(sounds.map((s) => s.family)).size, r.clip.id).toBe(sounds.length);
        for (const s of sounds) expect(TAXONOMY[s.index]!.role, `${r.clip.id}: ${s.label}`).toBe('sound');
      }
    }
  });

  it('no clip in the set triggers a bang, siren, alarm, scream or other strong claim', () => {
    const strong = new Set(['bang', 'pop', 'siren', 'screaming', 'crying', 'heartbeat', 'body', 'snake']);
    for (const r of replays) {
      for (const s of r.shown.flat()) expect(strong.has(s.group), `${r.clip.id}: ${s.label}`).toBe(false);
    }
  });

  it('the original speech and music cases stay solid (same as the six-category build)', () => {
    for (const r of replays.filter((x) => x.clip.id.startsWith('speech_'))) {
      expect(primaryWindows(r, 'voice'), r.clip.id).toBeGreaterThanOrEqual(r.shown.length - 1);
    }
    for (const r of replays.filter((x) => x.clip.id.startsWith('music_'))) {
      expect(primaryWindows(r, 'music'), r.clip.id).toBeGreaterThanOrEqual(r.shown.length - 1);
    }
  });

  it('shows simultaneous sounds when the model supports both', () => {
    const r = byId.get('speech+groove')!;
    expect(r.shown.some((s) => s.some((x) => x.family === 'voice') && s.some((x) => x.family === 'music'))).toBe(true);
  });

  it('keeps the measured hit rates (update with evidence when thresholds change)', () => {
    const isolated = replays.filter((r) => r.clip.kind === 'isolated');
    const mixtures = replays.filter((r) => r.clip.kind === 'mixture');
    expect(isolated.filter(hit).length).toBeGreaterThanOrEqual(21);
    expect(mixtures.filter(hit).length).toBeGreaterThanOrEqual(15);
  });
});
