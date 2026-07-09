import { z } from 'zod';
import { serializeNodes } from '../services/PromptSerializer';
import { NODE_TYPES, nodeAlternativeSchema, promptNodeSchema, type DraftPrompt, type PromptNode, type TaskType } from '../types/Prompt';
import type { Platform } from '../types/Platform';

/**
 * Shared node contract + assembly used by both the Drafting Agent (T2.8) and
 * the Critic's refinement pass (T2.9) — one definition of "model node JSON →
 * DraftPrompt" so a refined draft is structurally identical to a fresh one.
 */
export const draftResponseSchema = z.object({
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
});
export type RawDraftNode = z.infer<typeof draftResponseSchema>['nodes'][number];

/**
 * Few-shot example for the node-JSON contract — the single highest-leverage
 * format-following technique per our own seeded MPKB ("few-shot examples
 * dominate instructions when they conflict"). Shared so Drafting and
 * Critic-refine prompts never drift out of sync with each other.
 */
export const DRAFT_JSON_FEWSHOT = `Example (for a different idea, showing the exact shape required — note every node has "type", "value", "rationale", "alternatives"):
{"nodes":[{"type":"subject","value":"a weathered lighthouse keeper","rationale":"names the concrete subject from the idea","alternatives":[{"value":"a young lighthouse keeper","rationale":"shifts the emotional tone toward hope","rank":1}]},{"type":"lighting_mood","value":"stormy dusk, distant lightning","rationale":"grounds the mood requested by the user","alternatives":[]}]}`;

/**
 * Tolerates two live-observed Groq/Llama-3.3-70b quirks in the node JSON,
 * applied before strict schema validation:
 *
 * 1. Missing "type" key — the model sometimes omits it even with an explicit
 *    instruction AND a few-shot example, but reliably emits nodes in the
 *    requested order. Fill any missing/invalid "type" positionally from
 *    requiredOrder; a model that DOES include "type" is unaffected.
 * 2. Empty-string "value" on an inapplicable node (e.g. negative_prompt:"")
 *    instead of omitting the node entirely, even though instructed to omit.
 *    Drop these — an explicitly empty value IS an omission, and the rubric
 *    itself treats "empty optional nodes" as fine (only vague *filled*
 *    nodes are penalized, docs/quality-rubric.md dimension 1).
 */
export function normalizeRawNodes(parsed: unknown, requiredOrder: PromptNode['type'][]): unknown {
  if (typeof parsed !== 'object' || parsed === null || !('nodes' in parsed)) return parsed;
  const nodes = (parsed as { nodes: unknown }).nodes;
  if (!Array.isArray(nodes)) return parsed;

  const typed = nodes.map((n, i) => {
    if (typeof n !== 'object' || n === null) return n;
    const type = (n as { type?: unknown }).type;
    const isValidType = typeof type === 'string' && (NODE_TYPES as readonly string[]).includes(type);
    if (isValidType) return n;
    return { ...n, type: requiredOrder[i] ?? requiredOrder[requiredOrder.length - 1] };
  });

  const nonEmpty = typed.filter((n) => {
    if (typeof n !== 'object' || n === null) return true; // let schema validation reject it properly
    const value = (n as { value?: unknown }).value;
    return typeof value !== 'string' || value.trim() !== '';
  });

  return { ...parsed, nodes: nonEmpty };
}

export interface AssembleOptions {
  requiredOrder: PromptNode['type'][];
  platform: Platform;
  taskType: TaskType;
  refinementCount: number;
  /** justGenerate marks nodes the user never confirmed as defaulted (§11.2). */
  justGenerate?: boolean;
  confirmed?: Set<PromptNode['type']>;
}

export function assembleDraft(rawNodes: RawDraftNode[], opts: AssembleOptions): DraftPrompt {
  const orderOf = (t: PromptNode['type']): number => {
    const idx = opts.requiredOrder.indexOf(t);
    return idx === -1 ? opts.requiredOrder.length : idx;
  };
  const nodes: PromptNode[] = [...rawNodes]
    .sort((a, b) => orderOf(a.type) - orderOf(b.type))
    .map((n, i) =>
      promptNodeSchema.parse({
        ...n,
        locked: false,
        position: i,
        defaulted: Boolean(opts.justGenerate) && !(opts.confirmed?.has(n.type) ?? false),
      })
    );

  return {
    nodes,
    assembled: serializeNodes(nodes, opts.platform),
    platformId: opts.platform.platform_id,
    taskType: opts.taskType,
    refinementCount: opts.refinementCount,
  };
}
