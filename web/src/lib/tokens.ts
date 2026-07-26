/**
 * Client-side token estimate (V1.5) — mirrors backend TokenGovernor.estimateTokens
 * (~4 chars/token + 10% word overhead, deliberately slightly high). Used for
 * live meter updates between server round-trips; server numbers win when present.
 */
export function estimateTokens(text: string): number {
  if (text.length === 0) return 0;
  return Math.ceil(text.length / 4) + Math.ceil(text.split(/\s+/).length * 0.1);
}

export function formatTokens(n: number): string {
  return new Intl.NumberFormat().format(n);
}
