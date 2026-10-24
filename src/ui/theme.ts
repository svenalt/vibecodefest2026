import { createContext, createElement, useContext, useMemo, useState, type ReactNode } from 'react';

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
}

const light: Palette = {
  mode: 'light',
  art: '#7066B5',
  vizBg: ['#F5F7FC', '#DCDFF5'],
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
};

const dark: Palette = {
  mode: 'dark',
  art: '#C5ADFF',
  vizBg: ['#0B1120', '#1B1340'],
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
};

interface ThemeValue {
  palette: Palette;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeValue>({ palette: dark, setMode: () => {} });

/** App-wide Light/Dark. Defaults to Dark; not persisted yet (REQ-002 P1). */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>('dark');
  const value = useMemo(() => ({ palette: mode === 'dark' ? dark : light, setMode }), [mode]);
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
