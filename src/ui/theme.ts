import { useColorScheme } from 'react-native';

export interface Palette {
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
  bg: '#F3F4FA',
  card: '#FFFFFF',
  text: '#111827',
  subtext: '#4B5563',
  border: '#C7CBD6',
  primary: '#4338CA',
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
  bg: '#0B1020',
  card: '#151B30',
  text: '#F3F4F6',
  subtext: '#B6BDCB',
  border: '#33406A',
  primary: '#A5B4FC',
  onPrimary: '#0B1020',
  danger: '#FCA5A5',
  onDanger: '#450A0A',
  live: '#FCA5A5',
  noticeBg: '#3B2F0B',
  noticeText: '#FDE68A',
  errorBg: '#4C1111',
  errorText: '#FECACA',
};

export function usePalette(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}

/** Minimum touch target, in points. */
export const TOUCH = 56;
