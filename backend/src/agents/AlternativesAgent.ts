import { z } from 'zod';
import { generate } from '../services/providers';
import { NODE_TYPES, nodeAlternativeSchema, type DraftPrompt, type PromptNode, type NodeAlternative } from '../types/Prompt';
import { extractJson } from '../utils/json';
import { logger } from '../utils/logger';
import type { Agent, AgentInput, AgentOutput } from '../types/Agent';

/**
 * Alternatives Agent — spec §7.1, §13.2 (T6.3).
 * Fills gaps: for unlocked creative nodes that currently carry fewer than 2
 * alternatives, generates 2–4 ranked alternatives with PKB-grounded rationale.
 * One small-tier call for all target nodes. Never fatal: any failure → return
 * the draft untouched (alternatives are enhancement, not load-bearing).
 */

const CREATIVE_NODE_TYPES = ['style_aesthetic', 'composition_camera', 'lighting_mood', 'setting_context', 'subject'] as const;

const altItemSchema = nodeAlternativeSchema.extend({ rank: z.number().int().min(1).max(4) });

type GenerateFn = typeof generate;

export class AlternativesAgent implements Agent {
  name = 'AlternativesAgent';

  constructor(private readonly generateFn: GenerateFn = generate) {}

  async execute(input: AgentInput): Promise<AgentOutput> {
    const draft = input.context.finalDraft;
    if (!draft || draft.nodes.length === 0) {
      return { status: 'success', data: { draft: null }, tokensUsed: 0 };
    }

    const targetNodes = draft.nodes.filter(
      (n) => (CREATIVE_NODE_TYPES as readonly string[]).includes(n.type) && !n.locked && n.alternatives.length < 2
    );
    if (targetNodes.length === 0) {
      return { status: 'success', data: { draft }, tokensUsed: 0 };
    }

    const pkbContext = (input.context.pkbChunks ?? [])
      .slice(0, 6)
      .map((c, i) => `[${i}] ${c.content}`)
      .join('\n');

    const systemPrompt = `You are a prompt-engineering assistant generating alternative phrasing options for specific node types in an AI prompt draft.

For each listed node type, produce 2–4 ranked alternatives with a one-line rationale grounded in the provided context where possible.
Alternatives should be distinct from each other and from the current value.
Rank by platform-doc relevance and task fit.

Available reference context:
${pkbContext || '(none provided)'}

Current draft (all nodes — for context only):
${draft.nodes.map((n) => `- ${n.type}: ${n.value}${n.locked ? ' [LOCKED]' : ''}`).join('\n')}

Target node types: ${targetNodes.map((n) => `${n.type} (current: "${n.value}")`).join(', ')}

Respond with ONLY JSON:
{"alternatives":{"<node_type>":[{"value":"<alternative>","rationale":"<why, cite [n] if relevant>","rank":1}]}}`;

    let raw: string;
    let tokensUsed = 0;
    try {
      const res = await this.generateFn('alternatives', 'small', {
        systemPrompt,
        messages: [{ role: 'user', content: 'Generate alternatives for the listed node types.' }],
        maxTokens: 2500,
        temperature: 0.7,
        responseFormat: 'json',
      });
      tokensUsed = res.tokensUsed.input + res.tokensUsed.output;
      raw = res.content;
    } catch (error) {
      logger.warn({
        type: 'agent:provider_error',
        agent: this.name,
        sessionId: input.context.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return { status: 'partial', data: { draft }, tokensUsed: 0 };
    }

    let rawAlternatives: Record<string, unknown> = {};
    try {
      const parsed = extractJson(raw) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object' && 'alternatives' in parsed) {
        rawAlternatives = (parsed as { alternatives: Record<string, unknown> }).alternatives;
      }
    } catch {
      logger.warn({ type: 'agent:malformed_output', agent: this.name, sessionId: input.context.sessionId, responseLength: raw.length });
      return { status: 'partial', data: { draft }, tokensUsed };
    }

    if (typeof rawAlternatives !== 'object' || rawAlternatives === null) {
      logger.warn({ type: 'agent:malformed_output', agent: this.name, sessionId: input.context.sessionId, responseLength: raw.length });
      return { status: 'partial', data: { draft }, tokensUsed };
    }

    const lockedTypes = new Set(draft.nodes.filter((n) => n.locked).map((n) => n.type));

    const updatedNodes: PromptNode[] = draft.nodes.map((n) => {
      if (lockedTypes.has(n.type)) return n;
      const raw = rawAlternatives[n.type];
      if (!Array.isArray(raw) || raw.length === 0) return n;
      const valid: Array<{ value: string; rationale: string; rank: number }> = [];
      for (const item of raw.slice(0, 4)) {
        const r = altItemSchema.safeParse(item);
        if (r.success) valid.push(r.data);
      }
      if (valid.length === 0) return n;
      return { ...n, alternatives: valid as NodeAlternative[] };
    });

    const updatedDraft: DraftPrompt = { ...draft, nodes: updatedNodes };

    logger.info({
      type: 'alternatives:generated',
      sessionId: input.context.sessionId,
      targetCount: targetNodes.length,
    });

    return { status: 'success', data: { draft: updatedDraft }, tokensUsed };
  }
}
