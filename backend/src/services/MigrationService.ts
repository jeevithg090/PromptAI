import { z } from 'zod';
import { generate } from './providers';
import { serializeNodes } from './PromptSerializer';
import { extractJson } from '../utils/json';
import { PKBService, loadSeedChunksByPlatform } from './PKBService';
import { numberChunks } from '../utils/chunkRefs';
import { normalizeRawNodes, draftResponseSchema } from '../agents/draftShared';
import { NODE_TYPES, promptNodeSchema, type PromptNode } from '../types/Prompt';
import { logger } from '../utils/logger';
import type { Platform } from '../types/Platform';

/**
 * Model Migration Assistant (V2.4) — port a prompt across platforms without
 * silently losing parameters. Grounded in the TARGET platform's docs + syntax
 * rules, it translates each node, reports every change (kept / translated /
 * dropped / added) with a doc-cited reason, and flags risks (e.g. "SD has no
 * --ar; moved to a resolution parameter").
 */
const ACTIONS = ['kept', 'translated', 'dropped', 'added'] as const;

const migrateReplySchema = z.object({
  target_nodes: z
    .array(
      z.object({
        // Tolerant: models sometimes emit non-standard type names (e.g.
        // "main_prompt"); we coerce them positionally via normalizeRawNodes.
        type: z.string(),
        value: z.string().min(1),
        rationale: z.string().optional(),
        alternatives: z.array(z.any()).max(4).default([]),
      })
    )
    .min(1),
  change_report: z
    .array(
      z.object({
        node_type: z.string().max(50),
        action: z.enum(ACTIONS),
        from: z.string().default(''),
        to: z.string().default(''),
        reason: z.string().min(1),
      })
    )
    .max(20),
  risk_flags: z.array(z.string()).max(10).default([]),
});

export interface MigrateInput {
  nodes: Array<{ type: string; value: string }>;
  source: Platform;
  target: Platform;
}

export interface MigrateResult {
  target_nodes: PromptNode[];
  target_assembled: string;
  source_assembled: string;
  change_report: z.infer<typeof migrateReplySchema>['change_report'];
  risk_flags: string[];
}

type GenerateFn = typeof generate;

async function targetKnowledge(target: Platform): Promise<string> {
  let chunks;
  try {
    chunks = await new PKBService().listByPlatform(target.platform_id, 6);
    if (chunks.length === 0) chunks = loadSeedChunksByPlatform(target.platform_id, 6);
  } catch {
    chunks = loadSeedChunksByPlatform(target.platform_id, 6);
  }
  const numbered = numberChunks(chunks);
  return numbered.length ? numbered.map((n) => `[${n.ref}] ${n.chunk.content}`).join('\n') : '(no target docs available)';
}

export async function migratePrompt(input: MigrateInput, generateFn: GenerateFn = generate): Promise<MigrateResult> {
  const knowledge = await targetKnowledge(input.target);
  const sourceNodesText = input.nodes.map((n) => `- ${n.type}: ${n.value}`).join('\n');

  const systemPrompt = `You are porting a prompt from "${input.source.display_name}" to "${input.target.display_name}". Translate it faithfully into the TARGET platform's dialect.

TARGET PLATFORM RULES:
${input.target.syntax_rules.map((r) => `- ${r}`).join('\n') || '- (none listed)'}
TARGET PLATFORM QUIRKS:
${input.target.quirks.map((q) => `- ${q}`).join('\n') || '- (none listed)'}
TARGET DOC KNOWLEDGE (cite as [P<n>]):
${knowledge}

For each source node, decide: keep as-is, translate to the target's syntax, drop it (if the target can't use it), or add a node the target needs. Report every decision with a reason grounded in the target's rules/docs. Flag risks where meaning may be lost (e.g. a parameter the target lacks).

Respond with ONLY JSON:
{"target_nodes":[{"type":"<node type>","value":"<text in target dialect>","rationale":"<why>","alternatives":[]}],"change_report":[{"node_type":"<type>","action":"kept|translated|dropped|added","from":"<source value or ''>","to":"<target value or ''>","reason":"<grounded reason>"}],"risk_flags":["<risk>"]}`;

  const MAX_ATTEMPTS = 2;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await generateFn('migrate', 'large', {
        systemPrompt,
        messages: [{ role: 'user', content: `Source prompt nodes:\n${sourceNodesText}` }],
        maxTokens: 2_500,
        temperature: 0.3,
        responseFormat: 'json',
      });
      const parsed = migrateReplySchema.parse(extractJson(res.content));
      // Coerce any non-standard node types positionally to valid ones (same
      // tolerance as the drafting agent), then assemble.
      const coerced = draftResponseSchema.parse(normalizeRawNodes({ nodes: parsed.target_nodes }, [...NODE_TYPES]));
      const targetNodes: PromptNode[] = coerced.nodes.map((n, i) =>
        promptNodeSchema.parse({ type: n.type, value: n.value, rationale: n.rationale, alternatives: n.alternatives, locked: false, position: i, defaulted: false })
      );
      // Serialize both sides for the side-by-side diff.
      const sourceNodes: PromptNode[] = input.nodes
        .filter((n) => (NODE_TYPES as readonly string[]).includes(n.type))
        .map((n, i) => promptNodeSchema.parse({ type: n.type as PromptNode['type'], value: n.value, alternatives: [], locked: false, position: i, defaulted: false }));

      return {
        target_nodes: targetNodes,
        target_assembled: serializeNodes(targetNodes, input.target),
        source_assembled: serializeNodes(sourceNodes, input.source),
        change_report: parsed.change_report,
        risk_flags: parsed.risk_flags,
      };
    } catch (error) {
      logger.warn({ type: 'migrate:attempt_failed', attempt, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  throw new Error('migration failed after retries');
}
