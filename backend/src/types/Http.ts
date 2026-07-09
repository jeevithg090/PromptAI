import { z } from 'zod';

/** Hono context variable bindings shared across handlers/middleware. */
export interface AppEnv {
  Variables: {
    userId: string;
  };
}

/**
 * Request body schemas (§27, T3.8 security review). Every mutating route
 * validates its body with Zod rather than hand-checking fields, so malformed
 * or oversized input is rejected with a 400 before touching the pipeline.
 * Length caps are a cheap abuse control (the token budget is the real one).
 */

const IDEA_MAX = 10_000; // generous for a rough idea; blocks multi-MB junk bodies

/** POST /draft */
export const draftBodySchema = z.object({
  platform_id: z.string().min(1).max(100),
  idea: z.string().min(1).max(IDEA_MAX),
  just_generate: z.boolean().optional(),
});
export type DraftBody = z.infer<typeof draftBodySchema>;

/** POST /draft/:sessionId/clarify */
export const clarifyBodySchema = z.object({
  platform_id: z.string().min(1).max(100),
  idea: z.string().min(1).max(IDEA_MAX),
  // Answers keyed by question id → free-text answer; cap each answer's length.
  clarifications: z.record(z.string().max(200), z.string().max(2_000)).optional(),
  just_generate: z.boolean().optional(),
});
export type ClarifyBody = z.infer<typeof clarifyBodySchema>;
