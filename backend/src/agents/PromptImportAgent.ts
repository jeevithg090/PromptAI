import { z } from 'zod';
import { generate } from '../services/providers';
import { loadStrategyProfiles } from './DraftingAgent';
import { assembleDraft, draftResponseSchema, normalizeRawNodes } from './draftShared';
import { NODE_TYPES, TASK_TYPES, type TaskType } from '../types/Prompt';
import { logger } from '../utils/logger';
import { extractJson } from '../utils/json';
import type { Agent, AgentInput, AgentOutput } from '../types/Agent';

/**
 * Prompt Import Agent — F1.1 (enhance mode). Given a FINISHED prompt the user
 * already has, decompose it faithfully into the §13.1 node taxonomy (no
 * improving — that's the Critic's job downstream), and classify its task_type
 * + a platform_hint. Large model tier (parsing a real-world prompt is the
 * hard step). Retry-once on malformed output, graceful failure after that —
 * an LLM agent never throws (§29.7).
 */
const importSchema = z.object({
  task_type: z.enum(TASK_TYPES),
  platform_hint: z.string().nullable().optional(),
  nodes: draftResponseSchema.shape.nodes,
});

type GenerateFn = typeof generate;

export class PromptImportAgent implements Agent {
  name = 'PromptImportAgent';

  constructor(private readonly generateFn: GenerateFn = generate) {}

  private buildSystemPrompt(): string {
    return `You are given a FINISHED prompt that a user wrote for an AI tool. Your job is to DECOMPOSE it faithfully into typed nodes — do NOT improve, rewrite, or add anything. Capture exactly what is there.

Also classify:
- task_type: one of ${TASK_TYPES.join(', ')}.
- platform_hint: the AI platform this prompt appears written for (e.g. "midjourney", "openai_chatgpt", "anthropic_claude", "google_gemini", "stability_stable_diffusion"), or null if unclear.

Break the prompt into nodes using ONLY these node types: ${NODE_TYPES.join(', ')}. Use the node types that actually appear in the prompt — omit ones that don't. Each node's "value" must be the corresponding text FROM THE PROMPT (lightly normalized, not invented).

Respond with ONLY JSON, no prose. EVERY node MUST include "type" and "value"; "rationale" and "alternatives" are optional (use [] for alternatives).
Schema: {"task_type":"<one of the task types>","platform_hint":"<platform id or null>","nodes":[{"type":"<node type>","value":"<text from the prompt>","rationale":"<what this captures>","alternatives":[]}]}`;
  }

  async execute(input: AgentInput): Promise<AgentOutput> {
    const { context } = input;
    const text = context.userIdea; // in enhance mode this holds the pasted prompt
    if (!text || text.trim().length === 0) {
      return { status: 'failure', error: 'no prompt text to import' };
    }

    let tokensUsed = 0;
    const MAX_ATTEMPTS = 2;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let raw: string;
      try {
        const res = await this.generateFn('prompt_import', 'large', {
          systemPrompt: this.buildSystemPrompt(),
          messages: [{ role: 'user', content: `Prompt to decompose:\n${text}` }],
          maxTokens: 3000,
          temperature: 0,
          responseFormat: 'json',
        });
        tokensUsed += res.tokensUsed.input + res.tokensUsed.output;
        raw = res.content;
        if (res.finishReason === 'length') {
          logger.warn({ type: 'agent:output_truncated', agent: this.name, sessionId: context.sessionId, attempt });
        }
      } catch (error) {
        logger.error({
          type: 'agent:provider_error',
          agent: this.name,
          sessionId: context.sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
        continue; // retry — both must fail before graceful failure (§29.7)
      }

      try {
        const extracted = extractJson(raw) as { task_type?: unknown; platform_hint?: unknown; nodes?: unknown };
        const taskType = (TASK_TYPES as readonly string[]).includes(extracted?.task_type as string)
          ? (extracted.task_type as TaskType)
          : 'long_form_writing';
        const profile = loadStrategyProfiles().profiles[taskType];
        const requiredOrder = profile?.required_nodes ?? [...NODE_TYPES];
        // Normalize the same Llama quirks the drafter handles, then validate.
        const normalized = normalizeRawNodes({ nodes: extracted?.nodes }, requiredOrder);
        const parsed = importSchema.parse({
          task_type: taskType,
          platform_hint: (extracted?.platform_hint ?? null) as string | null,
          nodes: (normalized as { nodes: unknown }).nodes,
        });

        const draft = assembleDraft(parsed.nodes, {
          requiredOrder,
          platform: context.platform,
          taskType,
          refinementCount: 0,
        });

        return {
          status: 'success',
          data: { draft, task_type: taskType, platform_hint: parsed.platform_hint ?? null },
          tokensUsed,
        };
      } catch {
        logger.warn({
          type: 'agent:malformed_output',
          agent: this.name,
          sessionId: context.sessionId,
          attempt,
          responseLength: raw.length,
        });
      }
    }

    return { status: 'failure', error: 'could not parse the prompt into nodes', tokensUsed };
  }
}
