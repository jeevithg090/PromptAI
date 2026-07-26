import { z } from 'zod';
import { generate } from './providers';
import { design } from './ResponseDesign';
import { govern } from '../guardrails/TokenGovernor';
import { extractJson } from '../utils/json';
import { CriticAgent } from '../agents/CriticAgent';
import { loadStrategyProfiles } from '../agents/DraftingAgent';
import { assembleDraft, draftResponseSchema, normalizeRawNodes } from '../agents/draftShared';
import { NODE_TYPES, TASK_TYPES, type TaskType } from '../types/Prompt';
import { numberChunks } from '../utils/chunkRefs';
import { logger } from '../utils/logger';
import type { Platform } from '../types/Platform';
import type { PipelineContext, KnowledgeChunk } from '../types/Agent';
import type { DesignedResponse } from '../types/Response';

/**
 * Chat-first drafting (V1.4): a genuine two-way conversation that PRODUCES a
 * prompt, with optional file attachments for context. The assistant either
 * asks one short question or emits a full node set, which we assemble, score
 * with the real CriticAgent, and shape into the same DesignedResponse the
 * form-based pipeline returns — so a chat draft opens in the node editor
 * exactly like a normal draft. Presence of `currentNodes` turns a turn into
 * refinement (unifying with the ChatRefine surface).
 */
export const chatDraftMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(4_000),
});
export type ChatDraftMessage = z.infer<typeof chatDraftMessageSchema>;

export const chatDraftAttachmentSchema = z.object({
  name: z.string().min(1).max(200),
  mime: z.string().max(100).default('text/plain'),
  text: z.string().min(1).max(50_000),
});
export type ChatDraftAttachment = z.infer<typeof chatDraftAttachmentSchema>;

const chatDraftReplySchema = z.union([
  z.object({ type: z.literal('question'), message: z.string().min(1) }),
  z.object({
    type: z.literal('draft'),
    message: z.string().min(1),
    task_type: z.enum(TASK_TYPES).optional(),
    nodes: z
      .array(
        z.object({
          type: z.enum(NODE_TYPES),
          value: z.string().min(1),
          rationale: z.string().optional(),
          alternatives: z.array(z.any()).max(4).default([]),
        })
      )
      .min(1),
  }),
]);

export interface ChatDraftInput {
  userId: string;
  platform: Platform;
  messages: ChatDraftMessage[];
  attachments?: ChatDraftAttachment[];
  /** Present → this turn refines an existing draft rather than creating one. */
  currentNodes?: Array<{ type: string; value: string; locked?: boolean }>;
  /** Custom-platform doc chunks (V1.1) so grounding works for custom targets. */
  customChunks?: KnowledgeChunk[];
}

export type ChatDraftResult =
  | { type: 'question'; message: string }
  | { type: 'draft'; message: string; response: DesignedResponse };

type GenerateFn = typeof generate;

function attachmentDigest(attachments: ChatDraftAttachment[] | undefined): string {
  if (!attachments || attachments.length === 0) return '';
  return (
    '\n\nAttached files (context the user provided — ground the prompt in these where relevant):\n' +
    attachments.map((a) => `--- ${a.name} (${a.mime}) ---\n${a.text.slice(0, 12_000)}`).join('\n\n')
  );
}

export class ChatDraftService {
  constructor(private readonly generateFn: GenerateFn = generate) {}

  private buildSystemPrompt(platform: Platform, chunks: KnowledgeChunk[], refining: boolean): string {
    const numbered = numberChunks(chunks);
    const knowledge = numbered.length
      ? numbered.map((n) => `[${n.ref}] ${n.chunk.content}`).join('\n')
      : '(no platform-specific knowledge available)';

    return `You are a prompt-engineering copilot helping a user craft an excellent prompt FOR the "${platform.display_name}" platform (the prompt's audience is that platform's model, not a human).

PLATFORM RULES:
${platform.syntax_rules.map((r) => `- ${r}`).join('\n') || '- (none listed)'}
PLATFORM QUIRKS:
${platform.quirks.map((q) => `- ${q}`).join('\n') || '- (none listed)'}
PLATFORM KNOWLEDGE (ground choices in these; reference as [P<n>]/[M<n>]):
${knowledge}

Have a natural conversation. If you don't yet have enough to build a strong prompt, ask exactly ONE short, specific question — never a list. ${refining ? 'The user already has a draft (shown below) and wants to change it: return the COMPLETE updated node set.' : 'Once you have enough, emit the finished prompt as typed nodes.'}

Respond with ONLY a JSON object, exactly one of these shapes:
1. Need more info: {"type":"question","message":"<one short question>"}
2. Ready: {"type":"draft","message":"<one friendly sentence about what you built>","task_type":"<${TASK_TYPES.join('|')}>","nodes":[{"type":"<${NODE_TYPES.join('|')}>","value":"<text in the platform's dialect>","rationale":"<why, cite [P<n>] where possible>","alternatives":[]}]}`;
  }

  async draft(input: ChatDraftInput): Promise<ChatDraftResult> {
    const last = input.messages[input.messages.length - 1];
    if (!last || last.role !== 'user') throw new Error('the last message must be from the user');

    const chunks = input.customChunks ?? [];
    const refining = Boolean(input.currentNodes && input.currentNodes.length > 0);

    const chatMessages: ChatDraftMessage[] = input.messages.map((m, i) =>
      i === input.messages.length - 1
        ? {
            role: 'user',
            content:
              m.content +
              attachmentDigest(input.attachments) +
              (refining ? `\n\nCurrent draft nodes:\n${input.currentNodes!.map((n) => `- ${n.type}: ${n.value}`).join('\n')}` : ''),
          }
        : m
    );

    const MAX_ATTEMPTS = 2;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await this.generateFn('chat_draft', 'large', {
          systemPrompt: this.buildSystemPrompt(input.platform, chunks, refining),
          messages: chatMessages,
          maxTokens: 2_000,
          temperature: 0.6,
          responseFormat: 'json',
        });
        const parsed = chatDraftReplySchema.parse(extractJson(res.content));

        if (parsed.type === 'question') {
          return { type: 'question', message: parsed.message };
        }

        // Assemble → score with the REAL Critic → design, exactly like /draft.
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
          userIdea: input.messages.filter((m) => m.role === 'user').map((m) => m.content).join(' ').slice(0, 500),
          taskType,
          finalDraft: draft,
          pkbChunks: chunks,
        };

        const critic = await new CriticAgent().execute({ context, params: {} });
        if (critic.data?.draft) context.finalDraft = critic.data.draft as typeof draft;
        if (critic.data?.evaluation) context.evaluation = critic.data.evaluation as PipelineContext['evaluation'];
        context.governorReport = govern(context.finalDraft!.assembled, input.platform);

        const response = design(context);
        if (!response) throw new Error('design produced no response');
        return { type: 'draft', message: parsed.message, response };
      } catch (error) {
        logger.warn({
          type: 'chat_draft:attempt_failed',
          attempt,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
    throw new Error('chat draft failed after retries');
  }
}
