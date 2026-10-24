import { describe, expect, it } from 'vitest';

import { handlesBack, INITIAL_NAV, navReducer, type NavAction, type NavState } from './navigation';

const run = (...actions: NavAction[]): NavState => actions.reduce(navReducer, INITIAL_NAV);

describe('navigation', () => {
  it('starts on Live, not immersed, and lets back leave the app from there', () => {
    expect(INITIAL_NAV).toEqual({ screen: 'live', immersive: false });
    expect(handlesBack(INITIAL_NAV)).toBe(false);
    expect(navReducer(INITIAL_NAV, { type: 'back' })).toBe(INITIAL_NAV);
  });

  it('opens Settings and returns to Live with back, repeatedly', () => {
    let s = INITIAL_NAV;
    for (let i = 0; i < 3; i++) {
      s = navReducer(s, { type: 'openSettings' });
      expect(s).toEqual({ screen: 'settings', immersive: false });
      expect(handlesBack(s)).toBe(true);
      s = navReducer(s, { type: 'back' });
      expect(s).toEqual(INITIAL_NAV);
    }
  });

  it('enters immersion only from Live with the artwork on', () => {
    expect(run({ type: 'enterImmersive', vizOn: true }).immersive).toBe(true);
    expect(run({ type: 'enterImmersive', vizOn: false }).immersive).toBe(false);
    expect(run({ type: 'openSettings' }, { type: 'enterImmersive', vizOn: true })).toEqual({
      screen: 'settings',
      immersive: false,
    });
  });

  it('leaves immersion first on back, then stays on Live', () => {
    const immersed = run({ type: 'enterImmersive', vizOn: true });
    expect(handlesBack(immersed)).toBe(true);
    const out = navReducer(immersed, { type: 'back' });
    expect(out).toEqual(INITIAL_NAV);
    expect(handlesBack(out)).toBe(false);
  });

  it('exits immersion via the button or when the visualization is turned off', () => {
    expect(run({ type: 'enterImmersive', vizOn: true }, { type: 'exitImmersive' })).toEqual(INITIAL_NAV);
    expect(run({ type: 'enterImmersive', vizOn: true }, { type: 'vizOff' })).toEqual(INITIAL_NAV);
  });
});
