import { z } from 'zod';
import { generate } from '../services/providers';
import { extractJson } from '../utils/json';
import { logger } from '../utils/logger';
import type { FetchedPage } from '../services/DocFetchService';
import type { Platform } from '../types/Platform';
import type { KnowledgeChunk } from '../types/Agent';

/**
 * Platform Profile Agent (V1.1): turns fetched documentation text into a
 * registry-shaped platform profile + PKB-style knowledge chunks, so ANY
 * platform with public docs can be prompted for — not just the 9 curated
 * ones. Large tier (real comprehension work), retry-once, honest failure.
 */
const profileSchema = z.object({
  display_name: z.string().min(1).max(80),
  modalities: z.array(z.enum(['text', 'image', 'video', 'code', 'audio'])).min(1),
  syntax_rules: z.array(z.string().min(1)).min(1).max(10),
  quirks: z.array(z.string().min(1)).max(10).default([]),
  max_prompt_tokens: z.number().int().positive().max(2_000_000).default(4000),
  example_prompts: z.array(z.string()).max(4).default([]),
  modes: z
    .array(
      z.object({
        mode_id: z.string(),
        name: z.string(),
        best_for: z.array(z.string()).default([]),
        avoid_for: z.array(z.string()).default([]),
        notes: z.string().default(''),
      })
    )
    .max(8)
    .default([]),
  chunks: z
    .array(
      z.object({
        content: z.string().min(20).max(2_000),
        source_url: z.string(),
      })
    )
    .min(3)
    .max(10),
});
export type PlatformProfile = z.infer<typeof profileSchema>;

export interface CustomPlatformResult {
  platform: Platform;
  chunks: KnowledgeChunk[];
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'platform';
}

type GenerateFn = typeof generate;

export class PlatformProfileAgent {
  name = 'PlatformProfileAgent';

  constructor(private readonly generateFn: GenerateFn = generate) {}

  async profile(pages: FetchedPage[], nameHint?: string): Promise<CustomPlatformResult> {
    const corpus = pages
      .map((p) => `=== ${p.url} ===\n${p.text.slice(0, 30_000)}`)
      .join('\n\n')
      // Cap ~40K chars (~10K tokens). Keeps a single profiling call — plus its
      // ~2.5K output tokens — comfortably under Groq's 12K TPM free-tier cap,
      // so even a retry can't blow the per-minute window (V1.1 rate-limit fix).
      .slice(0, 40_000);

    const systemPrompt = `You are a platform analyst. From the documentation text provided, profile how one prompts THIS AI platform/tool.
${nameHint ? `The user calls it "${nameHint}".` : ''}
Extract ONLY what the docs support — never invent capabilities. If the docs don't state a practical prompt length, default max_prompt_tokens to 4000.

Respond with ONLY a JSON object:
{"display_name":"<product name>",
 "modalities":["text"|"image"|"video"|"code"|"audio", …],
 "syntax_rules":["<how prompts should be written for it — concrete, actionable>", … 3-8 items],
 "quirks":["<gotchas/behaviors worth knowing>", … 0-6 items],
 "max_prompt_tokens": <int>,
 "example_prompts":["<short example from or faithful to the docs>", … 0-3],
 "modes":[{"mode_id":"<slug>","name":"<mode/model name>","best_for":["<tag>"],"avoid_for":[],"notes":"<one sentence>"} … only if the docs name distinct modes/models],
 "chunks":[{"content":"<a self-contained prompting lesson from the docs, 1-3 sentences>","source_url":"<the page it came from>"} … 5-10 items]}`;

    const MAX_ATTEMPTS = 2;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await this.generateFn('platform_profile', 'large', {
          systemPrompt,
          messages: [{ role: 'user', content: `Documentation corpus:\n\n${corpus}` }],
          maxTokens: 2_500,
          temperature: 0.3,
          responseFormat: 'json',
        });
        const parsed = profileSchema.parse(extractJson(res.content));
        const platformId = `custom:${slugify(nameHint ?? parsed.display_name)}`;
        const sourceUrls = new Set(pages.map((p) => p.url));

        const platform: Platform = {
          platform_id: platformId,
          display_name: parsed.display_name,
          modalities: parsed.modalities,
          url_patterns: [],
          dom_fingerprint_selectors: [],
          input_selector_candidates: [],
          docs_url: pages[0]!.url,
          quirks: parsed.quirks,
          syntax_rules: parsed.syntax_rules,
          max_prompt_tokens: parsed.max_prompt_tokens,
          tos_reviewed: false,
          modes: parsed.modes.map((m) => ({ ...m, aliases: [], docs_url: undefined })),
        };

        const chunks: KnowledgeChunk[] = parsed.chunks.map((chunk, i) => ({
          id: `${platformId}-chunk-${i}`,
          kind: 'pkb',
          platformId,
          content: chunk.content,
          // The model sometimes hallucinates URLs — only keep ones we actually fetched.
          sourceUrl: sourceUrls.has(chunk.source_url) ? chunk.source_url : pages[0]!.url,
          ingestedAt: new Date().toISOString(),
          trustScore: 0.7,
        }));

        return { platform, chunks };
      } catch (error) {
        logger.warn({
          type: 'platform_profile:attempt_failed',
          attempt,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
    throw new Error('platform profiling failed after retries');
  }
}
