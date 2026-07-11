/**
 * Rough token estimator — spec §6.1 chunker.
 * No tokenizer dependency: ~4 chars/token is the standard heuristic.
 */

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
