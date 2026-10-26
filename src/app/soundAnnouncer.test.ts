import { describe, expect, it } from 'vitest';

import type { ActiveSound, Current } from '../core/eventTracker';
import { SECONDARY_ANNOUNCE_GAP_MS, SoundAnnouncer } from './soundAnnouncer';

const sound = (label: string, family: ActiveSound['family'] = 'voice'): ActiveSound => ({
  group: label.toLowerCase(),
  index: 0,
  rawLabel: label,
  label,
  family,
  score: 0.9,
  sinceMs: 0,
});
const sounds = (...labels: string[]): Current => {
  const [primary, ...secondary] = labels.map((l) => sound(l));
  return { kind: 'event', primary: primary!, secondary, sinceMs: 0 };
};
const none: Current = { kind: 'none', sinceMs: 0 };
const quiet: Current = { kind: 'silence', sinceMs: 0 };

describe('SoundAnnouncer (REQ-012)', () => {
  it('announces a new primary sound with what is heard alongside it', () => {
    const a = new SoundAnnouncer();
    expect(a.observe(sounds('Speech'), true, 0)).toBe('Sound detected: Speech');
    const b = new SoundAnnouncer();
    expect(b.observe(sounds('Speech', 'Music', 'Rain'), true, 0)).toBe('Sound detected: Speech. Also: Music and Rain');
  });

  it('does not repeat itself while the same sounds continue', () => {
    const a = new SoundAnnouncer();
    a.observe(sounds('Speech', 'Music'), true, 0);
    for (let t = 500; t < 20_000; t += 500) expect(a.observe(sounds('Speech', 'Music'), true, t)).toBeNull();
  });

  it('announces a newly added secondary sound, but not more often than the gap allows', () => {
    const a = new SoundAnnouncer();
    a.observe(sounds('Speech'), true, 0);
    expect(a.observe(sounds('Speech', 'Music'), true, 1000)).toBeNull(); // too soon after the last one
    expect(a.observe(sounds('Speech', 'Music', 'Rain'), true, SECONDARY_ANNOUNCE_GAP_MS)).toBe('Also hearing: Rain');
    expect(a.observe(sounds('Speech', 'Music', 'Rain'), true, SECONDARY_ANNOUNCE_GAP_MS + 5000)).toBeNull();
  });

  it('never announces removals, quiet or "no confident sound"', () => {
    const a = new SoundAnnouncer();
    a.observe(sounds('Speech', 'Music'), true, 0);
    expect(a.observe(sounds('Speech'), true, 10_000)).toBeNull();
    expect(a.observe(quiet, true, 20_000)).toBeNull();
    expect(a.observe(none, true, 30_000)).toBeNull();
  });

  it('announces a returning sound again after a gap in sounds', () => {
    const a = new SoundAnnouncer();
    a.observe(sounds('Speech'), true, 0);
    a.observe(none, true, 3000);
    expect(a.observe(sounds('Speech'), true, 6000)).toBe('Sound detected: Speech');
  });

  it('says nothing while not listening, and starts fresh afterwards', () => {
    const a = new SoundAnnouncer();
    expect(a.observe(sounds('Speech'), false, 0)).toBeNull();
    a.observe(sounds('Speech'), true, 1000);
    a.observe(sounds('Speech'), false, 2000);
    expect(a.observe(sounds('Speech'), true, 3000)).toBe('Sound detected: Speech');
  });
});
