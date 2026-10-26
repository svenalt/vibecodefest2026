import type { VisualFamily } from '../core/yamnet/taxonomy';

/** Eight-tooth gear outline on the 24 pt grid, centred at 12,12. */
function gearPath(): string {
  const pt = (r: number, deg: number) => {
    const a = (deg * Math.PI) / 180;
    return `${(12 + r * Math.cos(a)).toFixed(2)} ${(12 + r * Math.sin(a)).toFixed(2)}`;
  };
  const parts: string[] = [];
  for (let i = 0; i < 8; i++) {
    const a = i * 45;
    parts.push(`${i === 0 ? 'M' : 'L'}${pt(7, a - 17)}`, `L${pt(9.6, a - 9)}`, `L${pt(9.6, a + 9)}`, `L${pt(7, a + 17)}`);
  }
  return `${parts.join(' ')}Z`;
}

/**
 * One line-icon family on a 24 pt grid, stroked with round caps and joins. Drawn with Skia,
 * which the app already ships, so icons need no font or extra native dependency.
 * Icons are decorative: a text label always carries the meaning.
 */
export const ICON_PATHS = {
  // Navigation
  gear: `${gearPath()} M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0`,
  back: 'M15 5l-7 7 7 7',
  // Settings groups
  appearance: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  diagnostics: 'M3 12h4l2.5-6 5 12 2.5-6H21',
  about: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0 M12 11v5.5 M12 7.5h.01',
  artwork: 'M10 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0 M8.5 8.5a5 5 0 0 0 0 7 M15.5 8.5a5 5 0 0 1 0 7 M5.6 5.6a9 9 0 0 0 0 12.8 M18.4 5.6a9 9 0 0 1 0 12.8',
  // Controls
  expand: 'M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5',
  collapse: 'M9 4v5H4 M15 4v5h5 M20 15h-5v5 M4 15h5v5',
  sounds: 'M3 10v4 M7 6.5v11 M11 3.5v17 M15 8v8 M19 5.5v13',
  mic: 'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z M5.5 11a6.5 6.5 0 0 0 13 0 M12 17.5V21',
  micOff: 'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z M5.5 11a6.5 6.5 0 0 0 13 0 M12 17.5V21 M4 4l16 16',
  alert: 'M12 3.5L2.5 20h19L12 3.5z M12 9.5v4.5 M12 17h.01',
  // Sound families (one icon per family, never per class)
  speech: 'M5 4.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7.5L7 20v-3.5H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z M8 9.5h8 M8 12.5h5',
  music: 'M9 18V5l11-2v13 M3 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0 M14 16a3 3 0 1 0 6 0a3 3 0 1 0 -6 0',
  dogBark:
    'M12 12.5c-2.5 0-5 2.6-5 5C7 19.2 8.3 20 10 20c.8 0 1.4-.4 2-.4s1.2.4 2 .4c1.7 0 3-.8 3-2.5 0-2.4-2.5-5-5-5z M4.2 10.5a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0 -3.6 0 M7.7 6.5a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0 -3.6 0 M12.7 6.5a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0 -3.6 0 M16.2 10.5a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0 -3.6 0',
  applause:
    'M9.5 12a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0 M12 3v3 M12 18v3 M3 12h3 M18 12h3 M5.6 5.6l2.1 2.1 M16.3 16.3l2.1 2.1 M5.6 18.4l2.1-2.1 M16.3 7.7l2.1-2.1',
  rain: 'M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.24 M8 14v6 M12 16v6 M16 14v6',
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9 M10.3 21a1.94 1.94 0 0 0 3.4 0',
  vehicle:
    'M3 15.5V12l2.2-4.5h13.6L21 12v3.5h-2.5 M5.5 15.5H3 M9.5 15.5h5 M3 12h18 M5.5 15.5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0 M14.5 15.5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0',
  home: 'M3.5 11.5L12 4.5l8.5 7 M6 9.5V20h12V9.5 M10 20v-5h4v5',
  tools: 'M14.5 6.5a4 4 0 0 0-5.3 5.3L4 17a2.1 2.1 0 0 0 3 3l5.2-5.2a4 4 0 0 0 5.3-5.3l-2.5 2.5-2.5-.5-.5-2.5z',
  impact: 'M12 3l1.8 5.2L19 6l-2.2 5 4.2 3-5.2.6L17 20l-5-3-5 3 1.2-5.4L3 14l4.2-3L5 6l5.2 2.2z',
  quiet: 'M3 12h3 M9 11v2 M12 10.5v3 M15 11v2 M18 12h3',
  unknown: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0 M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.4 M12 17h.01',
} as const;

export type IconName = keyof typeof ICON_PATHS;

/** What an icon can stand for: a sound family, or one of the two listening states. */
export type SoundIcon = VisualFamily | 'silence' | 'unknown';

/** The original six sounds keep their icons through their families. */
export const SOUND_ICON: Record<SoundIcon, IconName> = {
  voice: 'speech',
  people: 'applause',
  music: 'music',
  animals: 'dogBark',
  nature: 'rain',
  vehicles: 'vehicle',
  household: 'home',
  machines: 'tools',
  signals: 'bell',
  impacts: 'impact',
  other: 'sounds',
  silence: 'quiet',
  unknown: 'unknown',
};
