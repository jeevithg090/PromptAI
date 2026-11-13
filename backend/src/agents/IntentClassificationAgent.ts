import { z } from 'zod';
import { generate } from '../services/providers';
import { TASK_TYPES } from '../types/Prompt';
import { logger } from '../utils/logger';
import { extractJson } from '../utils/json';
import type { Agent, AgentInput, AgentOutput } from '../types/Agent';

/**
 * Intent Classification Agent — spec §7.1, §31.3 Step 12.
 * First LLM step in the pipeline: user idea + platform → {task_type,
 * entities, platform_hint, confidence}. Small/fast model tier via the
 * ModelRouter (§7.3). Malformed model output is retried once, then the
 * agent fails gracefully (§29.7) — it never throws.
 */
export const intentResultSchema = z.object({
  task_type: z.enum(TASK_TYPES),
  /** Flat entity map, e.g. { subject: "a horse", action: "running" } — keys vary by task type. */
  entities: z.record(z.string(), z.string()).default({}),
  /** Model's opinion of a better-suited platform, if obviously mismatched (§15 surfaces this later). */
  platform_hint: z.string().nullish(),
  confidence: z.number().min(0).max(1),
});
export type IntentResult = z.infer<typeof intentResultSchema>;

type GenerateFn = typeof generate;

const SYSTEM_PROMPT = `You are an intent classifier for a prompt-drafting assistant.
Classify the user's idea into exactly one task_type from this list:
${TASK_TYPES.map((t) => `- ${t}`).join('\n')}

Also extract the concrete entities present in the idea (flat string map; use keys like subject, action, setting, style, audience, format, language — only include keys the idea actually contains).

Respond with ONLY a JSON object, no prose, matching:
{"task_type": "<one of the list>", "entities": {"<key>": "<value>"}, "platform_hint": "<platform id or null>", "confidence": <0..1>}

Rules:
- The target platform's modalities matter: an image request aimed at an image platform is text_to_image even if phrased conversationally.
- platform_hint is null unless the idea clearly mismatches the stated platform (e.g. a video request on an image-only platform).
- confidence reflects how unambiguous the classification is.`;

export class IntentClassificationAgent implements Agent {
  name = 'IntentClassificationAgent';

  constructor(private readonly generateFn: GenerateFn = generate) {}

  async execute(input: AgentInput): Promise<AgentOutput> {
    const { context } = input;
    const userMessage = [
      `Target platform: ${context.platform.display_name} (modalities: ${context.platform.modalities.join(', ')})`,
      `User idea: ${context.userIdea}`,
    ].join('\n');

    let tokensUsed = 0;
    const MAX_ATTEMPTS = 2; // initial call + one retry on malformed output

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let raw: string;
      try {
        const res = await this.generateFn('intent_classification', 'small', {
          systemPrompt: SYSTEM_PROMPT,
          // Generous budget: routed models may be reasoning models whose
          // hidden reasoning tokens count against max_tokens; too small a
          // budget truncates the JSON (finish_reason=length) → empty content.
          messages: [{ role: 'user', content: userMessage }],
          maxTokens: 2000,
          temperature: 0,
          responseFormat: 'json',
        });
        tokensUsed += res.tokensUsed.input + res.tokensUsed.output;
        raw = res.content;
      } catch (error) {
        // Provider outage → graceful failure, no retry storm (§29.7).
        logger.error({
          type: 'agent:provider_error',
          agent: this.name,
          sessionId: context.sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
        return { status: 'failure', error: 'intent classification unavailable', tokensUsed };
      }

      try {
        const result = intentResultSchema.parse(extractJson(raw));
        return { status: 'success', data: result, tokensUsed };
      } catch {
        // Malformed output — log shape info only, never content (§19.1).
        logger.warn({
          type: 'agent:malformed_output',
          agent: this.name,
          sessionId: context.sessionId,
          attempt,
          responseLength: raw.length,
        });
      }
    }

    return { status: 'failure', error: 'intent classification returned malformed output', tokensUsed };
  }
}
