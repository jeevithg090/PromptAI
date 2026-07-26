import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { config } from '../config/env';
import { generate } from '../services/providers';
import { serializeNodes } from '../services/PromptSerializer';
import { NODE_TYPES, type PromptNode, type TaskType } from '../types/Prompt';
import { logger } from '../utils/logger';
import { extractJson } from '../utils/json';
import { numberChunks } from '../utils/chunkRefs';
import { assembleDraft, draftResponseSchema, normalizeRawNodes, DRAFT_JSON_FEWSHOT, type RawDraftNode } from './draftShared';
import type { Agent, AgentInput, AgentOutput } from '../types/Agent';

/**
 * Drafting Agent — spec §10.3, §13, §31.3 Step 15. The core generator:
 * clarified values + PKB/MPKB grounding + task-type strategy profile →
 * ordered node set with ranked alternatives, then platform-serialized
 * (§13.3). Large model tier. Retry-once on malformed output, graceful
 * failure after that (§29.7).
 */
const strategyProfileSchema = z.object({
  version: z.number().int(),
  temperature: z.number().min(0).max(1),
  max_tokens: z.number().int().positive(),
  required_nodes: z.array(z.enum(NODE_TYPES)).min(1),
  guidance: z.string(),
  mpkb_refs: z.array(z.string()).optional(),
});
type StrategyProfile = z.infer<typeof strategyProfileSchema>;

const profilesFileSchema = z.object({
  schema_version: z.string(),
  note: z.string().optional(),
  profiles: z.record(strategyProfileSchema),
});

let cachedProfiles: z.infer<typeof profilesFileSchema> | null = null;

function profilesPath(): string {
  // backend/src/agents → repo root is three levels up (same depth from dist/).
  return config.STRATEGY_PROFILES_PATH ?? path.resolve(__dirname, '..', '..', '..', 'config', 'strategy-profiles.json');
}

export function loadStrategyProfiles(): z.infer<typeof profilesFileSchema> {
  if (cachedProfiles) return cachedProfiles;
  cachedProfiles = profilesFileSchema.parse(JSON.parse(fs.readFileSync(profilesPath(), 'utf-8')));
  return cachedProfiles;
}

/** Intent-entity keys → the node type they substantiate (for `defaulted` marking, §11.2). */
const ENTITY_TO_NODE: Record<string, PromptNode['type']> = {
  subject: 'subject',
  action: 'action_behavior',
  setting: 'setting_context',
  environment: 'setting_context',
  location: 'setting_context',
  style: 'style_aesthetic',
  tone: 'style_aesthetic',
  composition: 'composition_camera',
  framing: 'composition_camera',
  camera: 'composition_camera',
  lighting: 'lighting_mood',
  mood: 'lighting_mood',
  role: 'persona_role',
  persona: 'persona_role',
  audience: 'setting_context',
  format: 'output_format',
  output: 'output_format',
  language: 'technical_parameters',
  framework: 'technical_parameters',
  aspect_ratio: 'technical_parameters',
  constraints: 'constraints_rules',
  avoid: 'negative_prompt',
};

type GenerateFn = typeof generate;

export class DraftingAgent implements Agent {
  name = 'DraftingAgent';

  constructor(private readonly generateFn: GenerateFn = generate) {}

  private buildSystemPrompt(profile: StrategyProfile, input: AgentInput): string {
    const { platform } = input.context;
    // Shared numbering (V1.6): the same [P<n>]/[M<n>] refs are resolved back
    // to source URLs by ResponseDesign, so both MUST use numberChunks.
    const numbered = numberChunks(input.context.pkbChunks);
    const pkbEntries = numbered.filter((n) => n.chunk.kind === 'pkb');
    const mpkbEntries = numbered.filter((n) => n.chunk.kind === 'mpkb');

    const pkbSection = pkbEntries.length
      ? pkbEntries.map((n) => `[${n.ref}] ${n.chunk.content}`).join('\n')
      : '(no platform-specific knowledge)';

    const mpkbSection = mpkbEntries.length
      ? mpkbEntries.map((n) => `[${n.ref}] ${n.chunk.content}`).join('\n')
      : '(no model-behavior knowledge)';

    return `You are an expert prompt engineer drafting a prompt FOR the "${platform.display_name}" platform (the prompt's audience is that platform's model, not a human).

STRATEGY (${profile.version ? `v${profile.version}` : 'v1'}): ${profile.guidance}

PLATFORM RULES:
${platform.syntax_rules.map((r) => `- ${r}`).join('\n') || '- (none listed)'}
PLATFORM QUIRKS:
${platform.quirks.map((q) => `- ${q}`).join('\n') || '- (none listed)'}

PLATFORM KNOWLEDGE (ground syntax and capability choices in these; reference as [P<n>]):
${pkbSection}

MODEL BEHAVIOR KNOWLEDGE (ground phrasing and technique choices in these; reference as [M<n>]):
${mpkbSection}

Produce the prompt as typed nodes. Required node types, in order: ${profile.required_nodes.join(', ')}.
Omit a required node ONLY if truly inapplicable. Never invent user intent — build from what the user gave; fill gaps with sensible, platform-appropriate defaults.

Respond with ONLY a JSON object, no prose. EVERY node MUST include all four keys: "type" (one of: ${NODE_TYPES.join('|')}), "value", "rationale", "alternatives" — never omit "type".
Schema: {"nodes":[{"type":"<node type>","value":"<text in the platform's dialect>","rationale":"<why, grounded in [P<n>] or [M<n>] where possible>","alternatives":[{"value":"<alternative>","rationale":"<why>","rank":1}]}]}

${DRAFT_JSON_FEWSHOT}

Give 2–3 ranked alternatives for creative nodes (style, composition, lighting); 0–1 for factual ones.`;
  }

