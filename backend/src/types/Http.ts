import { z } from 'zod';

/** Hono context variable bindings shared across handlers/middleware. */
export interface AppEnv {
  Variables: {
    userId: string;
    /** Email claim from the JWT (name/email are the only plaintext PII, §19.1); null when absent. */
    email: string | null;
  };
}

/**
 * Request body schemas (§27, T3.8 security review). Every mutating route
 * validates its body with Zod rather than hand-checking fields, so malformed
 * or oversized input is rejected with a 400 before touching the pipeline.
 * Length caps are a cheap abuse control (the token budget is the real one).
 */

const IDEA_MAX = 10_000; // generous for a rough idea; blocks multi-MB junk bodies

/**
 * Custom platform payload (V1.1) — a client-held platform profile produced by
 * POST /platforms/custom. The server is stateless about custom platforms: the
 * client stores the profile and sends it back with each request. Caps keep a
 * hostile payload from smuggling a huge context in.
 */
export const customPlatformSchema = z.object({
  platform: z.object({
    platform_id: z.string().regex(/^custom:[a-z0-9-]{1,40}$/),
    display_name: z.string().min(1).max(80),
    modalities: z.array(z.enum(['text', 'image', 'video', 'code', 'audio'])).min(1),
    url_patterns: z.array(z.string()).default([]),
    dom_fingerprint_selectors: z.array(z.string()).default([]),
    input_selector_candidates: z.array(z.string()).default([]),
    docs_url: z.string().url(),
    quirks: z.array(z.string().max(500)).max(10),
    syntax_rules: z.array(z.string().max(500)).min(1).max(10),
    max_prompt_tokens: z.number().int().positive().max(2_000_000),
    tos_reviewed: z.boolean().default(false),
    modes: z.array(z.any()).max(8).default([]),
  }),
  chunks: z
    .array(
      z.object({
        id: z.string().max(100),
        kind: z.literal('pkb').default('pkb'),
        platformId: z.string().max(100).optional(),
        content: z.string().min(1).max(2_000),
        sourceUrl: z.string().max(500),
        ingestedAt: z.string().max(40).default(''),
        trustScore: z.number().min(0).max(1).default(0.7),
      })
    )
    .max(40)
    .default([]),
});
export type CustomPlatformPayload = z.infer<typeof customPlatformSchema>;

/** POST /platforms/custom (V1.1) */
export const customPlatformRequestSchema = z.object({
  docs_url: z.string().min(8).max(500),
  name: z.string().max(80).optional(),
});

/** POST /draft */
export const draftBodySchema = z.object({
  platform_id: z.string().min(1).max(100),
  idea: z.string().min(1).max(IDEA_MAX),
  just_generate: z.boolean().optional(),
  connection_id: z.string().uuid().optional(),
  project_id: z.string().uuid().optional(),
  memories: z.array(z.string().max(500)).max(5).optional(),
  custom_platform: customPlatformSchema.optional(),
});
export type DraftBody = z.infer<typeof draftBodySchema>;

/** POST /draft/:sessionId/clarify */
export const clarifyBodySchema = z.object({
  platform_id: z.string().min(1).max(100),
  idea: z.string().min(1).max(IDEA_MAX),
  clarifications: z.record(z.string().max(200), z.string().max(2_000)).optional(),
  just_generate: z.boolean().optional(),
  connection_id: z.string().uuid().optional(),
  project_id: z.string().uuid().optional(),
  memories: z.array(z.string().max(500)).max(5).optional(),
  custom_platform: customPlatformSchema.optional(),
});
export type ClarifyBody = z.infer<typeof clarifyBodySchema>;

/** POST /enhance (F1.1) — improve a finished prompt the user already has. */
export const enhanceBodySchema = z.object({
  // platform is optional: if omitted we enhance against a generic conversational
  // target and surface the import agent's platform_hint for a targeted re-run.
  platform_id: z.string().min(1).max(100).optional(),
  text: z.string().min(10).max(8_000),
  connection_id: z.string().uuid().optional(),
});
export type EnhanceBody = z.infer<typeof enhanceBodySchema>;

/** POST /compare (F2.5) — A/B two prompts through the user's BYOK provider. */
export const compareBodySchema = z.object({
  platform_id: z.string().min(1).max(100),
  prompt_a: z.string().min(1).max(8_000),
  prompt_b: z.string().min(1).max(8_000),
  connection_id: z.string().uuid().optional(),
});
export type CompareBody = z.infer<typeof compareBodySchema>;

/** POST /demo/draft */
export const demoDraftBodySchema = z.object({
  example_id: z.string().min(1).max(100),
});

/** POST /serialize */
export const serializeBodySchema = z.object({
  platform_id: z.string().min(1).max(100),
  nodes: z.array(z.any()).min(1),
  custom_platform: customPlatformSchema.optional(),
});

/** POST /redraft-node */
export const redraftNodeBodySchema = z.object({
  platform_id: z.string().min(1).max(100),
  task_type: z.string().min(1).max(50),
  nodes: z.array(z.any()).min(1),
  target_node_type: z.string().min(1).max(50),
  instruction: z.string().max(1000).optional(),
});

/** POST /debug (V2.1) — diagnose why a prompt produced the wrong output. */
export const debugBodySchema = z.object({
  prompt: z.string().min(1).max(10_000),
  actual_output: z.string().min(1).max(10_000),
  expected: z.string().min(1).max(4_000),
  platform_id: z.string().min(1).max(100).optional(),
});

