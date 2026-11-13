import { z } from 'zod';

/**
 * Account, consent, memory, library and reporting (blueprint §8 Consent, §10,
 * §12 Auth, §13). Routes live under /v1/me/* unless noted.
 */

/** POST /v1/guest: a device-bound guest session after an ALTCHA proof of work (no memory, small daily quota). */
export const guestTokenRequestSchema = z.object({ altcha: z.string().min(1).max(4_000) });
export const guestTokenResponseSchema = z.object({
  token: z.string(),
  expiresAt: z.iso.datetime(),
  quota: z.object({ forgesPerDay: z.number().int().nonnegative(), dictationMinutesPerDay: z.number().int().nonnegative() }),
});

/** POST /v1/me/age: the neutral date-of-birth screen. The server stores only whether the user is 18 or over, never the date. */
export const ageGateRequestSchema = z.object({ dob: z.iso.date() });
export const ageGateResponseSchema = z.object({ ageConfirmed: z.boolean() });

/** Consent purposes (blueprint §8, §12). "Personalize for me" is part of the service and can be paused; the rest are asked with nothing preselected. */
export const consentPurposeSchema = z.enum([
  'personalize',
  'improve_defaults',
  'cloud_asr',
  'llm_processing',
  'page_context',
  'train_models',
]);
export type ConsentPurpose = z.infer<typeof consentPurposeSchema>;

/** One ledger entry. The ledger is append-only; the latest entry per purpose wins. */
export const consentEntrySchema = z.object({
  purpose: consentPurposeSchema,
  granted: z.boolean(),
  /** Version of the consent text the user saw. */
  version: z.string().min(1).max(32),
  at: z.iso.datetime(),
});
export type ConsentEntry = z.infer<typeof consentEntrySchema>;

/** PUT /v1/me/consent */
export const consentUpdateSchema = z.object({
  entries: z.array(consentEntrySchema.omit({ at: true })).min(1).max(consentPurposeSchema.options.length),
});

/** GET /v1/me */
export const profileSchema = z.object({
  id: z.uuid(),
  kind: z.enum(['guest', 'account']),
  ageConfirmed: z.boolean(),
  handle: z.string().max(64).nullable(),
  consents: z.array(consentEntrySchema),
  createdAt: z.iso.datetime(),
});
export type Profile = z.infer<typeof profileSchema>;

/** /v1/me/memory: text memories (blueprint §10). Slot-mappable preferences live in L1 counts instead. */
export const memoryItemSchema = z.object({
  id: z.uuid(),
  kind: z.enum(['profile', 'preference', 'rule', 'fact', 'goal', 'vocabulary']),
  scope: z.enum(['global', 'tool', 'project']),
  /** The tool id or project id for a scoped memory. */
  scopeRef: z.string().max(100).nullable(),
  sensitivity: z.enum(['normal', 'sensitive', 'special']),
  status: z.enum(['active', 'proposed', 'archived']),
  text: z.string().min(1).max(500),
  source: z.enum(['user', 'proposal']),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type MemoryItem = z.infer<typeof memoryItemSchema>;
export const memoryItemCreateSchema = memoryItemSchema.pick({ kind: true, scope: true, scopeRef: true, sensitivity: true, text: true });
export const memoryItemUpdateSchema = memoryItemCreateSchema.partial().extend({ status: memoryItemSchema.shape.status.optional() });

/** /v1/me/library: saved briefs and recipes (`artifacts` with immutable versions). Private by default. */
export const artifactSchema = z.object({
  id: z.uuid(),
  kind: z.enum(['brief', 'recipe']),
  toolId: z.string().max(100),
  title: z.string().min(1).max(200),
  body: z.string().max(20_000),
  version: z.number().int().positive(),
  visibility: z.enum(['private']),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Artifact = z.infer<typeof artifactSchema>;
export const artifactCreateSchema = artifactSchema.pick({ kind: true, toolId: true, title: true, body: true });
export const artifactUpdateSchema = artifactCreateSchema.partial();

/** POST /v1/report: "Report this output" on any generated artifact (blueprint §13, Apple 1.2). Content-free beyond an optional short note. */
export const reportReasonSchema = z.enum(['wrong_or_harmful', 'illegal', 'child_safety', 'harassment', 'sexual', 'privacy', 'copyright', 'spam', 'other']);
export const reportRequestSchema = z
  .object({
    decisionId: z.uuid().optional(),
    artifactId: z.uuid().optional(),
    reason: reportReasonSchema,
    note: z.string().max(500).optional(),
  })
  .refine((r) => r.decisionId !== undefined || r.artifactId !== undefined, { message: 'decisionId or artifactId is required' });

/** GET /v1/me/export: everything the server holds about the user. */
export const exportSchema = z.object({
  profile: profileSchema,
  memory: z.array(memoryItemSchema),
  library: z.array(artifactSchema),
  exportedAt: z.iso.datetime(),
});
