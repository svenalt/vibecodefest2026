import { describe, expect, it } from 'vitest';

import { HAPTIC_MIN_GAP_MS, HapticCueGate } from './hapticCue';

describe('HapticCueGate', () => {
  it('fires once per new confirmed event while active', () => {
    const g = new HapticCueGate();
    expect(g.observe(null, true, 0)).toBe(false);
    expect(g.observe(1, true, 1_000)).toBe(true);
    expect(g.observe(1, true, 9_000)).toBe(false); // same event, re-rendered
  });

  it('rate-limits events of different categories that arrive close together', () => {
    const g = new HapticCueGate();
    expect(g.observe(1, true, 0)).toBe(true);
    expect(g.observe(2, true, HAPTIC_MIN_GAP_MS - 1)).toBe(false);
    expect(g.observe(3, true, HAPTIC_MIN_GAP_MS + 10)).toBe(true);
  });

  it('a rate-limited event is consumed, not replayed later', () => {
    const g = new HapticCueGate();
    g.observe(1, true, 0);
    expect(g.observe(2, true, 100)).toBe(false);
    expect(g.observe(2, true, HAPTIC_MIN_GAP_MS * 2)).toBe(false);
  });

  it('never fires while inactive (setting off, stopped or in the background)', () => {
    const g = new HapticCueGate();
    expect(g.observe(1, false, 0)).toBe(false);
    // Turning the setting on afterwards does not replay the event seen while off.
    expect(g.observe(1, true, 10_000)).toBe(false);
    expect(g.observe(2, true, 20_000)).toBe(true);
  });

  it('an emptied timeline (new session) does not fire', () => {
    const g = new HapticCueGate();
    g.observe(4, true, 0);
    expect(g.observe(null, true, 10_000)).toBe(false);
    expect(g.observe(5, true, 20_000)).toBe(true);
  });
});
