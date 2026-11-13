/**
 * The tiny renderer: Brief IR + card (data) -> target fields.
 * Tool-specific knowledge must never appear in this file. If adding a tool
 * needs an edit here, that is a failure of the design.
 *
 * Ported from spikes/prompt-representation/src/render.ts. Changes: no fs (cards
 * arrive parsed), vendor schemas are checked with Zod's JSON Schema import
 * instead of Ajv, and tool syntax a card declares (`syntax`) is neutralized in
 * free text before rendering (the spike let "--ar 1:9 --sref 99999" in a
 * subject reach the prompt).
 */
import { Liquid } from 'liquidjs';
import { z } from 'zod';
import { BriefSchema, type Brief } from './ir.ts';
import type { Card, ParamRule } from './card.ts';

export type Issue = { level: 'error' | 'warning' | 'info'; code: string; message: string; path?: string };
export type Coverage = { total: number; rendered: number; ignored: number; dropped: string[]; rate: number };
export type RenderResult = {
  target: string;
  card_version: string;
  ok: boolean;
  fields: Record<string, unknown>;
  issues: Issue[];
  coverage: Coverage;
};

// ---------------------------------------------------------------- template engine
/** Sandboxed Liquid: no filesystem (in-memory template map), own properties only, DoS limits. */
function makeEngine(): Liquid {
  const engine = new Liquid({
    strictFilters: true,
    strictVariables: false,
    ownPropertyOnly: true,
    templates: {},            // {% include %}/{% render %} resolve only against this empty map
    relativeReference: false,
    parseLimit: 200_000,      // chars per template
    renderLimit: 2_000,       // ms per render, WALL-CLOCK: 250 ms gave false failures under CPU contention; range loops are banned by card lint instead
    memoryLimit: 5_000_000,   // allocation units
    greedy: true,
  });
  // The ONLY custom filters. Generic text helpers, no tool knowledge.
  engine.registerFilter('sentence', (v: unknown) => {
    const t = String(v ?? '').trim().replace(/\s+/g, ' ');
    if (!t) return '';
    const c = t.charAt(0).toUpperCase() + t.slice(1);
    return /[.!?:)"'\]]$/.test(c) ? c : `${c}.`;
  });
  engine.registerFilter('bullets', (v: unknown, marker = '-') =>
    (Array.isArray(v) ? v : v == null ? [] : [v]).map((x) => `${marker} ${String(x).trim()}`).join('\n'));
  engine.registerFilter('numbered', (v: unknown) =>
    (Array.isArray(v) ? v : v == null ? [] : [v]).map((x, i) => `${i + 1}. ${String(x).trim()}`).join('\n'));
  engine.registerFilter('xml_text', (v: unknown) =>
    String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
  return engine;
}

const engine = makeEngine();
const parsed = new Map<string, ReturnType<Liquid['parse']>>();
function renderTpl(tpl: string, view: object): string {
  let t = parsed.get(tpl);
  if (!t) { t = engine.parse(tpl); parsed.set(tpl, t); }
  return engine.renderSync(t, view) as string;
}

/** Vendor request schemas, compiled once per schema object. */
const vendorSchemas = new WeakMap<object, z.ZodType>();
function vendorSchema(schema: Record<string, unknown>): z.ZodType {
  let s = vendorSchemas.get(schema);
  if (!s) { s = z.fromJSONSchema(schema as Parameters<typeof z.fromJSONSchema>[0]); vendorSchemas.set(schema, s); }
  return s;
}

// ---------------------------------------------------------------- helpers
function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === '' ||
    (Array.isArray(v) && v.length === 0) ||
    (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0);
}
/** Liquid treats "" and [] as truthy; prune them so `{% if x %}` means "has content". */
function prune(v: unknown): unknown {
  if (Array.isArray(v)) { const a = v.map(prune).filter((x) => !isEmpty(x)); return a.length ? a : undefined; }
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) { const p = prune(x); if (!isEmpty(p)) o[k] = p; }
    return Object.keys(o).length ? o : undefined;
  }
  return isEmpty(v) ? undefined : v;
}
/** "visual.lighting" -> {visual: {lighting}} so templates write facets.visual.lighting */
function nest(flat: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(flat)) {
    const parts = k.split('.');
    let o = out;
    for (const p of parts.slice(0, -1)) {
      const next = o[p];
      o = (o[p] = next && typeof next === 'object' ? next : {}) as Record<string, unknown>;
    }
    o[parts.at(-1)!] = v;
  }
  return out;
}
/** param lookup paths: params.x | tool_params.<id>.x | facets.<ns.key> */
function lookup(brief: Brief, path: string): { value: unknown; pointer: string } {
  if (path.startsWith('facets.')) { const k = path.slice(7); return { value: brief.facets[k], pointer: `/facets/${k}` }; }
  if (path.startsWith('params.')) { const k = path.slice(7); return { value: (brief.params as Record<string, unknown>)[k], pointer: `/params/${k}` }; }
  const m = /^tool_params\.([a-z0-9_-]+)\.(.+)$/.exec(path);
  if (m) return { value: brief.tool_params[m[1]!]?.[m[2]!], pointer: `/tool_params/${m[1]}/${m[2]}` };
  return { value: undefined, pointer: path };
}
function normText(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').toLowerCase().replace(/\s+/g, ' ');
}
function leaves(v: unknown, ptr = ''): Array<[string, unknown]> {
  if (Array.isArray(v)) return v.flatMap((x, i) => leaves(x, `${ptr}/${i}`));
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => leaves(x, `${ptr}/${k}`));
  return [[ptr, v]];
}
function textOf(v: unknown): string {
  return leaves(v).map(([, x]) => (x === undefined || x === null ? '' : String(x))).join('\n');
}
function whitespace(s: string, mode: 'preserve' | 'collapse_lines' | 'single_line'): string {
  if (mode === 'preserve') return s.replace(/\s+$/, '');
  if (mode === 'single_line') {
    return s.replace(/\s+/g, ' ').replace(/\s+([,.;:])/g, '$1').replace(/,(\s*,)+/g, ',').replace(/^[\s,]+|[\s,]+$/g, '');
  }
  return s.split('\n').map((l) => l.replace(/[ \t]+$/g, '')).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

const ARTIFACTS = [/\bundefined\b/, /\[object Object\]/, /\{\{/, /\{%/, /\bNaN\b/];

/** Paths that are routing metadata, not content a target is expected to show. */
const META = [/^\/ir_version$/, /^\/id$/, /^\/intent\//, /^\/locale$/, /^\/provenance\//, /\/id$/, /^\/constraints\/\d+\/(kind|verifier)/,
  /^\/assumptions\/\d+\/confirmed$/, /^\/inputs\/\d+\/(kind|role)$/, /^\/sections\/\d+\/(start_s|end_s)$/, /^\/output\/length\/unit$/];

// ---------------------------------------------------------------- tool syntax in free text
/** Generic token classes a card can declare in `syntax`. Each match is neutralized and reported. */
const SYNTAX = {
  /** "--name" (or an en/em dash some tools read as "--") starting a word: a parameter flag */
  flags: { re: /(^|\s)(?:--+|[–—])(?=\p{L})/gu, fix: (_m: string, lead: string) => lead },
  /** "[Label]": a section or timing tag */
  sections: { re: /\[([^[\]\n]{1,80})\]/gu, fix: (_m: string, inner: string) => inner },
} as const;
/** Brief keys that are typed or validated elsewhere (params go through card rules), not free text. */
const NOT_FREE_TEXT = new Set(['ir_version', 'id', 'intent', 'params', 'tool_params', 'provenance', 'locale']);

function escapeSyntax(brief: Brief, card: Card, issues: Issue[]): Brief {
  if (card.syntax.length === 0) return brief;
  const walk = (v: unknown, ptr: string): unknown => {
    if (typeof v === 'string') {
      let s = v;
      for (const kind of card.syntax) {
        const { re, fix } = SYNTAX[kind];
        s = s.replace(re, (m: string, g: string) => {
          issues.push({ level: 'warning', code: 'tool_syntax_escaped', path: ptr, message: `"${m.trim()}" is ${card.display_name} syntax inside free text; neutralized` });
          return fix(m, g);
        });
      }
      return s;
    }
    if (Array.isArray(v)) return v.map((x, i) => walk(x, `${ptr}/${i}`));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, `${ptr}/${k}`)]));
    return v;
  };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(brief)) out[k] = NOT_FREE_TEXT.has(k) || k === 'output' ? v : walk(v, `/${k}`);
  // output.structure is free text; output.schema is a JSON Schema and is left alone
  if (brief.output.structure) out.output = { ...brief.output, structure: walk(brief.output.structure, '/output/structure') };
  return out as Brief;
}

