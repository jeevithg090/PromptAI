import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { config } from '../config/env';
import { clarifyingQuestionSchema, NODE_TYPES, type ClarifyingQuestion } from '../types/Prompt';
import { logger } from '../utils/logger';
import type { Agent, AgentInput, AgentOutput } from '../types/Agent';

/**
 * Clarifying Question Agent — spec §11, §31.3 Step 14.
 * Deliberately deterministic: the T0.3 taxonomy is a decision matrix, and
 * config-over-code (§32.3) means the matrix lives in
 * config/clarification-questions.json, not in model output — an LLM asked to
 * invent questions could violate the taxonomy; a selector cannot.
 *
 * Selection: drop questions pre-answered by intent entities (core rule 7),
 * ask in priority order (P1→P3), stop at CLARIFY_MAX_QUESTIONS or when no
 * P1/P2 remain (stopping criteria). "Just generate now" is handled upstream
 * by the Supervisor (§11.2). An LLM phrasing-personalization pass can be
 * added later without changing this contract.
 */
const questionTemplateSchema = clarifyingQuestionSchema.extend({
  maps_to_node: z.enum(NODE_TYPES),
  /** Entity keys (from the Intent agent) that pre-answer this question — ANY match skips it. */
  answered_by_entities: z.array(z.string()).default([]),
});
type QuestionTemplate = z.infer<typeof questionTemplateSchema>;

const taxonomyFileSchema = z.object({
  schema_version: z.string(),
  note: z.string().optional(),
  task_types: z.record(z.string(), z.array(questionTemplateSchema)),
});

let cached: z.infer<typeof taxonomyFileSchema> | null = null;

function taxonomyPath(): string {
  // backend/src/agents → repo root is three levels up (same depth from dist/).
  return config.CLARIFICATION_QUESTIONS_PATH ?? path.resolve(__dirname, '..', '..', '..', 'config', 'clarification-questions.json');
}

export function loadClarificationTaxonomy(): z.infer<typeof taxonomyFileSchema> {
  if (cached) return cached;
  cached = taxonomyFileSchema.parse(JSON.parse(fs.readFileSync(taxonomyPath(), 'utf-8')));
  return cached;
}

export class ClarifyingQuestionAgent implements Agent {
  name = 'ClarifyingQuestionAgent';

  async execute(input: AgentInput): Promise<AgentOutput> {
    const { context } = input;
    const taxonomy = loadClarificationTaxonomy();
    const templates: QuestionTemplate[] = context.taskType ? taxonomy.task_types[context.taskType] ?? [] : [];

    // Core rule 7: never ask what the idea already answered (via intent entities).
    const answeredKeys = new Set(Object.keys(context.clarifications ?? {}));
    const answeredEntities = new Set(Object.keys(context.entities ?? {}).map((k) => k.toLowerCase()));
    const unanswered = templates.filter(
      (t) => !answeredKeys.has(t.id) && !t.answered_by_entities.some((k) => answeredEntities.has(k))
    );

    // Stopping criteria: if every P1 and P2 is covered, don't ask P3-only follow-ups.
    const loadBearing = unanswered.filter((t) => t.priority <= 2);
    let questions: ClarifyingQuestion[] = [];
    if (loadBearing.length > 0) {
      const ordered = [...unanswered].sort((a, b) => a.priority - b.priority);
      questions = ordered
        .slice(0, config.CLARIFY_MAX_QUESTIONS)
        .map((t) => clarifyingQuestionSchema.parse(t)); // contract-validate what we hand out
    }

    logger.info({
      type: 'agent:clarify_selected',
      sessionId: context.sessionId,
      taskType: context.taskType,
      asked: questions.length,
      skippedAsAnswered: templates.length - unanswered.length,
    });

    return {
      status: 'success',
      data: {
        questions,
        can_generate_now: true, // always — §11.2
        questions_remaining_estimate: Math.max(0, unanswered.length - questions.length),
      },
      tokensUsed: 0,
    };
  }
}
