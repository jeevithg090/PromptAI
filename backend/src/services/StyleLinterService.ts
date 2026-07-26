import { z } from 'zod';
import { generate } from './providers';
import { extractJson } from '../utils/json';
import { serializeNodes } from './PromptSerializer';
import { lintDeterministic, type StyleRule, type Violation } from '../utils/styleLint';
import { NODE_TYPES, promptNodeSchema, type PromptNode } from '../types/Prompt';
import { logger } from '../utils/logger';

/**
 * Style Guide Linter (V2.8) — enforce a user/team's implicit rules on every
 * prompt (banned/required terms, max length, required nodes, tone). All rules
 * are deterministic pure functions except `tone`, which needs one small LLM
 * call. Given nodes we serialize them; given assembled text we lint it directly.
 */
const toneReplySchema = z.object({ pass: z.boolean(), reason: z.string().default('') });

export interface LintInput {
  assembled?: string;
  nodes?: Array<{ type: string; value: string }>;
  rules: StyleRule[];
}

export interface LintResult {
  violations: Violation[];
  pass: boolean;
}

type GenerateFn = typeof generate;

export async function lintPrompt(input: LintInput, generateFn: GenerateFn = generate): Promise<LintResult> {
  // Resolve the text + present node types from whichever input was given.
  let assembled = input.assembled ?? '';
  let nodeTypes: string[] = [];
  if (input.nodes && input.nodes.length > 0) {
    nodeTypes = input.nodes.map((n) => n.type);
    if (!assembled) {
      const nodes: PromptNode[] = input.nodes
        .filter((n) => (NODE_TYPES as readonly string[]).includes(n.type))
        .map((n, i) => promptNodeSchema.parse({ type: n.type as PromptNode['type'], value: n.value, alternatives: [], locked: false, position: i, defaulted: false }));
      // Conversational serializer is fine for linting text content.
      assembled = serializeNodes(nodes, { platform_id: 'lint', display_name: 'lint' } as never);
    }
  }

  const violations = lintDeterministic({ assembled, nodeTypes }, input.rules);

  // Tone rules need the model: one small call per tone rule.
  for (const rule of input.rules.filter((r) => r.kind === 'tone')) {
    try {
      const res = await generateFn('lint_tone', 'small', {
        systemPrompt: `You check whether a piece of text matches a required tone. Respond with ONLY JSON: {"pass":true|false,"reason":"<one line>"}`,
        messages: [{ role: 'user', content: `Required tone: ${rule.value}\n\nText:\n${assembled}` }],
        maxTokens: 200,
        temperature: 0,
        responseFormat: 'json',
      });
      const parsed = toneReplySchema.parse(extractJson(res.content));
      if (!parsed.pass) {
        violations.push({ rule, severity: 'low', where: 'prompt', fix_hint: parsed.reason || `Adjust the tone to be ${rule.value}.` });
      }
    } catch (error) {
      logger.warn({ type: 'lint:tone_skipped', reason: error instanceof Error ? error.message : String(error) });
      // Tone check unavailable → don't fabricate a violation; skip it.
    }
  }

  return { violations, pass: violations.length === 0 };
}
