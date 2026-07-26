import { govern } from '../guardrails/TokenGovernor';
import { design } from './ResponseDesign';
import { generate } from './providers';
import { extractJson } from '../utils/json';
import { CriticAgent } from '../agents/CriticAgent';
import { loadStrategyProfiles } from '../agents/DraftingAgent';
import { assembleDraft, draftResponseSchema, normalizeRawNodes } from '../agents/draftShared';
import { TASK_TYPES, NODE_TYPES, type TaskType } from '../types/Prompt';
import { z } from 'zod';
import { logger } from '../utils/logger';
import type { Platform } from '../types/Platform';
import type { PipelineContext } from '../types/Agent';
import type { DesignedResponse } from '../types/Response';

/**
 * Reverse Prompt (V2.2) — "I saw a great output; what prompt makes this?".
 * Infers a plausible task type + node set that would generate the pasted
 * output for the chosen platform, each node tracing to a quoted fragment,
 * then scores it with the real Critic so the result opens in the editor like
 * any draft. Inference, not extraction — the UI says so.
 */
const reverseReplySchema = z.object({
  task_type: z.enum(TASK_TYPES).optional(),
  nodes: z
    .array(
      z.object({
        type: z.enum(NODE_TYPES),
        value: z.string().min(1),
        rationale: z.string().optional(), // "inferred from: <quote>"
        alternatives: z.array(z.any()).max(4).default([]),
      })
    )
    .min(1),
});

export interface ReversePromptInput {
  output: string;
  platform: Platform;
  userId: string;
}

export interface ReversePromptResult {
  response: DesignedResponse;
}

type GenerateFn = typeof generate;

export async function reversePrompt(input: ReversePromptInput, generateFn: GenerateFn = generate): Promise<ReversePromptResult> {
  const systemPrompt = `You are a reverse-prompting expert for the "${input.platform.display_name}" platform. Given an example OUTPUT, infer a prompt that would plausibly have produced it.

Rules:
- Decompose the inferred prompt into typed nodes (types: ${NODE_TYPES.join(', ')}).
- Each node's rationale MUST start with "inferred from: " followed by a short quote from the output that justifies it.
- This is inference, not extraction — build the most likely prompt, don't claim certainty.
- Classify task_type (one of: ${TASK_TYPES.join(', ')}).

Respond with ONLY JSON:
{"task_type":"<task type>","nodes":[{"type":"<node type>","value":"<prompt text>","rationale":"inferred from: <quote>","alternatives":[]}]}`;

  const MAX_ATTEMPTS = 2;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await generateFn('reverse', 'large', {
        systemPrompt,
        messages: [{ role: 'user', content: `Example output:\n${input.output}` }],
        maxTokens: 2_000,
        temperature: 0.4,
        responseFormat: 'json',
      });
      const parsed = reverseReplySchema.parse(extractJson(res.content));
      const taskType: TaskType = parsed.task_type ?? 'long_form_writing';
      const profile = loadStrategyProfiles().profiles[taskType] ?? loadStrategyProfiles().profiles['long_form_writing'];
      const normalized = draftResponseSchema.parse(normalizeRawNodes({ nodes: parsed.nodes }, profile!.required_nodes));
      const draft = assembleDraft(normalized.nodes, {
        requiredOrder: profile!.required_nodes,
        platform: input.platform,
        taskType,
        refinementCount: 0,
      });

      const context: PipelineContext = {
        userId: input.userId,
        sessionId: crypto.randomUUID(),
        platform: input.platform,
        userIdea: input.output.slice(0, 500),
        taskType,
        finalDraft: draft,
      };
      const critic = await new CriticAgent().execute({ context, params: {} });
      if (critic.data?.draft) context.finalDraft = critic.data.draft as typeof draft;
      if (critic.data?.evaluation) context.evaluation = critic.data.evaluation as PipelineContext['evaluation'];
      context.governorReport = govern(context.finalDraft!.assembled, input.platform);

      const response = design(context);
      if (!response) throw new Error('design produced no response');
      return { response };
    } catch (error) {
      logger.warn({ type: 'reverse:attempt_failed', attempt, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  throw new Error('reverse prompt failed after retries');
}
