import type { PredictionCategory } from '../core/types';

/** Decorative glyphs. The text label always carries the meaning. */
export const CATEGORY_ICON: Record<PredictionCategory, string> = {
  speech: '🗣️',
  music: '🎵',
  dog_bark: '🐕',
  applause: '👏',
  rain: '🌧️',
  bell: '🔔',
  silence: '🤫',
  unknown: '❔',
};
