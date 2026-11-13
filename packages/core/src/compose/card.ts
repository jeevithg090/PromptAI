/**
 * Render card schema — the data-only adapter for one target tool.
 * A card is YAML. It holds no code: templates are Liquid (sandboxed, no JS),
 * parameter rules are declarative, and vendor request schemas are JSON Schema.
 *
 * Ported from spikes/prompt-representation/src/card.ts. Added for forge():
 * `aliases`, `family`, `insert`, `syntax`, `slots`; a json field's vendor schema
 * is inline (`schema`) instead of a file path, because core does no I/O.
 */
import { z } from 'zod';
import YAML from 'yaml';

const Str = z.string().min(1);
const Scalar = z.union([z.string(), z.number(), z.boolean()]);
const FieldName = z.string().regex(/^[a-z][a-z0-9_]*$/);

export const ParamRuleSchema = z.object({
  /** lookup order; default ["params.<name>", "tool_params.<card id>.<name>"] */
  from: z.array(z.string().regex(/^(params|tool_params\.[a-z0-9_-]+|facets)\.[A-Za-z0-9_.-]+$/)).optional(),
  type: z.enum(['string', 'integer', 'number', 'boolean']).default('string'),
  enum: z.array(Scalar).optional(),
  pattern: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  /** value translation table applied before validation, e.g. {"16:9": "landscape"} */
  map: z.record(z.string(), Scalar).optional(),
  /** used when the brief gives nothing */
  default: Scalar.optional(),
  /** Liquid template for the flag form, e.g. "--ar {{ value }}" (flag-style tools) */
  format: z.string().optional(),
  /** what to do with an invalid value: drop it with an error, or clamp numbers into range */
  on_invalid: z.enum(['drop', 'clamp']).default('drop'),
  note: z.string().optional(),
}).strict();

export const FieldSchema = z.object({
  name: FieldName,
  type: z.enum(['text', 'json']).default('text'),
  /** text fields: one Liquid template */
  template: z.string().optional(),
  /** json fields: an object whose string leaves are Liquid templates; a leaf "=expr" keeps the expression's raw type */
  body: z.record(z.string(), z.unknown()).optional(),
  whitespace: z.enum(['preserve', 'collapse_lines', 'single_line']).default('collapse_lines'),
  max_chars: z.number().int().positive().optional(),
  /** where max_chars came from; "unverified" if from secondary sources */
  limit_source: z.string().optional(),
  required: z.boolean().default(false),
  /** json fields: a vendor JSON Schema the rendered body must satisfy (inline; was `schema_file` in the spike) */
  schema: z.record(z.string(), z.unknown()).optional(),
  description: z.string().optional(),
}).strict().refine((f) => (f.type === 'text' ? f.template !== undefined : f.body !== undefined), {
  message: 'text fields need template; json fields need body',
});

/**
 * A slot is one checklist item forge fills: from the user's words (`said`), an
 * answer, or the default. Unstated slots become chips (blueprint §6).
 */
export const SlotSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  label: Str,
  /** 3 = changes the result a lot; an unstated impact-3 slot with no default becomes a pick chip */
  impact: z.number().int().min(1).max(3),
  /** where the value goes in the Brief IR */
  to: z.string().regex(/^(audience|subject|role|style\.(tone|descriptors)|output\.(format|language)|params\.[a-z][a-z0-9_]*|facets\.[a-z][a-z0-9_]*(\.[a-z0-9_]+)+)$/),
  default: Str.optional(),
  /** chip choices; also matched in the user's words when there is no pattern */
  options: z.array(Str).max(6).default([]),
  /** regex (case-insensitive) finding the value in the user's words; capture group 1 if present */
  pattern: z.string().optional(),
}).strict();