// ---------------------------------------------------------------- params + negation
function resolveParams(brief: Brief, card: Card, issues: Issue[], consumed: Set<string>) {
  const values: Record<string, unknown> = {};
  const flags: string[] = [];
  for (const [name, rule] of Object.entries(card.params) as Array<[string, ParamRule]>) {
    const from = rule.from ?? [`params.${name}`, `tool_params.${card.id}.${name}`];
    let raw: unknown; let ptr = '';
    for (const f of from) { const r = lookup(brief, f); if (r.value !== undefined) { raw = r.value; ptr = r.pointer; break; } }
    if (raw === undefined) { if (rule.default === undefined) continue; raw = rule.default; ptr = `(card default)`; }
    else consumed.add(ptr);
    let v: unknown = rule.map && String(raw) in rule.map ? rule.map[String(raw)] : raw;
    const bad = (why: string) => issues.push({ level: 'error', code: 'param_invalid', path: ptr, message: `${name}=${JSON.stringify(raw)} ${why}; dropped` });
    if (rule.type === 'integer' || rule.type === 'number') {
      if (typeof v !== 'number' || (rule.type === 'integer' && !Number.isInteger(v))) { bad(`is not ${rule.type}`); continue; }
      if ((rule.min !== undefined && v < rule.min) || (rule.max !== undefined && v > rule.max)) {
        if (rule.on_invalid === 'clamp') {
          const c = Math.min(rule.max ?? v, Math.max(rule.min ?? v, v));
          issues.push({ level: 'warning', code: 'param_clamped', path: ptr, message: `${name}=${v} clamped to ${c}` });
          v = c;
        } else { bad(`outside [${rule.min ?? '-inf'}, ${rule.max ?? 'inf'}]`); continue; }
      }
    } else if (rule.type === 'boolean') {
      if (typeof v !== 'boolean') { bad('is not boolean'); continue; }
    } else {
      v = String(v);
      if (rule.pattern && !new RegExp(rule.pattern).test(v as string)) { bad(`does not match ${rule.pattern}`); continue; }
    }
    if (rule.enum && !(rule.enum as unknown[]).includes(v)) { bad(`not in [${rule.enum.join(', ')}]`); continue; }
    values[name] = v;
    if (rule.format && v !== false) flags.push(renderTpl(rule.format, { value: v }).trim());
  }
  // generic params the brief set that this card cannot express
  for (const [k, v] of Object.entries(brief.params)) {
    if (v === undefined || consumed.has(`/params/${k}`)) continue;
    if (Object.keys(card.ignores).some((g) => `/params/${k}` === g || `/params/${k}`.startsWith(g + '/'))) continue; // declared n/a, reported as info
    issues.push({ level: 'warning', code: 'param_unsupported', path: `/params/${k}`, message: `${card.display_name} has no setting for "${k}"; not sent` });
  }
  for (const k of Object.keys(brief.tool_params[card.id] ?? {})) {
    if (!consumed.has(`/tool_params/${card.id}/${k}`)) {
      issues.push({ level: 'warning', code: 'tool_param_unknown', path: `/tool_params/${card.id}/${k}`, message: `card ${card.id} does not define "${k}"` });
    }
  }
  return { values, flags };
}

