/** True when the cautious, expected and optimistic values are the same, so there is no range to draw. */
export function isFlatRange(r: { low: number; expected: number; high: number }): boolean {
  const tol = 0.005 * Math.max(Math.abs(r.low), Math.abs(r.expected), Math.abs(r.high), 1);
  return Math.abs(r.high - r.low) <= tol;
}
