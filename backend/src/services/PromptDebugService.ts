import { z } from 'zod';
import { generate } from './providers';
import { extractJson } from '../utils/json';
import { NODE_TYPES } from '../types/Prompt';
import { logger } from '../utils/logger';

/**
 * Prompt Debugger (V2.1) — the most common real-world loop: "I ran this
 * prompt, the output was wrong, now what?". Given the prompt, the bad output,
 * and what was expected, diagnose node-level faults with QUOTED evidence from
 * the bad output, then produce a patched prompt. LLM-backed, retry-once,
 * honest failure. New routing step `debug` (large tier).
 */
const SEVERITIES = ['high', 'medium', 'low'] as const;

const debugResultSchema = z.object({
  diagnosis: z
    .array(
      z.object({
        node_type: z.string().max(50), // a NODE_TYPES value or '(missing)'
        fault: z.string().min(1),
        /** A short quote from the ACTUAL output showing the symptom. */
        evidence: z.string().default(''),
        severity: z.enum(SEVERITIES),
      })
    )
    .max(12),
  patched_nodes: z
    .array(
      z.object({
        type: z.enum(NODE_TYPES),
        value: z.string().min(1),
        rationale: z.string().default(''),
        alternatives: z.array(z.any()).max(4).default([]),
      })
    )
    .min(1),
  patch_summary: z.string().min(1),
});
export type PromptDebugResult = z.infer<typeof debugResultSchema>;

export interface PromptDebugInput {
  prompt: string;
  actualOutput: string;
  expected: string;
  platformName?: string;
}

type GenerateFn = typeof generate;

export async function debugPrompt(input: PromptDebugInput, generateFn: GenerateFn = generate): Promise<PromptDebugResult> {
  const systemPrompt = `You are a prompt-debugging expert. The user ran a prompt${input.platformName ? ` on ${input.platformName}` : ''}, got an output they didn't want, and told you what they expected. Diagnose WHY the prompt produced that output, then patch the prompt.

Rules:
- Every diagnosis item must point at the responsible part of the prompt (a node type from: ${NODE_TYPES.join(', ')}, or "(missing)" when the fault is something the prompt failed to say).
- Ground each fault in EVIDENCE: a short quote from the ACTUAL output that shows the symptom. Never invent evidence.
- Rate severity high/medium/low by how much it caused the gap from expected.
- Then produce patched_nodes: the corrected prompt as a full node set that would fix the diagnosed faults.

Respond with ONLY JSON:
{"diagnosis":[{"node_type":"<node type or (missing)>","fault":"<what's wrong>","evidence":"<short quote from the actual output>","severity":"high|medium|low"}],"patched_nodes":[{"type":"<node type>","value":"<corrected text>","rationale":"<why this fixes it>","alternatives":[]}],"patch_summary":"<one sentence on what you changed>"}`;

  const userMessage = `PROMPT:\n${input.prompt}\n\nACTUAL OUTPUT (the wrong result):\n${input.actualOutput}\n\nEXPECTED (what the user wanted):\n${input.expected}`;

  const MAX_ATTEMPTS = 2;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await generateFn('debug', 'large', {
        systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
        maxTokens: 2_500,
        temperature: 0.2,
        responseFormat: 'json',
      });
      return debugResultSchema.parse(extractJson(res.content));
    } catch (error) {
      logger.warn({ type: 'debug:attempt_failed', attempt, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  throw new Error('prompt debug failed after retries');
}
