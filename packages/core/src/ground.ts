/**
 * Grounding (blueprint §6): a slot is `said` only when its value is in the
 * user's words, and every specific in a brief must trace to a source.
 */
import type { SlotSource } from '@promptai/contract';
import type { Brief } from './compose/ir.ts';
import { findWord, normalize } from './text.ts';

/** True when `value` appears, as whole words, in `sourceText` (compared normalized). */
export function isGrounded(value: string, sourceText: string): boolean {
  const v = normalize(value);
  return v !== '' && findWord(normalize(sourceText), v) !== -1;
}

/** Downgrades a claimed `said` to `inferred` unless the value is grounded in the user's words. */
export function groundSlot<T extends { value: string | null; source: SlotSource }>(slot: T, userText: string): T {
  if (slot.source !== 'said') return slot;
  return slot.value !== null && isGrounded(slot.value, userText) ? slot : { ...slot, source: 'inferred' };
}

// no `i` flag below: it would make \p{Lu} match lowercase letters too
const MONTH = '(?:[Jj]an(?:uary)?|[Ff]eb(?:ruary)?|[Mm]ar(?:ch)?|[Aa]pr(?:il)?|[Mm]ay|[Jj]une?|[Jj]uly?|[Aa]ug(?:ust)?|[Ss]ep(?:t(?:ember)?)?|[Oo]ct(?:ober)?|[Nn]ov(?:ember)?|[Dd]ec(?:ember)?)';
const DAY = String.raw`\p{Nd}{1,2}(?:st|nd|rd|th)?`;
/** Specifics, leftmost first: URL, email, date, number, capitalized word. */
const SPECIFIC = new RegExp([
  String.raw`(?<url>https?://[^\s<>"'()\]]+|\bwww\.[^\s<>"'()\]]+)`,
  String.raw`(?<email>(?<![\p{L}\p{N}._%+-])[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+)`,
  String.raw`(?<date>\p{Nd}{1,4}[/-]\p{Nd}{1,2}[/-]\p{Nd}{1,4}|\b${MONTH}\.? ${DAY}(?:,? \p{Nd}{4})?\b|\b${DAY} (?:of )?${MONTH}(?:,? \p{Nd}{4})?\b)`,
  String.raw`(?<number>\p{Nd}+(?:[.,:]\p{Nd}+)*)`,
  String.raw`(?<name>\p{Lu}[\p{L}\p{M}\p{N}'’-]*)`,
].join('|'), 'gu');
/** A capitalized word here starts a sentence or line, so its capital says nothing. */
const SENTENCE_START = /(?:^|[.!?:;]["'”’)\]]*\s+|\n[ \t]*(?:(?:[-*+>#]+|\p{Nd}+[.)])[ \t]+)?)$/u;
const PRONOUN_I = /^I(?:['’](?:m|ll|ve|d))?$/;
/** Brief IR paths that are routing metadata, not content. */
const NOT_CONTENT = /^\/(?:ir_version|id|intent|locale|provenance)(?:\/|$)|\/(?:id|kind)$/;

function contentLeaves(v: unknown, ptr = ''): string[] {
  if (NOT_CONTENT.test(ptr)) return [];
  if (typeof v === 'string') return [v];
  if (typeof v === 'number') return [String(v)];
  if (Array.isArray(v)) return v.flatMap((x, i) => contentLeaves(x, `${ptr}/${i}`));
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => contentLeaves(x, `${ptr}/${k}`));
  return [];
}

/**
 * Numbers, dates, emails, URLs and capitalized proper nouns in the brief's
 * content that trace to none of `sources` (the user's words, answers, chips).
 * Card template text is not scanned: it is authored, not generated.
 */
export function findUnsourced(brief: Brief, sources: readonly string[]): string[] {
  const hay = normalize(sources.join('\n'));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const text of contentLeaves(brief)) {
    for (const m of text.matchAll(SPECIFIC)) {
      const token = m[0].replace(/[.,;:!?]+$/, '');   // "see https://x.io/plan." ends the sentence, not the URL
      if (m.groups?.name !== undefined && (PRONOUN_I.test(token) || SENTENCE_START.test(text.slice(0, m.index ?? 0)))) continue;
      const key = normalize(token);
      if (seen.has(key)) continue;
      seen.add(key);
      if (findWord(hay, key) === -1) out.push(token);
    }
  }
  return out;
}
