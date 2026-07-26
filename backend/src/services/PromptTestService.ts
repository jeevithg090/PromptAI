import { z } from 'zod';
import { generate } from './providers';
import { fillVars } from '../utils/templateVars';
import { extractJson } from '../utils/json';
import { logger } from '../utils/logger';

/**
 * Prompt Regression Suite (V2.3) — CI for prompts. Test cases attach var
 * values + assertions to a prompt; running executes the filled prompt through
 * the provider and grades each assertion. Deterministic assertion kinds are
 * pure checks; the `judge` kind uses one small LLM call (pass/fail + reason).
 */
const assertionSchema = z.object({
  kind: z.enum(['contains', 'not_contains', 'regex', 'max_words', 'judge']),
  value: z.string().min(1).max(1_000),
});

export const testCaseSchema = z.object({
  name: z.string().min(1).max(120),
  var_values: z.record(z.string().max(60), z.string().max(4_000)).default({}),
  assertions: z.array(assertionSchema).min(1).max(10),
});
export type TestCase = z.infer<typeof testCaseSchema>;

export interface AssertionResult {
  kind: string;
  value: string;
  pass: boolean;
  detail: string;
}
export interface CaseResult {
  name: string;
  pass: boolean;
  output: string;
  assertions: AssertionResult[];
}
export interface RunResult {
  results: CaseResult[];
  pass_rate: number;
}

const judgeReplySchema = z.object({ pass: z.boolean(), reason: z.string().default('') });

type GenerateFn = typeof generate;

async function grade(assertion: z.infer<typeof assertionSchema>, output: string, generateFn: GenerateFn): Promise<AssertionResult> {
  const lower = output.toLowerCase();
  switch (assertion.kind) {
    case 'contains': {
      const pass = lower.includes(assertion.value.toLowerCase());
      return { kind: assertion.kind, value: assertion.value, pass, detail: pass ? 'found' : 'not found in output' };
    }
    case 'not_contains': {
      const pass = !lower.includes(assertion.value.toLowerCase());
      return { kind: assertion.kind, value: assertion.value, pass, detail: pass ? 'absent as required' : 'present but should be absent' };
    }
    case 'regex': {
      try {
        const re = new RegExp(assertion.value, 'i');
        const pass = re.test(output);
        return { kind: assertion.kind, value: assertion.value, pass, detail: pass ? 'matched' : 'no match' };
      } catch {
        return { kind: assertion.kind, value: assertion.value, pass: false, detail: 'invalid regex' };
      }
    }
    case 'max_words': {
      const max = Number(assertion.value);
      const words = output.trim().split(/\s+/).filter(Boolean).length;
      const pass = Number.isFinite(max) && words <= max;
      return { kind: assertion.kind, value: assertion.value, pass, detail: `${words} words (max ${max})` };
    }
    case 'judge': {
      try {
        const res = await generateFn('judge', 'small', {
          systemPrompt: 'You judge whether an output satisfies a criterion. Respond with ONLY JSON: {"pass":true|false,"reason":"<one line>"}',
          messages: [{ role: 'user', content: `Criterion: ${assertion.value}\n\nOutput:\n${output}` }],
          maxTokens: 200,
          temperature: 0,
          responseFormat: 'json',
        });
        const parsed = judgeReplySchema.parse(extractJson(res.content));
        return { kind: assertion.kind, value: assertion.value, pass: parsed.pass, detail: parsed.reason || (parsed.pass ? 'satisfied' : 'not satisfied') };
      } catch (error) {
        logger.warn({ type: 'prompttest:judge_error', reason: error instanceof Error ? error.message : String(error) });
        return { kind: assertion.kind, value: assertion.value, pass: false, detail: 'judge unavailable' };
      }
    }
  }
}

export async function runPromptTests(prompt: string, cases: TestCase[], generateFn: GenerateFn = generate): Promise<RunResult> {
  const results: CaseResult[] = [];
  for (const testCase of cases) {
    const filled = fillVars(prompt, testCase.var_values);
    let output = '';
    try {
      const res = await generateFn('drafting', 'large', {
        systemPrompt: 'Execute this prompt and return only its output.',
        messages: [{ role: 'user', content: filled }],
        maxTokens: 1_000,
        temperature: 0.4,
      });
      output = res.content.trim();
    } catch (error) {
      logger.warn({ type: 'prompttest:exec_error', reason: error instanceof Error ? error.message : String(error) });
    }
    const assertions: AssertionResult[] = [];
    for (const a of testCase.assertions) assertions.push(await grade(a, output, generateFn));
    results.push({ name: testCase.name, pass: assertions.every((a) => a.pass), output, assertions });
  }
  const passRate = results.length ? Math.round((results.filter((r) => r.pass).length / results.length) * 100) : 0;
  return { results, pass_rate: passRate };
}
