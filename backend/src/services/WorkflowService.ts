import { z } from 'zod';
import { generate } from './providers';
import { govern } from '../guardrails/TokenGovernor';
import { fillVars } from '../utils/templateVars';
import { logger } from '../utils/logger';

/**
 * Workflow Composer (V2.5) — chained prompts with piped variables. Real work
 * is multi-step (research → outline → draft → critique); this runs an ordered
 * list of steps where each step's output is captured into a variable that
 * later steps interpolate via {{var}}. Sequential execution through the house
 * provider, per-step token cap + total budget guard, per-step trace.
 */
export const workflowStepSchema = z.object({
  name: z.string().min(1).max(120),
  /** Prompt text with {{var}} placeholders. */
  prompt: z.string().min(1).max(10_000),
  /** Variable name to store this step's output under (consumed by later steps). */
  output_var: z.string().min(1).max(60).regex(/^[a-zA-Z0-9_]+$/),
});
export type WorkflowStep = z.infer<typeof workflowStepSchema>;

export const workflowDefSchema = z.object({
  name: z.string().min(1).max(200).default('Untitled workflow'),
  steps: z.array(workflowStepSchema).min(1).max(8),
  /** Seed variables available to the first step. */
  inputs: z.record(z.string().max(60), z.string().max(4_000)).default({}),
});
export type WorkflowDef = z.infer<typeof workflowDefSchema>;

export interface StepResult {
  name: string;
  output_var: string;
  resolved_prompt: string;
  output: string;
  tokens_used: number;
}

export interface WorkflowRunResult {
  results: StepResult[];
  total_tokens: number;
  variables: Record<string, string>;
}

const PER_STEP_MAX_TOKENS = 1_200;
const TOTAL_TOKEN_BUDGET = 12_000;

type GenerateFn = typeof generate;

export async function runWorkflow(def: WorkflowDef, generateFn: GenerateFn = generate): Promise<WorkflowRunResult> {
  const variables: Record<string, string> = { ...def.inputs };
  const results: StepResult[] = [];
  let totalTokens = 0;

  for (const step of def.steps) {
    if (totalTokens >= TOTAL_TOKEN_BUDGET) {
      throw new Error('workflow exceeded its total token budget');
    }
    const resolved = fillVars(step.prompt, variables);
    // Length guard before spending a model call.
    const report = govern(resolved, { max_prompt_tokens: 8_000 } as never);
    if (report.tokenCount > 8_000) {
      throw new Error(`step "${step.name}" prompt is too long (~${report.tokenCount} tokens)`);
    }

    let output = '';
    let tokens = 0;
    try {
      const res = await generateFn('drafting', 'large', {
        systemPrompt: 'You are executing one step of a user-defined workflow. Follow the instruction exactly and return only the requested output.',
        messages: [{ role: 'user', content: resolved }],
        maxTokens: PER_STEP_MAX_TOKENS,
        temperature: 0.5,
      });
      output = res.content.trim();
      tokens = res.tokensUsed.input + res.tokensUsed.output;
    } catch (error) {
      logger.warn({ type: 'workflow:step_failed', step: step.name, reason: error instanceof Error ? error.message : String(error) });
      throw new Error(`step "${step.name}" failed`);
    }

    variables[step.output_var] = output;
    totalTokens += tokens;
    results.push({ name: step.name, output_var: step.output_var, resolved_prompt: resolved, output, tokens_used: tokens });
  }

  return { results, total_tokens: totalTokens, variables };
}
