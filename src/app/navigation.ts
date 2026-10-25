/**
 * App view state: Live is the root, Settings is a secondary screen, and immersive mode is a
 * presentation of Live. Pure, so transitions are unit-tested; it never touches the session.
 */
export interface NavState {
  screen: 'live' | 'settings';
  immersive: boolean;
}

export type NavAction =
  | { type: 'openSettings' }
  | { type: 'enterImmersive' }
  | { type: 'exitImmersive' }
  | { type: 'back' };

export const INITIAL_NAV: NavState = { screen: 'live', immersive: false };

export function navReducer(state: NavState, action: NavAction): NavState {
  switch (action.type) {
    case 'openSettings':
      return { screen: 'settings', immersive: false };
    case 'enterImmersive':
      // Immersion is a presentation of Live; the artwork is always shown (REQ-010).
      return state.screen === 'live' ? { ...state, immersive: true } : state;
    case 'exitImmersive':
      return state.immersive ? { ...state, immersive: false } : state;
    case 'back':
      if (state.immersive) return { ...state, immersive: false };
      if (state.screen === 'settings') return { ...state, screen: 'live' };
      return state;
  }
}

/** Whether a back action (Android hardware back) is handled in-app rather than leaving it. */
export function handlesBack(state: NavState): boolean {
  return state.immersive || state.screen !== 'live';
}
