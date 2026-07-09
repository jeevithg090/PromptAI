import { z } from 'zod';

/**
 * Environment configuration — spec §32.3 (configuration over code).
 * Everything tunable lives here or in a config file, never hardcoded.
 * Secrets are optional at load time so the skeleton runs locally before
 * cloud accounts exist (T1.2); routes that need a missing secret return 503.
 */

/** Treats an empty-string env value the same as "unset" (shell .env files can't express undefined). */
function optional<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((v) => (v === '' ? undefined : v), schema.optional());
}

const boolString = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Supabase (consumer project) — filled in task T1.2
  SUPABASE_URL: optional(z.string().url()),
  SUPABASE_ANON_KEY: optional(z.string()),
  SUPABASE_SERVICE_ROLE_KEY: optional(z.string()),
  SUPABASE_JWKS_URL: optional(z.string().url()),
  SUPABASE_JWT_SECRET: optional(z.string()),
  DATABASE_URL: optional(z.string()),

  // Default model provider — OpenCode Zen (§9.1–9.3, §7.3). OpenAI-compatible
  // chat/completions endpoint fronting several vendors' models; default
  // routing table (config/model-routing.json) currently points at DeepSeek
  // V4 Flash/Pro. Key from https://opencode.ai/auth.
  OPENCODE_API_KEY: optional(z.string()),
  OPENCODE_BASE_URL: z.preprocess(
    (v) => (v === '' || v === undefined ? 'https://opencode.ai/zen/v1' : v),
    z.string().url()
  ),
  MODEL_ROUTING_PATH: optional(z.string()),

  // Groq — default chat provider as of 2026-07-07 (switched from OpenCode
  // Zen/DeepSeek: reasoning-model latency was ~20-30s/call; Groq hosts
  // non-reasoning open-weight models at 500+ tok/s). Free key from
  // https://console.groq.com — no card required.
  GROQ_API_KEY: optional(z.string()),
  GROQ_BASE_URL: z.preprocess(
    (v) => (v === '' || v === undefined ? 'https://api.groq.com/openai/v1' : v),
    z.string().url()
  ),

  // Cerebras — alternate route (§9.1), even faster than Groq but free tier
  // caps context at 8,192 tokens. Free key from https://cloud.cerebras.ai.
  CEREBRAS_API_KEY: optional(z.string()),
  CEREBRAS_BASE_URL: z.preprocess(
    (v) => (v === '' || v === undefined ? 'https://api.cerebras.ai/v1' : v),
    z.string().url()
  ),

  // Embeddings provider — Google Gemini (§6 PKB; OpenCode Zen has no
  // embeddings endpoint). Free-tier key from https://aistudio.google.com.
  GEMINI_API_KEY: optional(z.string()),

  // Cloudflare — R2 (encrypted blobs/media, §19/§14) + KV (registry edge cache, §5.1).
  // Not consumed yet: R2/KV client wiring lands in T5.5 (registry cache) and T7.1 (blobs).
  CLOUDFLARE_ACCOUNT_ID: optional(z.string()),
  CLOUDFLARE_API_TOKEN: optional(z.string()),
  CLOUDFLARE_R2_BUCKET: optional(z.string()),
  CLOUDFLARE_R2_ACCESS_KEY_ID: optional(z.string()),
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: optional(z.string()),
  CLOUDFLARE_R2_ENDPOINT: optional(z.string().url()),
  CLOUDFLARE_KV_NAMESPACE_ID: optional(z.string()),

  // Behavior config
  LOG_LEVEL: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['debug', 'info', 'warn', 'error']).default('info')),
  MAX_TOKENS_PER_SESSION: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().default(10000)),
  CONTENT_SAFETY_ENABLED: z.preprocess((v) => (v === '' ? undefined : v), boolString.default('true')),
  CLARIFY_MAX_QUESTIONS: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().int().min(1).max(8).default(4)),
  CRITIC_MAX_REFINEMENTS: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().int().min(1).max(2).default(2)), // hard cap, §10.4
  RATE_LIMIT_REQUESTS_PER_MINUTE: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().default(30)),
  BUDGET_ENFORCEMENT_ENABLED: z.preprocess((v) => (v === '' ? undefined : v), boolString.default('true')),

  // Local dev
  PORT: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().default(3001)),
  DEV_AUTH_BYPASS: z.preprocess((v) => (v === '' ? undefined : v), boolString.default('false')),
  PLATFORM_REGISTRY_PATH: optional(z.string()),
  CLARIFICATION_QUESTIONS_PATH: optional(z.string()),
  STRATEGY_PROFILES_PATH: optional(z.string()),
  MODEL_CAPABILITIES_PATH: optional(z.string()),
});

export type Env = z.infer<typeof envSchema>;

export const config: Env = envSchema.parse(process.env);

// DEV_AUTH_BYPASS must never survive into production (§19, §27.2).
if (config.NODE_ENV === 'production' && config.DEV_AUTH_BYPASS) {
  throw new Error('DEV_AUTH_BYPASS=true is refused in production');
}
