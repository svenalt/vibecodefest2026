import type { Platform, RawClassification, SoundPrediction } from './types';
import { YAMNET_NUM_CLASSES } from './yamnet/constants';
import { YAMNET_LABELS } from './yamnet/labels';
import { categoryForIndex } from './yamnet/taxonomy';

/** Thrown when a native adapter's model output does not match the pinned YAMNet contract. */
export class ModelContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelContractError';
  }
}

/**
 * Turns a native top-K result into one normalized prediction, using the single shared
 * taxonomy. The best-scoring surfaced class wins; if none of the top-K is surfaced the
 * prediction is `unknown`. Raw scores are passed through untouched (not probabilities).
 */
export function normalizeClassification(
  raw: RawClassification,
  platform: Platform,
): SoundPrediction {
  if (raw.classCount !== YAMNET_NUM_CLASSES) {
    throw new ModelContractError(
      `Model reported ${raw.classCount} classes, expected ${YAMNET_NUM_CLASSES}`,
    );
  }
  const top = [...raw.top].sort((a, b) => b.score - a.score);
  for (const entry of top) {
    if (YAMNET_LABELS[entry.index] !== entry.label) {
      throw new ModelContractError(
        `Class order mismatch at index ${entry.index}: runtime "${entry.label}" vs pinned "${YAMNET_LABELS[entry.index]}"`,
      );
    }
  }

  for (const entry of top) {
    const category = categoryForIndex(entry.index);
    if (category !== undefined) {
      return {
        timestampMs: raw.timestampMs,
        category,
        rawLabel: entry.label,
        score: entry.score,
        model: 'yamnet',
        platform,
      };
    }
  }

  const best = top[0];
  return {
    timestampMs: raw.timestampMs,
    category: 'unknown',
    rawLabel: best?.label ?? '',
    score: best?.score ?? 0,
    model: 'yamnet',
    platform,
  };
}