function resolveNegation(brief: Brief, card: Card, issues: Issue[], consumed: Set<string>) {
  const items: string[] = []; const positive: string[] = [];
  const s = card.negation.strategy;
  brief.avoid.forEach((a, i) => {
    const ptr = `/avoid/${i}`;
    if (s === 'drop') {
      issues.push({ level: 'warning', code: 'negation_unsupported', path: ptr, message: `${card.display_name} cannot exclude "${a}"` });
      return;
    }
    if (s === 'positive_rewrite') {
      const key = a.toLowerCase().replace(/^(no|without|not)\s+/, '').trim();
      const hit = card.negation.rewrite?.[key];
      if (hit) { positive.push(hit); consumed.add(ptr); }
      else issues.push({ level: 'warning', code: 'needs_llm_rewrite', path: ptr, message: `"${a}" must be rephrased positively for ${card.display_name}; no table entry, left out` });
      return;
    }
    items.push(a);
  });
  return { items, positive };
}

function assumedList(brief: Brief): string[] {
  const out = brief.assumptions.filter((a) => !a.confirmed).map((a) => (a.why ? `${a.text} (${a.why})` : a.text));
  for (const [ptr, p] of Object.entries(brief.provenance)) {
    if (p.source !== 'default' && p.source !== 'inferred') continue;
    const val = leaves(brief).find(([k]) => k === ptr)?.[1];
    if (val === undefined) continue;
    const label = ptr.split('/').filter(Boolean).at(-1)!.replace(/^[a-z]+\./, '').replace(/_/g, ' ');
    out.push(`${label}: ${val} (${p.source === 'default' ? 'default' : 'inferred'})`);
  }
  return out;
}

