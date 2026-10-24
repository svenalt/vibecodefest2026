/** Session-relative clock, e.g. 72_000 ms -> "1:12". */
export function formatSessionTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function formatScore(score: number): string {
  return score.toFixed(2);
}
