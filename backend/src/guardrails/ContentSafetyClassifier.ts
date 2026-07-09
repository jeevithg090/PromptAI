import { SAFETY_PATTERNS, CLASSIFIER_VERSION } from '../config/safety-patterns';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { audit } from '../services/AuditService';
import type { SafetyDecision } from '../types/Safety';

/**
 * Content Safety Classifier v1 (heuristic) — spec §33.2 Layer 1/2/3.
 *
 * Same classifier runs at all three gates (§33.3): pre-flight on the user's
 * idea + clarifications, post-generation on the assembled draft, and before
 * any library publish. The interface is async and provider-shaped so the v2
 * model-based classifier drops in without touching callers.
 */
export class ContentSafetyClassifier {
  /** Normalize obvious evasions (collapsed whitespace, zero-width chars). */
  private normalize(text: string): string {
    return text.replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim();
  }

  async classify(text: string): Promise<SafetyDecision> {
    if (!config.CONTENT_SAFETY_ENABLED) {
      // Explicitly configured off (e.g. in an isolated test env) — log loudly.
      logger.warn({ type: 'safety:disabled_by_config' });
      return { safe: true, confidence: 0, classifierVersion: CLASSIFIER_VERSION };
    }

    const input = this.normalize(text);

    for (const rule of SAFETY_PATTERNS) {
      for (const pattern of rule.patterns) {
        if (pattern.test(input)) {
          return {
            safe: false,
            category: rule.category,
            severity: rule.severity,
            reason: `Matched ${rule.category} policy pattern`,
            confidence: rule.severity === 'high' ? 0.9 : 0.75,
            classifierVersion: CLASSIFIER_VERSION,
          };
        }
      }
    }

    return { safe: true, confidence: 0.95, classifierVersion: CLASSIFIER_VERSION };
  }
}

/**
 * Fail-closed wrapper — spec §33.7. If the classifier itself throws
 * (e.g. the future model-based v2 API is down), we refuse to generate
 * rather than generate unchecked.
 */
export async function classifyOrFailClosed(
  classifier: ContentSafetyClassifier,
  text: string,
  meta: { userId?: string; sessionId?: string }
): Promise<SafetyDecision> {
  let decision: SafetyDecision;
  try {
    decision = await classifier.classify(text);
  } catch (error) {
    logger.error({
      type: 'safety:classifier_error',
      userId: meta.userId,
      sessionId: meta.sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
    decision = {
      safe: false,
      reason: 'Safety system unavailable; generation refused (fail closed)',
      confidence: 0,
      classifierVersion: CLASSIFIER_VERSION,
      failedClosed: true,
    };
  }

  // Every decision is logged immutably (§33.6) — category and status, never content.
  logger.info({
    type: 'safety:decision',
    userId: meta.userId,
    sessionId: meta.sessionId,
    classifierVersion: decision.classifierVersion,
    decision: decision.safe ? 'allowed' : 'blocked',
    category: decision.category,
    confidence: decision.confidence,
    failedClosed: decision.failedClosed ?? false,
  });

  // Immutable audit log (§27.1, T3.1) — fire-and-forget, never blocks the request.
  void audit({
    actor: meta.userId ?? 'system',
    action: 'safety:decision',
    status: decision.safe ? 'success' : 'blocked',
    sessionId: meta.sessionId,
    detail: {
      decision: decision.safe ? 'allowed' : 'blocked',
      category: decision.category,
      confidence: decision.confidence,
      failedClosed: decision.failedClosed ?? false,
      classifierVersion: decision.classifierVersion,
    },
  });

  return decision;
}
