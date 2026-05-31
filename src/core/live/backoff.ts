// ============================================================================
// backoff — polling interval with exponential backoff on failure
// ============================================================================
// Pure. 0 failures → base interval; each consecutive failure doubles it, up to
// a cap. Keeps a flaky endpoint from hammering while staying responsive once it
// recovers (failure count resets to 0 on success).
// ============================================================================

export function nextDelay(failures: number, baseMs: number, maxMs: number): number {
  if (failures <= 0) return baseMs;
  const grown = baseMs * 2 ** failures;
  return Math.min(grown, maxMs);
}
