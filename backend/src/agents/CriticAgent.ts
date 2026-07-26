import { z } from 'zod';
import { config } from '../config/env';
import { generate } from '../services/providers';
import { loadStrategyProfiles } from './DraftingAgent';
import { assembleDraft, draftResponseSchema, normalizeRawNodes, DRAFT_JSON_FEWSHOT } from './draftShared';
import { heuristicEvaluation } from '../guardrails/HeuristicScorer';
import {
  RUBRIC_DIMENSIONS,
  computeStrength,
  type DraftPrompt,
  type RubricEvaluation,
  type RubricScores,
} from '../types/Prompt';
import { logger } from '../utils/logger';
import { extractJson } from '../utils/json';
import type { Platform } from '../types/Platform';
import type { Agent, AgentInput, AgentOutput } from '../types/Agent';

/**
 * Critic Agent — spec §10.1, §10.4, §31.3 Step 16.
 * Scores the draft against all eight rubric dimensions (docs/quality-rubric.md),
 * computes the 0–100 strength score with the shared weights, and — when any
 * dimension scores 1 — drives a bounded refinement loop (hard cap
 * CRITIC_MAX_REFINEMENTS, §10.4) that re-drafts fixing exactly the flagged
 * issues, then re-scores. Large model tier (§7.3). Never throws.
 */
const RUBRIC_VERSION = 'v1.0';

const scoreSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const critiqueSchema = z.object({
  scores: z.object(Object.fromEntries(RUBRIC_DIMENSIONS.map((d) => [d, scoreSchema])) as Record<
    (typeof RUBRIC_DIMENSIONS)[number],
    typeof scoreSchema
  >),
  issues: z.array(z.string()).default([]),
});

type GenerateFn = typeof generate;

const RUBRIC_GUIDE = `Score each dimension 1–3 (1=failing/clear violation, 2=acceptable but improvable, 3=excellent):
- specificity: every node concrete, no vague placeholder adjectives doing a description's job.
- unambiguity: no instruction readable two ways.
- non_conflict: no two nodes contradict.
- platform_fit: phrasing/syntax matches the target platform's dialect and honors its quirks.
- constraint_completeness: all load-bearing constraints present (format, exclusions, key parameters).
- format_determinacy: the expected output shape is pinned down, not left open.
- context_efficiency: no wasted tokens; concise for the platform's budget.
- technique_fit: uses the right technique for the task/model (tags for image models, stepwise for reasoning, XML for Claude, etc.).`;

export class CriticAgent implements Agent {
  name = 'CriticAgent';

  constructor(private readonly generateFn: GenerateFn = generate) {}

  private buildScoringPrompt(): string {
    return `You are a strict prompt-quality critic. Evaluate the drafted prompt against this rubric (${RUBRIC_VERSION}).

${RUBRIC_GUIDE}

A score of 1 on any dimension means the prompt should not ship without refinement. Be honest — do not inflate.
List concrete, actionable issues, each naming the node(s) at fault.

Respond with ONLY JSON:
{"scores":{${RUBRIC_DIMENSIONS.map((d) => `"${d}":<1-3>`).join(',')}},"issues":["<issue naming the node>"]}`;
  }

  private draftForModel(draft: DraftPrompt, platformName: string): string {
    const nodes = draft.nodes.map((n) => `- ${n.type}: ${n.value}`).join('\n');
    return `Target platform: ${platformName}\nAssembled prompt:\n${draft.assembled}\n\nNodes:\n${nodes}`;
  }