// ---------------------------------------------------------------- main
function renderJson(body: unknown, view: object, ws: 'preserve' | 'collapse_lines' | 'single_line'): unknown {
  if (typeof body === 'string') {
    if (body.startsWith('=')) return engine.evalValueSync(body.slice(1).trim(), view);
    return whitespace(renderTpl(body, view), ws);
  }
  if (Array.isArray(body)) return body.map((b) => renderJson(b, view, ws)).filter((x) => !isEmpty(x));
  if (body && typeof body === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) { const r = renderJson(v, view, ws); if (!isEmpty(r)) o[k] = r; }
    return o;
  }
  return body;
}

export function render(briefInput: unknown, card: Card): RenderResult {
  const issues: Issue[] = [];
  const parsedBrief = BriefSchema.safeParse(briefInput);
  if (!parsedBrief.success) {
    return {
      target: card.id, card_version: card.version, ok: false, fields: {},
      issues: parsedBrief.error.issues.map((i) => ({ level: 'error' as const, code: 'brief_invalid', path: '/' + i.path.join('/'), message: i.message })),
      coverage: { total: 0, rendered: 0, ignored: 0, dropped: [], rate: 0 },
    };
  }
  const brief = escapeSyntax(parsedBrief.data, card, issues);
  const consumed = new Set<string>();

  if (!card.accepts.includes(brief.intent.deliverable.kind)) {
    issues.push({ level: 'warning', code: 'deliverable_mismatch', path: '/intent/deliverable/kind',
      message: `${card.display_name} makes ${card.accepts.join('/')}, brief asks for ${brief.intent.deliverable.kind}` });
  }
  const { values, flags } = resolveParams(brief, card, issues, consumed);
  const neg = resolveNegation(brief, card, issues, consumed);
  for (const req of card.requires) {
    const has = req.any_of.some((ptr) => { const v = leaves(brief).filter(([k]) => k === ptr || k.startsWith(ptr + '/')); return v.some(([, x]) => !isEmpty(x) && x !== false); });
    if (!has) issues.push({ level: 'warning', code: 'needs_llm', path: req.any_of.join(' | '), message: req.message });
  }

  const briefText = textOf(brief);
  const out: Record<string, unknown> = {};
  const view = {
    brief: prune({ ...brief, facets: nest(brief.facets) }) ?? {},
    p: values, flags: flags.length ? flags : undefined,
    neg: prune(neg), assumed: prune(assumedList(brief)),
    card: { id: card.id, display_name: card.display_name, model: card.model.id },
    out,
  };
  for (const f of card.fields) {
    try {
      out[f.name] = f.type === 'text' ? whitespace(renderTpl(f.template!, view), f.whitespace) : renderJson(f.body, view, f.whitespace);
    } catch (e) {
      issues.push({ level: 'error', code: 'template_error', path: `field:${f.name}`, message: (e as Error).message.split('\n')[0] ?? '' });
      out[f.name] = '';
    }
    const v = out[f.name];
    if (isEmpty(v)) { delete out[f.name]; if (f.required) issues.push({ level: 'error', code: 'field_empty', path: `field:${f.name}`, message: `${f.name} rendered empty` }); continue; }
    const text = textOf(v);
    const artifact = ARTIFACTS.find((r) => r.test(text) && !r.test(briefText));   // user content may legitimately contain "{{"
    if (artifact) issues.push({ level: 'error', code: 'template_artifact', path: `field:${f.name}`, message: `output contains template artifact ${artifact}` });
    const empty = /<([a-z_]+)>\s*<\/\1>/.exec(text);
    if (empty) issues.push({ level: 'warning', code: 'empty_section', path: `field:${f.name}`, message: `empty <${empty[1]}> section` });
    if (f.max_chars && text.length > f.max_chars) {
      issues.push({ level: 'warning', code: 'over_limit', path: `field:${f.name}`, message: `${f.name} is ${text.length} chars; ${card.display_name} limit is ${f.max_chars}${f.limit_source ? ` (${f.limit_source})` : ''}` });
    }
    if (f.schema) {
      let schema: z.ZodType;
      try { schema = vendorSchema(f.schema); } catch (e) {   // hardening: a bad schema is a card bug, not a crash
        issues.push({ level: 'error', code: 'vendor_schema_invalid', path: `field:${f.name}`, message: (e as Error).message.split('\n')[0] ?? '' });
        continue;
      }
      const r = schema.safeParse(v);
      if (!r.success) {
        for (const e of r.error.issues) issues.push({ level: 'error', code: 'schema_violation', path: `field:${f.name}${e.path.map((p) => `/${String(p)}`).join('')}`, message: e.message });
      }
    }
  }

  // coverage: which brief content reached this target
  const all = textOf(out);
  const hay = normText(all);
  let total = 0, rendered = 0, ignored = 0; const dropped: string[] = []; const ignoredKeys = new Set<string>();
  for (const [ptr, val] of leaves(brief)) {
    if (val === undefined || val === null || typeof val === 'boolean' || META.some((r) => r.test(ptr))) continue;
    const tp = /^\/tool_params\/([a-z0-9_-]+)\//.exec(ptr);
    if (tp && tp[1] !== card.id) continue;               // other tools' passthrough is not ours to render
    total++;
    const needle = normText(String(val)).replace(/[.!?;:\s]+$/, '');
    if (consumed.has(ptr) || (needle.length > 0 && hay.includes(needle))) { rendered++; continue; }
    const ig = Object.keys(card.ignores).find((g) => ptr === g || ptr.startsWith(g + '/'));
    if (ig) { ignored++; ignoredKeys.add(ig); continue; }
    dropped.push(ptr);
  }
  // transparency: tell the user what this target cannot use, instead of silently losing it
  for (const ig of ignoredKeys) issues.push({ level: 'info', code: 'not_applicable', path: ig, message: card.ignores[ig]! });
  const denom = total - ignored;
  return {
    target: card.id, card_version: card.version,
    ok: !issues.some((i) => i.level === 'error'),
    fields: out, issues,
    coverage: { total, rendered, ignored, dropped, rate: denom ? Math.round((rendered / denom) * 1000) / 1000 : 1 },
  };
}
