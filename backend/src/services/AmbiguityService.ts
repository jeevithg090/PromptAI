import { z } from 'zod';
import { generate } from './providers';
import { extractJson } from '../utils/json';
import { PKBService, loadSeedChunksByPlatform } from './PKBService';
import { logger } from '../utils/logger';
import type { Platform } from '../types/Platform';

/**
 * Ambiguity Heatmap (V2.7) — a model's-eye view of a prompt. Finds spans that
 * a model is likely to misread (ambiguous, conflicting, likely-ignored,
 * underspecified), each with a reason and a suggested fix. Char offsets are
 * VALIDATED server-side against the actual string; spans that don't match are
 * dropped rather than surfaced, so "Apply fix" always targets real text.
 */
const RISKS = ['ambiguous', 'conflicting', 'likely_ignored', 'underspecified'] as const;

const findingSchema = z.object({
  text: z.string().min(1),
  risk: z.enum(RISKS),
  reason: z.string().min(1),
  fix: z.string().min(1),
});
const ambiguityReplySchema = z.object({ findings: z.array(findingSchema).max(12) });

export interface AmbiguityFinding {
  start: number;
  end: number;
  text: string;
  risk: (typeof RISKS)[number];
  reason: string;
  fix: string;
}

export interface AmbiguityResult {
  findings: AmbiguityFinding[];
  counts: Record<string, number>;
}

export interface AmbiguityInput {
  assembled: string;
  platform: Platform;
}

type GenerateFn = typeof generate;

async function mpkbKnowledge(platform: Platform): Promise<string> {
  let chunks;
  try {
    chunks = await new PKBService().listByPlatform(platform.platform_id, 5);
    if (chunks.length === 0) chunks = loadSeedChunksByPlatform(platform.platform_id, 5);
  } catch {
    chunks = loadSeedChunksByPlatform(platform.platform_id, 5);
  }
  return chunks.length ? chunks.map((c) => `- ${c.content}`).join('\n') : '(no platform knowledge)';
}

export async function analyzeAmbiguity(input: AmbiguityInput, generateFn: GenerateFn = generate): Promise<AmbiguityResult> {
  const knowledge = await mpkbKnowledge(input.platform);
  const systemPrompt = `You analyze prompts for "${input.platform.display_name}" the way its MODEL would read them — flagging spans a model is likely to misread.

PLATFORM QUIRKS + KNOWLEDGE:
${input.platform.quirks.map((q) => `- ${q}`).join('\n')}
${knowledge}

For each risky span, return the EXACT substring (copy it verbatim from the prompt), its risk class (ambiguous | conflicting | likely_ignored | underspecified), a one-line reason, and a concrete fix. Max 12 findings. Prefer the most impactful.

Respond with ONLY JSON:
{"findings":[{"text":"<exact substring from the prompt>","risk":"ambiguous|conflicting|likely_ignored|underspecified","reason":"<why a model misreads it>","fix":"<how to rewrite it>"}]}`;

  const MAX_ATTEMPTS = 2;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await generateFn('ambiguity', 'large', {
        systemPrompt,
        messages: [{ role: 'user', content: `Prompt:\n${input.assembled}` }],
        maxTokens: 2_000,
        temperature: 0.2,
        responseFormat: 'json',
      });
      const parsed = ambiguityReplySchema.parse(extractJson(res.content));

      // Validate every span against the real string; drop non-matching ones.
      const findings: AmbiguityFinding[] = [];
      const counts: Record<string, number> = {};
      for (const f of parsed.findings) {
        const start = input.assembled.indexOf(f.text);
        if (start === -1) continue; // hallucinated span — drop it
        findings.push({ start, end: start + f.text.length, text: f.text, risk: f.risk, reason: f.reason, fix: f.fix });
        counts[f.risk] = (counts[f.risk] ?? 0) + 1;
      }
      return { findings, counts };
    } catch (error) {
      logger.warn({ type: 'ambiguity:attempt_failed', attempt, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  throw new Error('ambiguity analysis failed after retries');
}
