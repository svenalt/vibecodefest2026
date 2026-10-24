import type { PredictionCategory, SoundCategory } from '../types';

/** Bump when any mapping below changes. */
export const TAXONOMY_VERSION = 1;

interface TaxonomyEntry {
  /** YAMNet output index. */
  index: number;
  /** Expected label at that index; tests and runtime both check it against the model's labels. */
  label: string;
  category: SoundCategory;
}

/**
 * The single, versioned YAMNet-label-to-category mapping used on every platform.
 * Deliberately conservative: only generic classes that were demoable, and no
 * instrument/genre sub-classes (they are noisy and would over-claim).
 */
export const TAXONOMY: readonly TaxonomyEntry[] = [
  { index: 0, label: 'Speech', category: 'speech' },
  { index: 1, label: 'Child speech, kid speaking', category: 'speech' },
  { index: 2, label: 'Conversation', category: 'speech' },
  { index: 132, label: 'Music', category: 'music' },
  { index: 69, label: 'Dog', category: 'dog_bark' },
  { index: 70, label: 'Bark', category: 'dog_bark' },
  { index: 58, label: 'Clapping', category: 'applause' },
  { index: 62, label: 'Applause', category: 'applause' },
  { index: 283, label: 'Rain', category: 'rain' },
  { index: 284, label: 'Raindrop', category: 'rain' },
  { index: 285, label: 'Rain on surface', category: 'rain' },
  { index: 195, label: 'Bell', category: 'bell' },
  { index: 196, label: 'Church bell', category: 'bell' },
  { index: 197, label: 'Jingle bell', category: 'bell' },
  { index: 198, label: 'Bicycle bell', category: 'bell' },
];

export const SILENCE_INDEX = 494; // "Silence"

const BY_INDEX = new Map<number, PredictionCategory>([
  ...TAXONOMY.map((e) => [e.index, e.category] as const),
  [SILENCE_INDEX, 'silence' as const],
]);

/** Category for a YAMNet class index, or `undefined` if the class is not surfaced. */
export function categoryForIndex(index: number): PredictionCategory | undefined {
  return BY_INDEX.get(index);
}

export const CATEGORY_DISPLAY: Record<PredictionCategory, string> = {
  speech: 'Speech',
  music: 'Music',
  dog_bark: 'Dog barking',
  applause: 'Applause',
  rain: 'Rain',
  bell: 'Bell',
  silence: 'Quiet',
  unknown: 'No confident sound',
};