  /** One rubric scoring call. Returns null on provider/parse failure (caller decides). */
  private async score(
    draft: DraftPrompt,
    platformName: string,
    sessionId: string
  ): Promise<{ evaluation: RubricEvaluation; tokensUsed: number } | null> {
    let raw: string;
    let tokensUsed = 0;
    try {
      const res = await this.generateFn('critic', 'large', {
        systemPrompt: this.buildScoringPrompt(),
        // Generous budget: reasoning tokens count against max_tokens, and a
        // long draft drives long reasoning — too small truncates the scores JSON.
        messages: [{ role: 'user', content: this.draftForModel(draft, platformName) }],
        maxTokens: 3000,
        temperature: 0,
        responseFormat: 'json',
      });
      if (res.finishReason === 'length') {
        logger.warn({ type: 'agent:output_truncated', agent: this.name, sessionId });
      }
      tokensUsed = res.tokensUsed.input + res.tokensUsed.output;
      raw = res.content;
    } catch (error) {
      logger.error({
        type: 'agent:provider_error',
        agent: this.name,
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }

    try {
      const parsed = critiqueSchema.parse(extractJson(raw));
      const scores = parsed.scores as RubricScores;
      const overallStrength = computeStrength(scores);
      const needsRefinement = RUBRIC_DIMENSIONS.some((d) => scores[d] === 1);
      return {
        evaluation: { rubricVersion: RUBRIC_VERSION, scores, overallStrength, issues: parsed.issues, needsRefinement },
        tokensUsed,
      };
    } catch {
      logger.warn({ type: 'agent:malformed_output', agent: this.name, sessionId, responseLength: raw.length });
      return null;
    }
  }

  /** One refinement re-draft fixing the flagged issues. Returns null on failure. */
  private async refine(
    draft: DraftPrompt,
    issues: string[],
    platform: Platform,
    sessionId: string
  ): Promise<{ draft: DraftPrompt; tokensUsed: number } | null> {
    const profile = loadStrategyProfiles().profiles[draft.taskType];
    if (!profile) return null;
    const platformName = platform.display_name;

    const systemPrompt = `You are an expert prompt engineer revising a draft for "${platformName}". Fix ONLY the listed issues; keep everything else intact. Return the full corrected node set.

Respond with ONLY JSON. EVERY node MUST include all four keys: "type", "value", "rationale", "alternatives" — never omit "type".
Schema: {"nodes":[{"type":"<node type>","value":"<text>","rationale":"<why>","alternatives":[{"value":"<alt>","rationale":"<why>","rank":1}]}]}

${DRAFT_JSON_FEWSHOT}`;

    const userMessage = `Current nodes:\n${draft.nodes.map((n) => `- ${n.type}: ${n.value}`).join('\n')}\n\nIssues to fix:\n${issues.map((i) => `- ${i}`).join('\n')}`;

    let raw: string;
    let tokensUsed = 0;
    try {
      const res = await this.generateFn('critic', 'large', {
        systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
        maxTokens: profile.max_tokens,
        temperature: profile.temperature,
        responseFormat: 'json',
      });
      tokensUsed = res.tokensUsed.input + res.tokensUsed.output;
      raw = res.content;
    } catch (error) {
      logger.error({ type: 'agent:provider_error', agent: this.name, sessionId, error: error instanceof Error ? error.message : String(error) });
      return null;
    }

    try {
      const parsed = draftResponseSchema.parse(normalizeRawNodes(extractJson(raw), profile.required_nodes));
      // Preserve locked nodes from the prior draft (§13.2) — never overwrite a locked value.
      const locked = new Map(draft.nodes.filter((n) => n.locked).map((n) => [n.type, n]));
      const merged = parsed.nodes.filter((n) => !locked.has(n.type));
      const refined = assembleDraft(merged, {
        requiredOrder: profile.required_nodes,
        platform,
        taskType: draft.taskType,
        refinementCount: draft.refinementCount + 1,
      });
      // Re-insert locked nodes verbatim.
      for (const [, node] of locked) refined.nodes.push(node);
      return { draft: refined, tokensUsed };
    } catch {
      logger.warn({ type: 'agent:malformed_output', agent: this.name, sessionId, responseLength: raw.length });
      return null;
    }
  }

  async execute(input: AgentInput): Promise<AgentOutput> {
    const { context } = input;
    const draft = context.finalDraft;
    if (!draft) {
      return { status: 'failure', error: 'critic has no draft to evaluate' };
    }
    const platformName = context.platform.display_name;
    let totalTokens = 0;

    // Initial score.
    const first = await this.score(draft, platformName, context.sessionId);
    if (!first) {
      // Critic outage → heuristic scoring fallback (§29.7, T3.3).
      // Keep the draft with a deterministic score so the pipeline completes degraded.
      const profile = loadStrategyProfiles().profiles[draft.taskType];
      const evaluation = heuristicEvaluation(draft, {
        requiredNodes: profile?.required_nodes,
        maxPromptTokens: context.platform.max_prompt_tokens,
      });
      const scoredDraft: DraftPrompt = { ...draft, evaluation };
      logger.warn({ type: 'critic:heuristic_fallback', sessionId: context.sessionId });
      return { status: 'partial', data: { draft: scoredDraft, evaluation }, tokensUsed: totalTokens };
    }
    totalTokens += first.tokensUsed;

    // The pre-refinement score is the "before" baseline for enhance mode (F1.1).
    const initialEvaluation = first.evaluation;
    let current = draft;
    let evaluation = first.evaluation;
    const cap = config.CRITIC_MAX_REFINEMENTS;

    // Bounded refinement loop (§10.4): re-draft flagged issues, re-score, up to the cap.
    while (evaluation.needsRefinement && current.refinementCount < cap) {
      const refined = await this.refine(current, evaluation.issues, context.platform, context.sessionId);
      if (!refined) break; // refinement failed → keep the best-scored draft so far
      totalTokens += refined.tokensUsed;

      const rescored = await this.score(refined.draft, platformName, context.sessionId);
      if (!rescored) break;
      totalTokens += rescored.tokensUsed;

      current = refined.draft;
      evaluation = rescored.evaluation;
      logger.info({
        type: 'critic:refined',
        sessionId: context.sessionId,
        pass: current.refinementCount,
        strength: evaluation.overallStrength,
        stillFailing: evaluation.needsRefinement,
      });
    }

    const finalDraft: DraftPrompt = { ...current, evaluation };
    logger.info({
      type: 'critic:final',
      sessionId: context.sessionId,
      strength: evaluation.overallStrength,
      refinementCount: current.refinementCount,
      needsRefinement: evaluation.needsRefinement,
    });

    return { status: 'success', data: { draft: finalDraft, evaluation, initialEvaluation }, tokensUsed: totalTokens };
  }
}
