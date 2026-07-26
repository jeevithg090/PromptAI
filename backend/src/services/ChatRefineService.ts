import { z } from 'zod';
import { generate } from './providers';
import { extractJson } from '../utils/json';
import { serializeNodes } from './PromptSerializer';
import { NODE_LABELS } from './ResponseDesign';
import { NODE_TYPES, nodeAlternativeSchema, promptNodeSchema, type PromptNode } from '../types/Prompt';
import { logger } from '../utils/logger';
import type { Platform } from '../types/Platform';
import type { DesignedNode } from '../types/Response';

/**
 * Conversational prompt refinement (chat-refine). A lightweight, free-form
 * alternative to the fixed clarifying-question cards: the user chats about
 * what they want changed, the model either asks one short follow-up
 * question or — once it has enough to go on — returns a COMPLETE updated
 * node set (never a diff), which the caller re-serializes and swaps in for
 * the existing assembled prompt. Same non-agent, direct-service shape as
 * NodeRedraftService (no Supervisor/PipelineContext involvement needed —
 * this operates on an already-drafted prompt, not a fresh pipeline run).
 */
export const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(2_000),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

const chatModelReplySchema = z.union([
  z.object({ type: z.literal('question'), message: z.string().min(1) }),
  z.object({
    type: z.literal('prompt'),
    message: z.string().min(1),
    nodes: z
      .array(
        z.object({
          type: z.enum(NODE_TYPES),
          value: z.string().min(1),
          rationale: z.string().optional(),
          alternatives: z.array(nodeAlternativeSchema).max(4).default([]),
        })
      )
      .min(1),
  }),
]);

export interface ChatRefineInput {
  platform: Platform;
  taskType: string;
  /** The prompt's current nodes — carried forward verbatim unless the chat changes them. */
  currentNodes: Array<{ type: string; value: string; locked?: boolean }>;
  /** Full conversation so far, ending with the latest user message. */
  messages: ChatMessage[];
}

export type ChatRefineResult =
  | { type: 'question'; message: string }
  | { type: 'prompt'; message: string; nodes: DesignedNode[]; assembled: string };

type GenerateFn = typeof generate;

export async function chatRefine(input: ChatRefineInput, generateFn: GenerateFn = generate): Promise<ChatRefineResult> {
  const lastMessage = input.messages[input.messages.length - 1];
  if (!lastMessage || lastMessage.role !== 'user') {
    throw new Error('the last message must be from the user');
  }

  const lockedTypes = new Set(input.currentNodes.filter((n) => n.locked).map((n) => n.type));
  const currentSummary = input.currentNodes.length
    ? input.currentNodes.map((n) => `- ${n.type}${n.locked ? ' (LOCKED — keep exactly as-is)' : ''}: ${n.value}`).join('\n')
    : '(no prompt yet)';

  const systemPrompt = `You are a friendly, concise prompt-design assistant chatting with a user who already has a draft prompt for the "${input.platform.display_name}" platform (task type: ${input.taskType}).
Your ONLY job is to understand what they want changed or added. If their request is ambiguous or under-specified, ask exactly ONE short, specific follow-up question — never a list of questions.
Once you have enough information to make the change confidently, respond with the prompt's COMPLETE updated node set: carry forward every node that isn't changing, never drop one, and never touch a node marked LOCKED.

Current prompt nodes:
${currentSummary}

Respond with ONLY a JSON object, no prose. Exactly one of these two shapes:
1. Need more info: {"type":"question","message":"<one short, specific question>"}
2. Ready to update: {"type":"prompt","message":"<one short sentence summarizing what changed>","nodes":[{"type":"<node type>","value":"<text in the platform's dialect>","rationale":"<why>","alternatives":[]}]}
Valid node types, in order: ${NODE_TYPES.join('|')}.`;

  const chatMessages = input.messages.map((m) => ({ role: m.role, content: m.content }));

  const MAX_ATTEMPTS = 2;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await generateFn('chat_refine', 'large', {
        systemPrompt,
        messages: chatMessages,
        maxTokens: 1_500,
        temperature: 0.6,
        responseFormat: 'json',
      });
      const parsed = chatModelReplySchema.parse(extractJson(res.content));

      if (parsed.type === 'question') {
        return { type: 'question', message: parsed.message };
      }

      // Defense in depth: re-apply locked values verbatim regardless of what the model returned.
      const lockedValues = new Map(input.currentNodes.filter((n) => n.locked).map((n) => [n.type, n.value]));
      const nodes: PromptNode[] = parsed.nodes.map((n, i) =>
        promptNodeSchema.parse({
          type: n.type,
          value: lockedValues.get(n.type) ?? n.value,
          rationale: n.rationale,
          alternatives: n.alternatives,
          locked: lockedTypes.has(n.type),
          position: i,
          defaulted: false,
        })
      );

      const designedNodes: DesignedNode[] = nodes.map((n) => ({
        type: n.type,
        label: NODE_LABELS[n.type],
        value: n.value,
        rationale: n.rationale,
        alternatives: n.alternatives,
        locked: n.locked,
        position: n.position,
        defaulted: n.defaulted,
      }));

      return {
        type: 'prompt',
        message: parsed.message,
        nodes: designedNodes,
        assembled: serializeNodes(nodes, input.platform),
      };
    } catch (error) {
      logger.warn({
        type: 'chat_refine:attempt_failed',
        attempt,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  throw new Error('chat refine failed after retries');
}