  private buildUserMessage(input: AgentInput): string {
    const { context } = input;
    const parts = [`User idea: ${context.userIdea}`];
    if (context.entities && Object.keys(context.entities).length) {
      parts.push(`Extracted details: ${JSON.stringify(context.entities)}`);
    }
    if (context.clarifications && Object.keys(context.clarifications).length) {
      parts.push(`User's clarification answers: ${JSON.stringify(context.clarifications)}`);
    }
    if (context.justGenerate) {
      parts.push('The user chose "just generate now" — fill unanswered aspects with sensible defaults.');
    }
    if (context.memories && context.memories.length > 0) {
      parts.push(`User's saved preferences: ${context.memories.join('; ')}`);
    }
    return parts.join('\n');
  }

  async execute(input: AgentInput): Promise<AgentOutput> {
    const { context } = input;
    const taskType: TaskType = context.taskType ?? 'long_form_writing';
    const profile = loadStrategyProfiles().profiles[taskType];
    if (!profile) {
      return { status: 'failure', error: `no strategy profile for task type '${taskType}'` };
    }

    // Node types substantiated by the user (entities or clarification answers) are NOT defaulted.
    const confirmed = new Set<PromptNode['type']>();
    for (const key of Object.keys(context.entities ?? {})) {
      const node = ENTITY_TO_NODE[key.toLowerCase()];
      if (node) confirmed.add(node);
    }

    let tokensUsed = 0;
    const MAX_ATTEMPTS = 2;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let raw: string;
      try {
        const res = await this.generateFn('drafting', 'large', {
          systemPrompt: this.buildSystemPrompt(profile, input),
          messages: [{ role: 'user', content: this.buildUserMessage(input) }],
          maxTokens: profile.max_tokens,
          temperature: profile.temperature,
          responseFormat: 'json',
        });
        tokensUsed += res.tokensUsed.input + res.tokensUsed.output;
        raw = res.content;
        if (res.finishReason === 'length') {
          // Output was cut off mid-JSON — parsing will fail; log the real cause.
          logger.warn({ type: 'agent:output_truncated', agent: this.name, sessionId: context.sessionId, attempt });
        }
      } catch (error) {
        logger.error({
          type: 'agent:provider_error',
          agent: this.name,
          sessionId: context.sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
        continue; // retry on next attempt — both must fail before fallback (§29.7, T3.3)
      }

      try {
        const parsed = draftResponseSchema.parse(normalizeRawNodes(extractJson(raw), profile.required_nodes));
        const draft = assembleDraft(parsed.nodes, {
          requiredOrder: profile.required_nodes,
          platform: context.platform,
          taskType,
          refinementCount: 0,
          justGenerate: context.justGenerate,
          confirmed,
        });
        return { status: 'success', data: { draft }, tokensUsed };
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

    // Both attempts failed — build a template fallback (§29.7, T3.3).
    const FALLBACK_VALUES: Record<PromptNode['type'], string> = {
      subject: context.userIdea || 'a subject',
      action_behavior: 'in a natural setting',
      setting_context: 'in a simple, clear environment',
      style_aesthetic: 'clean, simple style',
      composition_camera: 'straightforward composition',
      lighting_mood: 'natural lighting',
      persona_role: 'a helpful assistant',
      constraints_rules: 'keep it concise and clear',
      technical_parameters: 'standard parameters',
      negative_prompt: 'low quality, blurry',
      output_format: 'clear, structured output',
    };

    // Reverse lookup: find entity/clarification values that map to each node type.
    const entityValues: Record<string, string> = {};
    for (const [key, val] of Object.entries(context.entities ?? {})) {
      entityValues[key.toLowerCase()] = val;
    }
    for (const [key, val] of Object.entries(context.clarifications ?? {})) {
      entityValues[key.toLowerCase()] = val;
    }

    const fallbackNodes: RawDraftNode[] = profile.required_nodes.map((nodeType) => {
      // Try to find a value from entities/clarifications via ENTITY_TO_NODE reverse lookup.
      let value: string | undefined;
      for (const [entityKey, mappedType] of Object.entries(ENTITY_TO_NODE)) {
        if (mappedType === nodeType && entityValues[entityKey]) {
          value = entityValues[entityKey];
          break;
        }
      }
      return {
        type: nodeType,
        value: value ?? FALLBACK_VALUES[nodeType] ?? 'a sensible default',
        rationale: 'fallback template — provider unavailable',
        alternatives: [],
      };
    });

    const fallbackDraft = assembleDraft(fallbackNodes, {
      requiredOrder: profile.required_nodes,
      platform: context.platform,
      taskType,
      refinementCount: 0,
      justGenerate: true, // all fallback nodes are defaulted (§11.2)
    });

    logger.warn({ type: 'agent:fallback_template_used', sessionId: context.sessionId, taskType });

    return { status: 'partial', data: { draft: fallbackDraft }, error: 'draft generated from fallback template', tokensUsed };
  }
}
