import type { Platform } from '../types/Platform';

/**
 * Token & Context Governor — spec §16.
 * Deterministic policy/utility layer: NEVER an LLM call.
 *
 * v1 uses a conservative character-based estimator. Task T2.10 upgrades this
 * to per-platform real tokenizers (§16: "use each target platform's actual
 * tokenizer where available") — callers depend only on this interface.
 */
export interface GovernorReport {
  tokenCount: number;
  maxPromptTokens: number;
  exceedsPlatformLength: boolean;
  /** Within 10% of the ceiling — worth offering a "tighten" pass (§16). */
  nearLimit: boolean;
  suggestions: string[];
}

/** ~4 chars/token is a safe English-text approximation; deliberately overestimates a little. */
export function estimateTokens(text: string): number {
  if (text.length === 0) return 0;
  return Math.ceil(text.length / 4) + Math.ceil(text.split(/\s+/).length * 0.1);
}

export function govern(assembledPrompt: string, platform: Platform): GovernorReport {
  const tokenCount = estimateTokens(assembledPrompt);
  const max = platform.max_prompt_tokens;
  const exceeds = tokenCount > max;
  const nearLimit = !exceeds && tokenCount > max * 0.9;

  const suggestions: string[] = [];
  if (exceeds) {
    suggestions.push(
      `Prompt is ~${tokenCount} tokens but ${platform.display_name} works best under ${max}. Run a tighten pass or trim low-priority nodes.`
    );
  } else if (nearLimit) {
    suggestions.push(`Prompt is close to ${platform.display_name}'s practical length ceiling (~${tokenCount}/${max}).`);
  }

  return { tokenCount, maxPromptTokens: max, exceedsPlatformLength: exceeds, nearLimit, suggestions };
}
