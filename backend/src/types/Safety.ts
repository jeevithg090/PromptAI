/**
 * Content-safety types — spec §33.
 * Categories map 1:1 to docs/acceptable-use-policy.md so policy and
 * enforcement never drift apart.
 */
export const SAFETY_CATEGORIES = [
  'jailbreak',
  'illegal_instruction',
  'csam',
  'targeted_harassment',
  'intimate_deepfake',
  'disinformation',
  'impersonation',
  'malicious_code',
  'self_harm',
] as const;
export type SafetyCategory = (typeof SAFETY_CATEGORIES)[number];

export type SafetySeverity = 'high' | 'medium';

export interface SafetyDecision {
  safe: boolean;
  category?: SafetyCategory;
  severity?: SafetySeverity;
  reason?: string;
  confidence: number;
  classifierVersion: string;
  /** True when the classifier itself failed and we failed closed (§33.7). */
  failedClosed?: boolean;
}
