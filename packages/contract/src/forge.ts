import { z } from 'zod';

/** Where a slot's value came from (blueprint §6). Core sets 'said' only when the value is grounded in the user's words. */
export const slotSourceSchema = z.enum(['said', 'memory', 'count', 'default', 'inferred', 'captured']);
export type SlotSource = z.infer<typeof slotSourceSchema>;

/**
 * A filled-in slot the user didn't say, shown as a chip. A 'pick' must be
 * resolved before Insert; an 'assumption' can be flipped but needn't be.
 */
export const assumptionSchema = z.object({
  slotId: z.string().min(1),
  label: z.string().min(1),
  value: z.string(),
  source: slotSourceSchema,
  kind: z.enum(['assumption', 'pick']),
  options: z.array(z.string()).max(6),
});
export type Assumption = z.infer<typeof assumptionSchema>;

/** POST /v1/forge */
export const forgeRequestSchema = z.object({
  /** The cleaned transcript or typed ask. */
  text: z.string().trim().min(1).max(8_000),
  /** A tool id the client already resolved (regex or host app). */
  toolHint: z.string().max(100).optional(),
  /** Bundle id or name of the app the user is working in. */
  hostApp: z.string().max(200).optional(),
  /** BCP 47 locale of the speech or text. */
  locale: z.string().max(35).default('en'),
  /** Chip choices from a previous round: slotId -> value. */
  answers: z.record(z.string().max(100), z.string().max(2_000)).default({}),
});
export type ForgeRequest = z.input<typeof forgeRequestSchema>;
export type ForgeRequestParsed = z.output<typeof forgeRequestSchema>;

export const forgeResponseSchema = z.object({
  toolId: z.string(),
  toolName: z.string(),
  /** The finished brief to insert into the target tool. Never auto-submitted. */
  brief: z.string(),
  assumptions: z.array(assumptionSchema),
  /** Specifics in the brief (numbers, dates, names, URLs) that trace to nothing the user said. */
  unsourced: z.array(z.string()),
  /** How much of the card's checklist the brief covers. */
  coverage: z.object({ covered: z.number().int().nonnegative(), total: z.number().int().nonnegative() }),
  usage: z.object({ llmCalls: z.number().int().nonnegative(), ms: z.number().nonnegative() }),
});
export type ForgeResponse = z.infer<typeof forgeResponseSchema>;
