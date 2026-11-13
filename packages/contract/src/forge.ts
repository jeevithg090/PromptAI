import { z } from 'zod';

/** Where a slot's value came from (blueprint §6). Core sets 'said' only when the value is grounded in the user's words. */
export const slotSourceSchema = z.enum(['said', 'memory', 'count', 'default', 'inferred', 'captured']);
export type SlotSource = z.infer<typeof slotSourceSchema>;

/** The language context (blueprint §6): what was spoken, which script, and what to reply in. */
export const languageSchema = z.object({
  uiLocale: z.string().max(35).optional(),
  /** BCP 47 tags of the spoken languages, most dominant first (e.g. ['en-IN', 'hi']). */
  spoken: z.array(z.string().max(35)).min(1).max(4).default(['en']),
  /** ISO 15924 script of the input text, e.g. 'Latn' or 'Deva'. */
  script: z.string().max(8).optional(),
  /** Language the brief should be written in, when it differs from the speech. */
  replyLanguage: z.string().max(35).optional(),
  /** Language the target tool's output should be in, when it differs again. */
  targetLanguage: z.string().max(35).optional(),
});
export type Language = z.infer<typeof languageSchema>;

/**
 * The IntentFrame (blueprint §6): what `understand` returns. It replaces intent
 * classification and clarification; impact and options come from card data,
 * so the model returns only what it can know.
 */
export const intentFrameSchema = z.object({
  family: z.string().max(64),
  target: z.object({ toolId: z.string().max(100).nullable(), source: z.enum(['context', 'named', 'predicted', 'none']) }),
  goal: z.string().max(2_000),
  deliverable: z.string().max(500),
  successCriteria: z.array(z.string().max(300)).max(10),
  slots: z
    .array(
      z.object({
        id: z.string().max(100),
        value: z.string().max(2_000).nullable(),
        source: slotSourceSchema,
        confidence: z.enum(['low', 'med', 'high']),
      }),
    )
    .max(30),
  /** At most 5 things added for the user ("Covered for you"). */
  coveredForYou: z.array(z.object({ text: z.string().max(300), slotId: z.string().max(100).optional() })).max(5),
  /** Character ranges of low-confidence dictated words. */
  unsure: z.array(z.object({ start: z.number().int().nonnegative(), end: z.number().int().nonnegative() })).max(50),
  language: languageSchema,
  risk: z.enum(['none', 'sensitive', 'refuse']),
});
export type IntentFrame = z.infer<typeof intentFrameSchema>;

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
  surface: z.enum(['desktop', 'web', 'mcp']).default('web'),
  /** Redacted selection and field text from the capture target, when consented. */
  selection: z.string().max(8_000).optional(),
  fieldText: z.string().max(8_000).optional(),
  /** BCP 47 locale of the speech or text. Superseded by `language` when both are sent. */
  locale: z.string().max(35).default('en'),
  language: languageSchema.optional(),
  /** Chip choices from a previous round: slotId -> value. */
  answers: z.record(z.string().max(100), z.string().max(2_000)).default({}),
  /** Groups a draft and its redrafts for decision rows. */
  sessionId: z.uuid().optional(),
});
export type ForgeRequest = z.input<typeof forgeRequestSchema>;
export type ForgeRequestParsed = z.output<typeof forgeRequestSchema>;

/** One insertable field of the brief (a tool may have several, e.g. an issue's title and body). */
export const briefFieldSchema = z.object({ id: z.string().max(100), label: z.string().max(100), text: z.string() });

/** Something the checks found that the user should see (over a limit, an unsupported parameter, escaped tool syntax). */
export const forgeIssueSchema = z.object({
  code: z.string().max(64),
  message: z.string().max(500),
  severity: z.enum(['info', 'warn', 'block']),
});

export const forgeResponseSchema = z.object({
  toolId: z.string(),
  toolName: z.string(),
  /** The primary field: the text Insert pastes. Never auto-submitted. */
  brief: z.string(),
  /** Every insertable field, the primary one included. Empty means `brief` is the only field. */
  fields: z.array(briefFieldSchema).default([]),
  assumptions: z.array(assumptionSchema),
  /** Specifics in the brief (numbers, dates, names, URLs) that trace to nothing the user said. */
  unsourced: z.array(z.string()),
  issues: z.array(forgeIssueSchema).default([]),
  /**
   * How much of the card's checklist the brief covers. `items` is the coverage
   * map behind "Why this is better": what the user said, what PromptAI assumed,
   * and what is still missing. No extra model call produces it.
   */
  coverage: z.object({
    covered: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    items: z
      .array(z.object({ id: z.string().max(100), label: z.string().max(200), by: z.enum(['said', 'assumed', 'missing']) }))
      .default([]),
  }),
  cardVersion: z.string().max(64).optional(),
  /** The decision row this draft wrote; outcome events refer to it. */
  decisionId: z.uuid().optional(),
  usage: z.object({
    llmCalls: z.number().int().nonnegative(),
    ms: z.number().nonnegative(),
    tokensIn: z.number().int().nonnegative().optional(),
    tokensOut: z.number().int().nonnegative().optional(),
    costUsd: z.number().nonnegative().optional(),
  }),
});
export type ForgeResponse = z.input<typeof forgeResponseSchema>;
export type ForgeResponseParsed = z.output<typeof forgeResponseSchema>;
