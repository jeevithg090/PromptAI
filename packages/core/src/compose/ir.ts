/**
 * Brief IR v0.1 — the tool-agnostic prompt representation.
 *
 * Design rules (see REPORT.md):
 *  - Nothing here names a tool. Tool syntax lives only in cards/*.yaml.
 *  - The core is small and closed (strict); extension points are OPEN maps:
 *      facets       namespaced descriptive slots ("visual.lighting", "music.bpm")
 *      params       generic technical knobs ("aspect_ratio", "duration_s")
 *      tool_params  raw per-tool passthrough, validated by that tool's card
 *    so a new field of work or a new tool needs data, not a schema change.
 *  - Provenance (the repo's best idea: `locked` / `defaulted`) is kept, but as a
 *    side map keyed by JSON pointer so templates stay plain.
 */
import { z } from 'zod';

const Str = z.string().trim().min(1);
const FacetKey = z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/, 'facet keys are namespaced, e.g. "visual.lighting"');
const Scalar = z.union([z.string(), z.number(), z.boolean()]);

export const ProvenanceSchema = z.object({
  /** who supplied the value: the user, an inference, long-term memory, a pack/card default */
  source: z.enum(['user', 'inferred', 'memory', 'default']),
  /** refinement must not touch it */
  locked: z.boolean().default(false),
  confidence: z.number().min(0).max(1).optional(),
}).strict();

export const InputSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]+$/),
  kind: z.enum(['text', 'file', 'image', 'audio', 'video', 'url', 'code', 'data']),
  /** how the target should use it: reference | must_keep | source_data | style_reference | edit_target ... (open) */
  role: Str,
  label: z.string().optional(),
  /** a path, URL or asset id */
  ref: z.string().optional(),
  /** inline content (documents, pasted data) */
  content: z.string().optional(),
}).strict().refine((i) => i.ref !== undefined || i.content !== undefined, { message: 'an input needs ref or content' });

export const SectionSchema = z.object({
  /** "Verse 1", "Intro", "Step 2", "Shot 1" */
  label: Str,
  text: Str,
  /** optional timing for time-based media */
  start_s: z.number().min(0).optional(),
  end_s: z.number().positive().optional(),
}).strict();

export const ConstraintSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]+$/),
  text: Str,
  kind: z.enum(['must', 'must_not', 'prefer']).default('must'),
  /** optional deterministic check a verifier can run on the target's OUTPUT */
  verifier: z.object({
    type: z.enum(['contains', 'not_contains', 'max_words', 'max_chars', 'regex', 'llm_yesno']),
    value: Scalar.optional(),
  }).strict().optional(),
}).strict();

export const ExampleSchema = z.object({
  input: z.string().optional(),
  output: Str,
  note: z.string().optional(),
}).strict();

export const AssumptionSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]+$/),
  text: Str,
  why: z.string().optional(),
  confirmed: z.boolean().default(false),
}).strict();

/** Well-known generic params are typed; anything else is allowed (catchall) and checked by the card. */
export const ParamsSchema = z.object({
  aspect_ratio: z.string().regex(/^\d+:\d+$/).optional(),
  duration_s: z.number().positive().optional(),
  resolution: z.string().optional(),
  seed: z.number().int().min(0).optional(),
  count: z.number().int().positive().optional(),
  /** how hard the target should think: maps to reasoning/effort knobs where they exist */
  effort: z.enum(['low', 'medium', 'high']).optional(),
  instrumental: z.boolean().optional(),
}).catchall(Scalar);

export const OutputSchema = z.object({
  /** prose | markdown | json | csv | code | bullet_list | table ... (open) */
  format: z.string().optional(),
  length: z.object({
    unit: z.enum(['words', 'chars', 'sentences', 'paragraphs', 'items', 'lines', 'seconds', 'pages']),
    min: z.number().positive().optional(),
    max: z.number().positive().optional(),
    target: z.number().positive().optional(),
  }).strict().optional(),
  /** ordered headings/parts the deliverable must contain */
  structure: z.array(Str).optional(),
  /** a JSON Schema the target's output must satisfy (extraction tasks) */
  schema: z.record(z.string(), z.unknown()).optional(),
  language: z.string().optional(),
}).strict();

export const BriefSchema = z.object({
  ir_version: z.literal('0.1'),
  id: z.string().optional(),
  intent: z.object({
    /** the only fixed enum (intent-elicitation.md): ask | do | learn | automate | express */
    mode: z.enum(['ask', 'do', 'learn', 'automate', 'express']),
    /** open catalog id, e.g. "image.product_shot", "code.bugfix", "music.song" */
    task_family: z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/),
    deliverable: z.object({
      /** open: text | image | video | audio | code | data | ... */
      kind: z.string().regex(/^[a-z_]+$/),
      description: z.string().optional(),
    }).strict(),
  }).strict(),
  /** the why / what, in the user's words where possible */
  goal: Str,
  /** the main thing being made or described (a scene, a topic, a function) */
  subject: Str.optional(),
  audience: Str.optional(),
  /** a persona the target should adopt (text targets) */
  role: Str.optional(),
  context: z.array(Str).default([]),
  inputs: z.array(InputSchema).default([]),
  /** ordered parts: lyrics sections, outline, timeline beats, steps */
  sections: z.array(SectionSchema).default([]),
  style: z.object({
    tone: z.array(Str).default([]),
    descriptors: z.array(Str).default([]),
    references: z.array(Str).default([]),
  }).strict().default({ tone: [], descriptors: [], references: [] }),
  facets: z.record(FacetKey, z.union([Scalar, z.array(Str)])).default({}),
  constraints: z.array(ConstraintSchema).default([]),
  /** tool-agnostic exclusions; each card decides how (or whether) its tool can express them */
  avoid: z.array(Str).default([]),
  output: OutputSchema.default({}),
  examples: z.array(ExampleSchema).default([]),
  success_criteria: z.array(Str).default([]),
  assumptions: z.array(AssumptionSchema).default([]),
  params: ParamsSchema.default({}),
  /** raw passthrough keyed by card id; only that card reads it and validates it */
  tool_params: z.record(z.string().regex(/^[a-z0-9_-]+$/), z.record(z.string(), Scalar)).default({}),
  /** JSON pointer -> provenance, e.g. "/facets/visual.lighting": {source: "default"} */
  provenance: z.record(z.string().regex(/^\//), ProvenanceSchema).default({}),
  locale: z.string().default('en'),
}).strict().superRefine((b, ctx) => {
  // cross-field checks the type system cannot express
  const ids = new Set<string>();
  for (const c of b.constraints) {
    if (ids.has(c.id)) ctx.addIssue({ code: 'custom', path: ['constraints'], message: `duplicate constraint id "${c.id}"` });
    ids.add(c.id);
  }
  for (const [i, s] of b.sections.entries()) {
    if (s.start_s !== undefined && s.end_s !== undefined && s.end_s <= s.start_s) {
      ctx.addIssue({ code: 'custom', path: ['sections', i, 'end_s'], message: 'end_s must be after start_s' });
    }
  }
  const len = b.output.length;
  if (len?.min !== undefined && len?.max !== undefined && len.min > len.max) {
    ctx.addIssue({ code: 'custom', path: ['output', 'length'], message: 'min > max' });
  }
});

export type Brief = z.output<typeof BriefSchema>;
export type BriefInput = z.input<typeof BriefSchema>;

export function parseBrief(data: unknown): { ok: true; brief: Brief } | { ok: false; errors: string[] } {
  const r = BriefSchema.safeParse(data);
  if (r.success) return { ok: true, brief: r.data };
  return { ok: false, errors: r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`) };
}