export const CardSchema = z.object({
  card_format: z.literal(1),
  id: z.string().regex(/^[a-z0-9_-]+$/),
  display_name: Str,
  vendor: Str,
  /** content version of this card; bump when the tool changes */
  version: Str,
  verified_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sources: z.array(z.string().url()).min(1),
  /** the model/version the card was written against (perishable) */
  model: z.object({ id: Str, note: z.string().optional() }).strict(),
  /** how the output reaches the tool */
  surface: z.enum(['paste', 'api', 'file', 'mixed']),
  /** deliverable kinds this tool can produce; the first is forge's brief deliverable (same pattern as the Brief IR) */
  accepts: z.array(z.string().regex(/^[a-z_]+$/)).min(1),
  /** Brief IR task family forge uses for this tool, e.g. "image.generate" */
  family: z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/),
  /** other names people say or host apps report (bundle ids); resolveTool matches these and display_name */
  aliases: z.array(Str).default([]),
  /** the text field forge returns as the brief; default: the first required text field */
  insert: FieldName.optional(),
  /** syntax this tool parses inside free text; the renderer neutralizes it in user content */
  syntax: z.array(z.enum(['flags', 'sections'])).default([]),
  slots: z.array(SlotSchema).default([]),
  params: z.record(z.string().regex(/^[a-z][a-z0-9_]*$/), ParamRuleSchema).default({}),
  negation: z.object({
    /** flag/field: tool has a native negative mechanism; inline: say it in the prompt;
     *  positive_rewrite: tool needs positive phrasing (table-driven, rest flagged needs_llm); drop: cannot express */
    strategy: z.enum(['flag', 'field', 'inline', 'positive_rewrite', 'drop']),
    /** for positive_rewrite: lower-case unwanted thing -> positive description */
    rewrite: z.record(z.string(), Str).optional(),
    note: z.string().optional(),
  }).strict(),
  /** content the target must have that a deterministic render cannot invent */
  requires: z.array(z.object({
    any_of: z.array(z.string().regex(/^\//)).min(1),
    message: Str,
  }).strict()).default([]),
  /** brief paths this target intentionally does not render, with the reason */
  ignores: z.record(z.string().regex(/^\//), Str).default({}),
  fields: z.array(FieldSchema).min(1),
  notes: z.array(z.string()).default([]),
}).strict().superRefine((c, ctx) => {
  const names = new Set<string>();
  for (const f of c.fields) {
    if (names.has(f.name)) ctx.addIssue({ code: 'custom', path: ['fields'], message: `duplicate field ${f.name}` });
    names.add(f.name);
  }
  // deterministic CPU bound: templates may only loop over brief data, never over range literals like (1..100000000)
  const tpl = JSON.stringify(c.fields);
  if (/\(\s*[\w.]+\s*\.\.\s*[\w.]+\s*\)/.test(tpl)) ctx.addIssue({ code: 'custom', path: ['fields'], message: 'range literals (a..b) are not allowed in card templates' });
  if (/\{%-?\s*(include|render|layout)\b/.test(tpl)) ctx.addIssue({ code: 'custom', path: ['fields'], message: 'include/render/layout tags are not allowed in card templates' });
  // blueprint §6: parameters reach templates only through validated p.*, never raw from the brief
  if (/\bbrief\.(params|tool_params)\b/.test(tpl)) ctx.addIssue({ code: 'custom', path: ['fields'], message: 'templates read parameters through p.*, not brief.params or brief.tool_params' });
  if (c.negation.strategy === 'positive_rewrite' && !c.negation.rewrite) {
    ctx.addIssue({ code: 'custom', path: ['negation'], message: 'positive_rewrite needs a rewrite table' });
  }
  const insert = c.insert === undefined ? c.fields.find((f) => f.type === 'text' && f.required) : c.fields.find((f) => f.name === c.insert);
  if (!insert || insert.type !== 'text') ctx.addIssue({ code: 'custom', path: ['insert'], message: 'insert must name a text field (or a required text field must exist)' });
  const slotIds = new Set<string>();
  for (const [i, s] of c.slots.entries()) {
    if (slotIds.has(s.id)) ctx.addIssue({ code: 'custom', path: ['slots', i], message: `duplicate slot ${s.id}` });
    slotIds.add(s.id);
    // every non-pick chip shows a value, so only impact-3 slots may lack a default
    if (s.impact < 3 && s.default === undefined) ctx.addIssue({ code: 'custom', path: ['slots', i, 'default'], message: `slot ${s.id}: impact < 3 needs a default` });
    if (s.pattern !== undefined) {
      try { new RegExp(s.pattern, 'iu'); } catch { ctx.addIssue({ code: 'custom', path: ['slots', i, 'pattern'], message: `slot ${s.id}: invalid pattern` }); }
    }
  }
  // blueprint §6: at most 2 pick chips per draft
  if (c.slots.filter((s) => s.impact === 3 && s.default === undefined).length > 2) {
    ctx.addIssue({ code: 'custom', path: ['slots'], message: 'at most 2 impact-3 slots without a default (pick chips)' });
  }
});

export type Card = z.output<typeof CardSchema>;
export type ParamRule = z.output<typeof ParamRuleSchema>;
export type Field = z.output<typeof FieldSchema>;
export type Slot = z.output<typeof SlotSchema>;

/** Parse and validate a card from its YAML text. Throws with every issue listed. */
export function parseCard(yamlText: string): Card {
  const r = CardSchema.safeParse(YAML.parse(yamlText));
  if (!r.success) {
    throw new Error('card invalid:\n' + r.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n'));
  }
  return r.data;
}

/** The field forge returns as the brief. */
export function insertField(card: Card): Field {
  const f = card.insert === undefined ? card.fields.find((x) => x.type === 'text' && x.required) : card.fields.find((x) => x.name === card.insert);
  if (!f) throw new Error(`card ${card.id}: no insert field`);   // unreachable for a parsed card
  return f;
}
