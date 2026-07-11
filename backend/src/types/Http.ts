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

/** POST /draft */
export const draftBodySchema = z.object({
  platform_id: z.string().min(1).max(100),
  idea: z.string().min(1).max(IDEA_MAX),
  just_generate: z.boolean().optional(),
  connection_id: z.string().uuid().optional(),
  project_id: z.string().uuid().optional(),
  memories: z.array(z.string().max(500)).max(5).optional(),
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
});
export type ClarifyBody = z.infer<typeof clarifyBodySchema>;

/** POST /demo/draft */
export const demoDraftBodySchema = z.object({
  example_id: z.string().min(1).max(100),
});

/** POST /serialize */
export const serializeBodySchema = z.object({
  platform_id: z.string().min(1).max(100),
  nodes: z.array(z.any()).min(1),
});

/** POST /redraft-node */
export const redraftNodeBodySchema = z.object({
  platform_id: z.string().min(1).max(100),
  task_type: z.string().min(1).max(50),
  nodes: z.array(z.any()).min(1),
  target_node_type: z.string().min(1).max(50),
  instruction: z.string().max(1000).optional(),
});

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
