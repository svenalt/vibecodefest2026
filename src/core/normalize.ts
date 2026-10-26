import type { Platform, RawClassification, SoundCandidate, SoundPrediction } from './types';
import { YAMNET_NUM_CLASSES, YAMNET_TOP_K } from './yamnet/constants';
import { YAMNET_LABELS } from './yamnet/labels';
import { TAXONOMY } from './yamnet/taxonomy';

/** Thrown when a native adapter's model output does not match the pinned YAMNet contract. */
export class ModelContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelContractError';
  }
}

/**
 * Validates a native top-K result against the pinned contract and turns it into the ranked
 * candidate list, using the single shared taxonomy. Every one of the 521 classes can be a
 * candidate; nothing is filtered or merged here. Raw scores pass through untouched (they are not
 * probabilities). Any violation throws, because results that break the contract cannot be trusted.
 */
export function normalizeClassification(
  raw: RawClassification,
  platform: Platform,
  topK: number = YAMNET_TOP_K,
): SoundPrediction {
  if (raw.classCount !== YAMNET_NUM_CLASSES) {
    throw new ModelContractError(`Model reported ${raw.classCount} classes, expected ${YAMNET_NUM_CLASSES}`);
  }
  if (!Number.isFinite(raw.timestampMs)) {
    throw new ModelContractError(`Classification has an invalid timestamp: ${raw.timestampMs}`);
  }
  if (raw.top.length > topK) {
    throw new ModelContractError(`Adapter sent ${raw.top.length} classes, expected at most the top ${topK}`);
  }

  const seen = new Set<number>();
  const candidates: SoundCandidate[] = raw.top.map((entry) => {
    const { index, label, score } = entry;
    if (!Number.isInteger(index) || index < 0 || index >= YAMNET_NUM_CLASSES || seen.has(index)) {
      throw new ModelContractError(`Model reported class index ${index} out of range or twice`);
    }
    seen.add(index);
    if (YAMNET_LABELS[index] !== label) {
      throw new ModelContractError(
        `Class order mismatch at index ${index}: runtime "${label}" vs pinned "${YAMNET_LABELS[index]}"`,
      );
    }
    if (!Number.isFinite(score)) {
      throw new ModelContractError(`Model reported a non-finite score for "${label}"`);
    }
    return { index, rawLabel: label, score, family: TAXONOMY[index]!.family };
  });
  candidates.sort((a, b) => b.score - a.score || a.index - b.index);

  return { timestampMs: raw.timestampMs, candidates, model: 'yamnet', platform };
}
