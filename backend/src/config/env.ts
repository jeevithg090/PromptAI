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
  // Also powers the native chat adapter (provider 'gemini') and GroundingService.
  GEMINI_API_KEY: optional(z.string()),

  // Thinking-token budget for the native Gemini chat adapter. 0 = thinking off
  // (deterministic, low-latency JSON — the default). Raise for reasoning-heavy
  // steps. Applies only to provider 'gemini' (finalplan §A1).
  GEMINI_THINKING_BUDGET: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().int().min(0).default(0)),

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
  VISUAL_PREVIEW_ENABLED: z.preprocess((v) => (v === '' ? undefined : v), boolString.default('false')),

  // Postgres pool size (§23.4). Default 10 suits a long-lived local/server
  // process fielding many concurrent requests; a Lambdalith should override to
  // a small value (e.g. DB_POOL_MAX=3 — one concurrent request per instance).
  DB_POOL_MAX: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().int().min(1).default(10)),

  // Load-testing seam (T3.7): force every generate() to the deterministic mock
  // adapter so load tests measure OUR system, not the provider's free-tier rate
  // limits. NEVER allowed in production — refused at startup below.
  PROVIDER_FORCE_MOCK: z.preprocess((v) => (v === '' ? undefined : v), boolString.default('false')),

  // Local dev
  PORT: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().default(3001)),
  DEV_AUTH_BYPASS: z.preprocess((v) => (v === '' ? undefined : v), boolString.default('false')),
  PLATFORM_REGISTRY_PATH: optional(z.string()),
  CLARIFICATION_QUESTIONS_PATH: optional(z.string()),
  STRATEGY_PROFILES_PATH: optional(z.string()),
  MODEL_CAPABILITIES_PATH: optional(z.string()),
  DEMO_EXAMPLES_PATH: optional(z.string()),
  LIBRARY_SEEDS_PATH: optional(z.string()),
  MODEL_PRICING_PATH: optional(z.string()),

  // CORS allowlist for web/extension origins — comma-separated (T4.1/T5.4).
  ALLOWED_ORIGINS: z.preprocess(
    (v) => (v === '' || v === undefined ? 'http://localhost:3000' : v),
    z.string()
  ),

  // Admin Control Plane (§21, T7.5) — shared secret for the physically
  // separate admin deployable. Sent as the `x-admin-key` header. Absent =
  // admin endpoints refuse (503). No decryption capability for user content
  // or BYOK keys exists in the admin service by construction.
  ADMIN_API_KEY: optional(z.string()),

  // Demo/try-it-now flow (T4.3).
  DEMO_ENABLED: z.preprocess((v) => (v === '' ? undefined : v), boolString.default('true')),
  DEMO_REQUESTS_PER_DAY: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().int().min(1).default(5)),

  // Voice dictation / STT (F1.3). Groq Whisper is the backend fallback; the key
  // is GROQ_API_KEY (already configured). Default daily cap is a per-user abuse
  // control; plans may raise it (PlanService).
  STT_ENABLED: z.preprocess((v) => (v === '' ? undefined : v), boolString.default('true')),
  STT_REQUESTS_PER_DAY: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().int().min(1).default(50)),

  // Share links (F2.4).
  SHARE_REQUESTS_PER_DAY: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().int().min(1).default(20)),
  SHARE_BASE_URL: z.preprocess((v) => (v === '' || v === undefined ? 'http://localhost:3000' : v), z.string().url()),

  // A/B compare (F2.5).
  COMPARE_REQUESTS_PER_DAY: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().int().min(1).default(5)),

  // PKB retrieval (T5.2).
  PKB_MIN_SIMILARITY: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().min(0).max(1).default(0.45)),
  LIVE_FETCH_ENABLED: z.preprocess((v) => (v === '' ? undefined : v), boolString.default('true')),

  // T7.7 — Plan definitions path (§28.2).
  PLANS_PATH: optional(z.string()),

  // T7.7 — Stripe (§28.2, §19.1 — card data never touches our servers).
  STRIPE_SECRET_KEY: optional(z.string()),
  STRIPE_WEBHOOK_SECRET: optional(z.string()),
  STRIPE_PRICE_PRO: optional(z.string()),
  STRIPE_SUCCESS_URL: optional(z.string()),
  STRIPE_CANCEL_URL: optional(z.string()),
});

export type Env = z.infer<typeof envSchema>;

export const config: Env = envSchema.parse(process.env);

// DEV_AUTH_BYPASS must never survive into production (§19, §27.2).
if (config.NODE_ENV === 'production' && config.DEV_AUTH_BYPASS) {
  throw new Error('DEV_AUTH_BYPASS=true is refused in production');
}

// PROVIDER_FORCE_MOCK is a load-testing seam only — it must never serve real
// traffic (it returns canned drafts). Fail closed in production (T3.7).
if (config.NODE_ENV === 'production' && config.PROVIDER_FORCE_MOCK) {
  throw new Error('PROVIDER_FORCE_MOCK=true is refused in production');
}
