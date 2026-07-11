import { classifyOrFailClosed, ContentSafetyClassifier } from '../guardrails/ContentSafetyClassifier';
import { logger } from '../utils/logger';
import type { Agent, AgentInput, AgentOutput, CurationCandidate } from '../types/Agent';

const ANON_PLACEHOLDERS = {
  SUBJECT: 'SUBJECT',
  ACTION: 'ACTION',
  STYLE: 'STYLE',
} as const;

const STRENGTH_THRESHOLD = 70;

/**
 * Curation Agent — spec §14.4, T8.2.
 * Runs at session end for opted-in users. Anonymizes the completed draft,
 * classifies for safety, scores with the rubric, and proposes a curation
 * candidate when safe AND score >= 70.
 *
 * Non-opted-in sessions return an empty candidate list — no code path to
 * non-opted-in data (enforced by construction, §14.4).
 */
export class CurationAgent implements Agent {
  name = 'CurationAgent';

  async execute(input: AgentInput): Promise<AgentOutput> {
    const { context } = input;

    if (!context.optedIn) {
      return { status: 'success', data: { candidates: [] } };
    }

    const draft = context.finalDraft;
    if (!draft || !draft.assembled) {
      return { status: 'success', data: { candidates: [] } };
    }

    const originalText = draft.assembled;

    // Classify the ORIGINAL text before anonymizing (§33).
    const safety = await classifyOrFailClosed(
      new ContentSafetyClassifier(),
      originalText,
      { userId: context.userId, sessionId: context.sessionId }
    );

    if (!safety.safe) {
      logger.info({ type: 'curation:candidate', sessionId: context.sessionId, score: 0, reason: 'unsafe' });
      return { status: 'success', data: { candidates: [] } };
    }

    const rubricScore = draft.evaluation?.overallStrength ?? 0;

    if (rubricScore < STRENGTH_THRESHOLD) {
      logger.info({ type: 'curation:candidate', sessionId: context.sessionId, score: rubricScore, reason: 'below_threshold' });
      return { status: 'success', data: { candidates: [] } };
    }

    const anonymized = this.anonymize(originalText);

    const candidate: CurationCandidate = {
      title: this.buildTitle(originalText),
      description: `Curated prompt for ${draft.taskType} on ${draft.platformId}`,
      template: anonymized,
      taskType: draft.taskType,
      platformId: draft.platformId,
    };

    logger.info({ type: 'curation:candidate', sessionId: context.sessionId, score: rubricScore, reason: 'approved' });
    return { status: 'success', data: { candidates: [candidate] } };
  }

  private anonymize(text: string): string {
    let result = text;
    result = result.replace(/\b(?:a |an |the )?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g, (match) => {
      if (ANON_PLACEHOLDERS.SUBJECT && match.length > 3) return ANON_PLACEHOLDERS.SUBJECT;
      return match;
    });
    result = result.replace(/\b(?:create|generate|make|produce|write|draw|paint|build|design|render)\b/gi, ANON_PLACEHOLDERS.ACTION);
    result = result.replace(/\b(?:realistic|photorealistic|stylized|cartoon|anime|oil painting|watercolor|3d render|cinematic|minimalist)\b/gi, ANON_PLACEHOLDERS.STYLE);
    return result;
  }

  private buildTitle(assembled: string): string {
    const words = assembled.split(/\s+/).filter(Boolean);
    const preview = words.slice(0, 8).join(' ');
    return preview.length > 60 ? preview.slice(0, 57) + '...' : preview;
  }
}
