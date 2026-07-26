import { z } from 'zod';

/**
 * A platform "mode" — the user-facing model/setting choice within a platform
 * (Gemini Flash vs Pro vs Thinking, ChatGPT GPT-4o vs o3, Midjourney v7 vs
 * niji…). Curated from official docs in config/platform-registry.json (V1.2);
 * perishable data, refreshed by config edit, never hardcoded in logic.
 */
export const platformModeSchema = z.object({
  mode_id: z.string(),
  name: z.string(),
  aliases: z.array(z.string()).default([]),
  /** Task/keyword signals this mode is the right pick for (matched by recommendMode). */
  best_for: z.array(z.string()),
  /** Signals this mode is the wrong pick for. */
  avoid_for: z.array(z.string()).default([]),
  notes: z.string(),
  docs_url: z.string().url().optional(),
});
export type PlatformMode = z.infer<typeof platformModeSchema>;

/** Platform Registry entry — spec §5.1; seeded from config/platform-registry.json. */
export const platformSchema = z.object({
  platform_id: z.string(),
  display_name: z.string(),
  modalities: z.array(z.enum(['text', 'image', 'video', 'code', 'audio'])),
  url_patterns: z.array(z.string()),
  dom_fingerprint_selectors: z.array(z.string()),
  input_selector_candidates: z.array(z.string()),
  docs_url: z.string().url(),
  quirks: z.array(z.string()),
  syntax_rules: z.array(z.string()),
  max_prompt_tokens: z.number().int().positive(),
  tos_reviewed: z.boolean(),
  model_family: z.string().optional(),
  /** Doc-curated model/setting choices within the platform (V1.2). */
  modes: z.array(platformModeSchema).default([]),
});
export type Platform = z.infer<typeof platformSchema>;

export const platformRegistrySchema = z.object({
  schema_version: z.string(),
  last_verified: z.string(),
  note: z.string().optional(),
  platforms: z.array(platformSchema),
});
export type PlatformRegistry = z.infer<typeof platformRegistrySchema>;
