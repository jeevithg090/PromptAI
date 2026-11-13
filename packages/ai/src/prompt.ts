/**
 * Prompt files and their assembly. The order is fixed for cache-stable prefixes
 * (blueprint §6 "Routing rules"): schema → system → card → memory → ask. The schema
 * travels as the response format, which providers place ahead of the system prompt.
 */
import { readFileSync } from 'node:fs';
import type { JSONSchema7, ModelMessage } from 'ai';
import { z } from 'zod';

export type Prompt = { id: string; text: string };

/** Read `prompts/<id>.md`, e.g. `understand.v1`. A new prompt version is a new file. */
export function loadPrompt(id: string): Prompt {
  return { id, text: readFileSync(new URL(`../prompts/${id}.md`, import.meta.url), 'utf8').trim() };
}

/**
 * One tagged block of JSON data. `<` is escaped (still valid JSON) so text inside
 * can't close the tag: everything the user said stays data (blueprint §13).
 */
const block = (tag: string, data: unknown) => `<${tag}>\n${JSON.stringify(data, null, 2).replace(/</g, '\\u003c')}\n</${tag}>`;

export type Sections = { card?: unknown; memory?: unknown; ask: unknown };

/** The system prompt, then one user message whose parts run card → memory → ask. */
export function buildPrompt(system: Prompt, s: Sections): { instructions: string; messages: ModelMessage[] } {
  const parts = [
    ...(s.card !== undefined ? [block('card', s.card)] : []),
    ...(s.memory !== undefined ? [block('memory', s.memory)] : []),
    block('ask', s.ask),
  ];
  return {
    instructions: system.text,
    messages: [{ role: 'user', content: parts.map((text) => ({ type: 'text' as const, text })) }],
  };
}

/** Keywords Anthropic structured outputs reject; the full Zod schema checks them on return instead. */
const UNSUPPORTED = new Set(['minLength', 'maxLength', 'minItems', 'maxItems', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'default']);
function strip(node: unknown, isProperties = false): unknown {
  if (Array.isArray(node)) return node.map((n) => strip(n));
  if (node === null || typeof node !== 'object') return node;
  return Object.fromEntries(Object.entries(node)
    .filter(([k]) => isProperties || !UNSUPPORTED.has(k))      // a property may be named "default"
    .map(([k, v]) => [k, strip(v, !isProperties && k === 'properties')]));
}

/** The JSON schema sent to the model for a Zod schema: same shape, no constraints a provider may reject. */
export function responseSchema(schema: z.ZodType): JSONSchema7 {
  return strip(z.toJSONSchema(schema, { io: 'output', target: 'draft-07' })) as JSONSchema7;
}

/** A conservative input-token estimate (about 3 UTF-8 bytes per token, which overcounts English). */
export const estimateTokens = (text: string) => Math.ceil(new TextEncoder().encode(text).length / 3);