/** POST /reverse (V2.2) — infer a prompt from an example output. */
export const reverseBodySchema = z.object({
  output: z.string().min(1).max(10_000),
  platform_id: z.string().min(1).max(100),
});

/** POST /migrate (V2.4) — port a prompt's nodes from one platform to another. */
export const migrateBodySchema = z.object({
  nodes: z.array(z.any()).min(1),
  source_platform_id: z.string().min(1).max(100),
  target_platform_id: z.string().min(1).max(100),
});

/** POST /simulate (V2.6) — cost/token estimate across models. */
export const simulateBodySchema = z.object({
  assembled: z.string().min(1).max(20_000),
  expected_output_tokens: z.number().int().min(0).max(200_000).optional(),
});

/** POST /analyze/ambiguity (V2.7) — span-level ambiguity findings. */
export const ambiguityBodySchema = z.object({
  assembled: z.string().min(1).max(10_000),
  platform_id: z.string().min(1).max(100),
});

/** POST /lint (V2.8) — check a prompt against style-guide rules. */
export const lintBodySchema = z.object({
  assembled: z.string().min(1).max(10_000).optional(),
  nodes: z.array(z.any()).max(30).optional(),
  rules: z
    .array(
      z.object({
        kind: z.enum(['banned_term', 'required_term', 'max_length_tokens', 'tone', 'required_node']),
        value: z.string().max(500),
      })
    )
    .max(50)
    .default([]),
});

/** POST /workflows/run (V2.5) — run an inline workflow definition. */
export const workflowRunBodySchema = z.object({
  name: z.string().min(1).max(200).default('Untitled workflow'),
  steps: z.array(z.object({ name: z.string().min(1).max(120), prompt: z.string().min(1).max(10_000), output_var: z.string().min(1).max(60).regex(/^[a-zA-Z0-9_]+$/) })).min(1).max(8),
  inputs: z.record(z.string().max(60), z.string().max(4_000)).default({}),
});

/** POST /prompt-tests/run (V2.3) — run test cases against a prompt (stateless). */
export const promptTestsRunBodySchema = z.object({
  prompt: z.string().min(1).max(10_000),
  cases: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        var_values: z.record(z.string().max(60), z.string().max(4_000)).default({}),
        assertions: z.array(z.object({ kind: z.enum(['contains', 'not_contains', 'regex', 'max_words', 'judge']), value: z.string().min(1).max(1_000) })).min(1).max(10),
      })
    )
    .min(1)
    .max(20),
});

/** POST /chat-draft (V1.4) — chat-first drafting with optional file attachments. */
export const chatDraftBodySchema = z.object({
  platform_id: z.string().min(1).max(100),
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(4_000) })).min(1).max(40),
  attachments: z
    .array(z.object({ name: z.string().min(1).max(200), mime: z.string().max(100).default('text/plain'), text: z.string().min(1).max(50_000) }))
    .max(4)
    .optional(),
  nodes: z.array(z.any()).max(20).optional(),
  custom_platform: customPlatformSchema.optional(),
});
export type ChatDraftBody = z.infer<typeof chatDraftBodySchema>;

/** POST /recommend/mode (V1.2) */
export const recommendModeBodySchema = z.object({
  platform_id: z.string().min(1).max(100),
  task_type: z.string().min(1).max(50),
  idea: z.string().max(10_000).default(''),
});
export type RecommendModeBody = z.infer<typeof recommendModeBodySchema>;

/** POST /chat-refine */
export const chatRefineMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(2_000),
});
export const chatRefineBodySchema = z.object({
  platform_id: z.string().min(1).max(100),
  task_type: z.string().min(1).max(50),
  nodes: z.array(z.any()).default([]),
  messages: z.array(chatRefineMessageSchema).min(1).max(40),
  custom_platform: customPlatformSchema.optional(),
});
export type ChatRefineBody = z.infer<typeof chatRefineBodySchema>;

/** POST /draft/:sessionId/again */
export const againBodySchema = z.object({
  platform_id: z.string().min(1).max(100),
  idea: z.string().min(1).max(IDEA_MAX),
  carried_preferences: z.record(z.string().max(200), z.string().max(2_000)).default({}),
  connection_id: z.string().uuid().optional(),
});

/** POST /preview */
export const previewBodySchema = z.object({
  platform_id: z.string().min(1).max(100),
  task_type: z.string().min(1).max(50),
  known: z.record(z.string().max(200), z.string().max(2_000)).default({}),
  session_id: z.string().optional(),
});

/** POST /preview/visual */
export const previewVisualBodySchema = z.object({
  platform_id: z.string().min(1).max(100),
  assembled: z.string().min(1).max(10_000),
});

/** POST /fanout */
export const fanoutBodySchema = z.object({
  nodes: z.array(z.any()).min(1),
  platform_ids: z.array(z.string().min(1).max(100)).min(2).max(5),
});

/** POST /platform-requests */
export const platformRequestBodySchema = z.object({
  origin: z.string().min(1).max(500),
  note: z.string().max(2000).optional(),
});
export type PlatformRequestBody = z.infer<typeof platformRequestBodySchema>;

/** POST /teams */
export const createTeamBodySchema = z.object({
  name: z.string().min(1).max(200),
});
export type CreateTeamBody = z.infer<typeof createTeamBodySchema>;

/** POST /teams/:id/members */
export const addTeamMemberBodySchema = z.object({
  user_id: z.string().min(1),
  role: z.enum(['owner', 'editor', 'member']).default('member'),
});
export type AddTeamMemberBody = z.infer<typeof addTeamMemberBodySchema>;
