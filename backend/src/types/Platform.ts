import { z } from 'zod';

/** Platform Registry entry — spec §5.1; seeded from config/platform-registry.json. */
export const platformSchema = z.object({
  platform_id: z.string(),
  display_name: z.string(),
  modalities: z.array(z.enum(['text', 'image', 'video', 'code'])),
  url_patterns: z.array(z.string()),
  dom_fingerprint_selectors: z.array(z.string()),
  input_selector_candidates: z.array(z.string()),
  docs_url: z.string().url(),
  quirks: z.array(z.string()),
  syntax_rules: z.array(z.string()),
  max_prompt_tokens: z.number().int().positive(),
  tos_reviewed: z.boolean(),
});
export type Platform = z.infer<typeof platformSchema>;

export const platformRegistrySchema = z.object({
  schema_version: z.string(),
  last_verified: z.string(),
  note: z.string().optional(),
  platforms: z.array(platformSchema),
});
export type PlatformRegistry = z.infer<typeof platformRegistrySchema>;
