import { z } from 'zod';
import { generate } from './providers';
import { extractJson } from '../utils/json';
import { nodeAlternativeSchema } from '../types/Prompt';
import { logger } from '../utils/logger';
import type { Platform } from '../types/Platform';

/**
 * Single-node re-draft (§10.6, §13, T4.5). Regenerates ONE node of an existing
 * prompt while treating the other nodes as fixed context — the localized
 * correction the node architecture exists to enable. Small model tier (a
 * one-node rewrite is cheap), retry-once-then-fail on malformed output, same
 * tolerant JSON parsing as the Drafting Agent.
 */
export const redraftResultSchema = z.object({
  value: z.string().min(1),
  rationale: z.string().default(''),
  alternatives: z.array(nodeAlternativeSchema).max(4).default([]),
});
export type RedraftResult = z.infer<typeof redraftResultSchema>;

/** Target node is locked — regeneration is refused client- and server-side (§13.2). */
export class NodeLocked extends Error {}
/** No node of the requested type exists in the supplied prompt. */
export class NodeNotFound extends Error {}

type GenerateFn = typeof generate;

export interface RedraftInput {
  platform: Platform;
  taskType: string;
  nodes: Array<{ type: string; value: string; locked?: boolean }>;
  targetNodeType: string;
  instruction?: string;
}

export async function redraftNode(input: RedraftInput, generateFn: GenerateFn = generate): Promise<RedraftResult> {
  const target = input.nodes.find((n) => n.type === input.targetNodeType);
  if (!target) throw new NodeNotFound(`no '${input.targetNodeType}' node in the prompt`);
  if (target.locked) throw new NodeLocked(`node '${input.targetNodeType}' is locked`);

  const fixedContext =
    input.nodes
      .filter((n) => n.type !== input.targetNodeType)
      .map((n) => `- ${n.type}: ${n.value}`)
      .join('\n') || '(no other nodes)';

  const systemPrompt = `You are an expert prompt engineer refining ONE node of a prompt for the "${input.platform.display_name}" platform (task type: ${input.taskType}).
The other nodes are FIXED context — do not restate or change them. Produce a single improved replacement for the "${input.targetNodeType}" node only, in that platform's dialect.
${input.instruction ? `Honor this instruction from the user: ${input.instruction}\n` : ''}Respond with ONLY a JSON object, no prose:
{"value":"<new text for this node>","rationale":"<why this is better>","alternatives":[{"value":"<a different option>","rationale":"<why>","rank":1}]}`;

  const userMessage = `Fixed context nodes:\n${fixedContext}\n\nCurrent "${input.targetNodeType}" value:\n${target.value}\n\nProduce a stronger replacement for just this node.`;

  const MAX_ATTEMPTS = 2;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await generateFn('drafting', 'small', {
        systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
        maxTokens: 800,
        temperature: 0.7,
        responseFormat: 'json',
      });
      return redraftResultSchema.parse(extractJson(res.content));
    } catch (error) {
      logger.warn({
        type: 'redraft:attempt_failed',
        attempt,
        targetNodeType: input.targetNodeType,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  throw new Error('node re-draft failed after retries');
}
