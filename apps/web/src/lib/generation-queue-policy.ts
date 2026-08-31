export function retryDelayMs(attemptCount: number, baseDelayMs = 30_000): number {
  const exponent = Math.max(0, attemptCount - 1);
  return baseDelayMs * 2 ** exponent;
}
