import { createContext, createElement, useContext, useMemo, type ReactNode } from 'react';

import { usePreferences } from '../app/PreferencesProvider';

export type ThemeMode = 'dark' | 'light';

export interface Palette {
  mode: ThemeMode;
  /** Artistic lavender accent (REQ-002 token). */
  art: string;
  /** Background gradient of the artwork container. */
  vizBg: [string, string];
  bg: string;
  card: string;
  text: string;
  subtext: string;
  border: string;
  primary: string;
  onPrimary: string;
  danger: string;
  onDanger: string;
  live: string;
  noticeBg: string;
  noticeText: string;
  errorBg: string;
  errorText: string;
  /** Quieter surface for idle states and secondary rows. */
  cardMuted: string;
  /** Soft tinted circle behind icons. */
  iconWell: string;
  /** Opaque-enough backing for controls and text drawn over the artwork. */
  scrim: string;
  onScrim: string;
  scrimSubtext: string;
  scrimBorder: string;
}

const light: Palette = {
  mode: 'light',
  art: '#7066B5',
  vizBg: ['#F7F6FC', '#E2DDF3'],
  bg: '#F5F7FC',
  card: '#FFFFFF',
  text: '#25344F',
  subtext: '#52627B',
  border: '#C7CFE0',
  primary: '#317D8E',
  onPrimary: '#FFFFFF',
  danger: '#B91C1C',
  onDanger: '#FFFFFF',
  live: '#B91C1C',
  noticeBg: '#FEF3C7',
  noticeText: '#78350F',
  errorBg: '#FEE2E2',
  errorText: '#7F1D1D',
  cardMuted: '#EDF0F8',
  iconWell: '#E9E6F7',
  scrim: 'rgba(245,247,252,0.88)',
  onScrim: '#25344F',
  scrimSubtext: '#47566E',
  scrimBorder: 'rgba(37,52,79,0.16)',
};

const dark: Palette = {
  mode: 'dark',
  art: '#C5ADFF',
  vizBg: ['#020309', '#070B18'],
  bg: '#0B1120',
  card: '#172438',
  text: '#F5F8F8',
  subtext: '#B9C7D1',
  border: '#2C3E57',
  primary: '#73EDD3',
  onPrimary: '#0B1120',
  danger: '#FCA5A5',
  onDanger: '#450A0A',
  live: '#FCA5A5',
  noticeBg: '#3B2F0B',
  noticeText: '#FDE68A',
  errorBg: '#4C1111',
  errorText: '#FECACA',
  cardMuted: '#121D30',
  iconWell: '#251F47',
  scrim: 'rgba(8,12,24,0.8)',
  onScrim: '#F5F8F8',
  scrimSubtext: '#C9D3DC',
  scrimBorder: 'rgba(255,255,255,0.14)',
};

interface ThemeValue {
  palette: Palette;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeValue>({ palette: dark, setMode: () => {} });

/** App-wide Light/Dark. Defaults to Dark; the choice is stored on the device (REQ-008 P1-A). */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { prefs, update } = usePreferences();
  const mode = prefs.theme;
  const value = useMemo(
    () => ({ palette: mode === 'dark' ? dark : light, setMode: (theme: ThemeMode) => update({ theme }) }),
    [mode, update],
  );
  return createElement(ThemeContext.Provider, { value }, children);
}

export function usePalette(): Palette {
  return useContext(ThemeContext).palette;
}

export function useSetThemeMode(): (mode: ThemeMode) => void {
  return useContext(ThemeContext).setMode;
}

/** Minimum touch target, in points. */
export const TOUCH = 56;
/** Smallest allowed target for compact controls (e.g. over the artwork). */
export const TOUCH_MIN = 44;

/** Shared spacing scale, in points. */
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const RADIUS = { sm: 10, md: 14, lg: 20, pill: 999 } as const;

/** Type scale. Sizes stay unscaled here; React Native applies the user's text size on top. */
export const TYPE = {
  display: { fontSize: 28, fontWeight: '800' },
  title: { fontSize: 22, fontWeight: '700' },
  headline: { fontSize: 17, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 22 },
  callout: { fontSize: 15, lineHeight: 21 },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
} as const;
