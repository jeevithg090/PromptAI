import { z } from 'zod';
import { generate } from '../services/providers';
import { logger } from '../utils/logger';
import { extractJson } from '../utils/json';
import type { Agent, AgentInput, AgentOutput, MemoryEntry } from '../types/Agent';
import { givenAnswers } from './draftShared';

/**
 * Memory Extraction Agent — spec §17.2, §31.3 Step 19.
 * Runs ONCE at session end (a checkpoint — never per message). Distills the
 * completed session into durable, human-readable USER PREFERENCES (not
 * one-off content), each proposed as PENDING and never auto-saved: the user
 * must confirm before anything becomes active memory (§17.2). Small tier.
 *
 * Non-fatal by design: extraction is a background enhancement, so any failure
 * returns success with zero proposals rather than surfacing an error.
 * Privacy (§19.1): only counts are logged, never statement text.
 */
export const memoryProposalSchema = z.object({
  preferences: z
    .array(
      z.object({
        statement: z.string().min(3),
        confidence: z.number().min(0).max(1),
      })
    )
    .default([]),
});

type GenerateFn = typeof generate;

/** Only reasonably-confident, genuinely durable preferences are worth proposing. */
const CONFIDENCE_FLOOR = 0.6;

const SYSTEM_PROMPT = `You extract DURABLE USER PREFERENCES from a completed prompt-drafting session, to remember for future sessions.

Extract ONLY stable preferences likely to recur — e.g. "prefers photorealistic image styles", "usually targets Midjourney", "likes concise, structured output".
Do NOT extract: one-off content of this specific request (the particular subject/topic), facts about the world, or anything session-specific.
If nothing durable is evident, return an empty list — that is correct and expected, not a failure.

Respond with ONLY JSON:
{"preferences":[{"statement":"<short human-readable preference>","confidence":<0..1>}]}
Keep each statement under 12 words, phrased as a stable preference.`;

export class MemoryExtractionAgent implements Agent {
  name = 'MemoryExtractionAgent';

  constructor(private readonly generateFn: GenerateFn = generate) {}

  private buildUserMessage(input: AgentInput): string {
    const { context } = input;
    const parts = [
      `Platform: ${context.platform.display_name}`,
      `Task type: ${context.taskType ?? 'unknown'}`,
    ];
    const answers = givenAnswers(context.clarifications);
    if (Object.keys(answers).length) {
      parts.push(`Choices the user made: ${JSON.stringify(answers)}`);
    }
    if (context.finalDraft) {
      // Node types + values reveal stylistic preference without echoing the whole prompt.
      parts.push(`Final prompt elements: ${context.finalDraft.nodes.map((n) => `${n.type}=${n.value}`).join('; ')}`);
    }
    return parts.join('\n');
  }

  async execute(input: AgentInput): Promise<AgentOutput> {
    const { context } = input;

    let raw: string;
    let tokensUsed = 0;
    try {
      const res = await this.generateFn('memory_extraction', 'small', {
        systemPrompt: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: this.buildUserMessage(input) }],
        maxTokens: 1000,
        temperature: 0.2,
        responseFormat: 'json',
      });
      tokensUsed = res.tokensUsed.input + res.tokensUsed.output;
      raw = res.content;
    } catch (error) {
      // Non-fatal: memory is a background enhancement.
      logger.warn({
        type: 'agent:memory_extraction_skipped',
        sessionId: context.sessionId,
        reason: error instanceof Error ? error.message : String(error),
      });
      return { status: 'success', data: { proposals: [] }, tokensUsed };
    }

    let proposals: MemoryEntry[] = [];
    try {
      const parsed = memoryProposalSchema.parse(extractJson(raw));
      proposals = parsed.preferences
        .filter((p) => p.confidence >= CONFIDENCE_FLOOR)
        .map((p) => ({
          id: crypto.randomUUID(),
          scope: context.projectId ?? 'global',
          statement: p.statement,
          source: 'agent_proposed',
          status: 'pending_confirmation', // NEVER auto-active (§17.2)
        }));
    } catch {
      logger.warn({ type: 'agent:malformed_output', agent: this.name, sessionId: context.sessionId, responseLength: raw.length });
      return { status: 'success', data: { proposals: [] }, tokensUsed };
    }

    logger.info({ type: 'memory:proposed', sessionId: context.sessionId, count: proposals.length });
    return { status: 'success', data: { proposals }, tokensUsed };
  }
}
