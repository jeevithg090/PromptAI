/**
 * Locale packs (blueprint §7 "Rules as locale packs", "Modes and commands"):
 * data in catalog/locales/<bcp47>/pack.yaml. Fillers, replacements and number
 * words feed cleanTranscript; the command grammar feeds matchVoiceCommand.
 *
 * Phrase grammar (commands): words, `[a|b c]` an optional group of alternatives,
 * and `{x}` (refine only) for the words the instruction keeps. Matching is
 * whole-utterance and case-insensitive, after trimming punctuation.
 */
import { z } from 'zod';
import YAML from 'yaml';

const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/g;
const esc = (s: string) => s.replace(REGEX_SPECIAL, '\\$&');

/** Phrase -> anchored regex source over a normalized utterance plus one trailing space. Throws on bad syntax. */
function compilePhrase(phrase: string, allowCapture: boolean): string {
  const tokens = phrase.trim().match(/\[[^\][{}]*\]|\{x\}|[^\s[\]{}]+|\S/gu) ?? [];
  let src = '';
  let captures = 0;
  for (const t of tokens) {
    if (t === '{x}') { captures++; src += '(.+?) '; continue; }
    if (t.startsWith('[')) {
      const alts = t.slice(1, -1).split('|').map((a) => a.trim().split(/\s+/).map(esc).join(' ')).filter(Boolean);
      if (alts.length === 0) throw new Error(`empty optional group in "${phrase}"`);
      src += `(?:(?:${alts.join('|')}) )?`;
      continue;
    }
    if (/[[\]{}]/.test(t)) throw new Error(`unbalanced bracket in "${phrase}"`);
    src += `${esc(t)} `;
  }
  if (src === '') throw new Error('empty phrase');
  if (captures > (allowCapture ? 1 : 0) || (allowCapture && captures === 0)) {
    throw new Error(allowCapture ? `"${phrase}" needs exactly one {x}` : `"${phrase}": {x} is for refine phrases only`);
  }
  return `^${src}$`;
}

const Phrase = (capture: boolean) => z.string().min(1).max(200).superRefine((p, ctx) => {
  try { compilePhrase(p, capture); } catch (e) { ctx.addIssue({ code: 'custom', message: (e as Error).message }); }
});
const Phrases = z.array(Phrase(false)).default([]);

export const LocalePackSchema = z.object({
  /** BCP 47 tag; the folder name under catalog/locales/ */
  locale: z.string().regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/),
  /** extra standalone filler words, removed like "um" (only where they cannot carry meaning) */
  fillers: z.array(z.string().regex(/^[\p{L}'’]+$/u)).default([]),
  /** whole-phrase, case-insensitive rewrites: spoken forms, tool-name spellings, layout words */
  replacements: z.array(z.object({ from: z.string().min(1), to: z.string() }).strict()).default([]),
  numbers: z.object({
    grouping: z.enum(['western', 'indian']).default('western'),
    /** spoken number words, used only before a scale word ("paanch lakh") */
    words: z.record(z.string().regex(/^[\p{L}-]+$/u), z.number().int().nonnegative()).default({}),
    /** scale words: "<number> <scale>" becomes digits ("5 lakh" -> 5,00,000 with Indian grouping) */
    scales: z.record(z.string().regex(/^[\p{L}-]+$/u), z.number().int().min(10)).default({}),
  }).strict().default({ grouping: 'western', words: {}, scales: {} }),
  /** what dictation means while the Draft sheet is open; anything unmatched is a Refine instruction */
  commands: z.object({
    insert: Phrases,
    copy: Phrases,
    just_draft: Phrases,
    cancel: Phrases,
    refine: z.array(z.object({ say: Phrase(true), instruction: z.string().min(1).max(300).regex(/\{x\}/, 'instruction needs {x}') }).strict()).default([]),
  }).strict().default({ insert: [], copy: [], just_draft: [], cancel: [], refine: [] }),
}).strict();

export type LocalePack = z.output<typeof LocalePackSchema>;

/** Parse and validate a locale pack from its YAML text. Throws with every issue listed. */
export function parseLocalePack(yamlText: string): LocalePack {
  const r = LocalePackSchema.safeParse(YAML.parse(yamlText));
  if (!r.success) throw new Error('locale pack invalid:\n' + r.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n'));
  return r.data;
}

/** RFC 4647 lookup: the pack for "en-IN", else "en"; "hi-Latn-IN" falls back to "hi-Latn". */
export function lookupPack(packs: readonly LocalePack[] | undefined, locale: string): LocalePack | undefined {
  if (!packs?.length) return undefined;
  const parts = locale.toLowerCase().split('-');
  for (let n = parts.length; n > 0; n--) {
    const tag = parts.slice(0, n).join('-');
    const hit = packs.find((p) => p.locale.toLowerCase() === tag);
    if (hit) return hit;
  }
  return undefined;
}

// ---------------------------------------------------------------- cleanup rules from a pack
const WORD_EDGE_L = String.raw`(?<![\p{L}\p{N}'’-])`;
const WORD_EDGE_R = String.raw`(?![\p{L}\p{N}'’-])`;
const alternation = (words: Iterable<string>) => [...words].sort((a, b) => b.length - a.length).map(esc).join('|');

/** Standalone fillers, with an adjoining comma, like the built-in "um" rule. */
export function removeFillers(t: string, pack: LocalePack): string {
  if (pack.fillers.length === 0) return t;
  const re = new RegExp(String.raw`(?:,[ \t]*)?${WORD_EDGE_L}(?:${alternation(pack.fillers)})${WORD_EDGE_R}(?:[ \t]*,)?`, 'giu');
  return t.replace(re, ' ');
}

export function applyReplacements(t: string, pack: LocalePack): string {
  if (pack.replacements.length === 0) return t;
  const to = new Map(pack.replacements.map((r) => [r.from.toLowerCase().replace(/\s+/g, ' '), r.to]));
  const re = new RegExp(`${WORD_EDGE_L}(?:${alternation([...to.keys()].map((k) => k))})${WORD_EDGE_R}`.replace(/ /g, '[ \\t]+'), 'giu');
  return t.replace(re, (m) => to.get(m.toLowerCase().replace(/\s+/g, ' ')) ?? m);
}

/** Western grouping of an integer: 500000 -> "500,000" (the en-IN pass regroups it afterwards). */
const group = (n: bigint) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/**
 * "<number> <scale>" to digits: "5 lakh" -> "500,000", "paanch lakh" -> "500,000",
 * "1.5 crore" -> "15,000,000". Left alone when another number or scale follows
 * ("two thousand twenty six"), or when the decimal does not land on a whole number.
 */
export function scaleNumbers(t: string, pack: LocalePack): string {
  const { words, scales } = pack.numbers;
  const scaleNames = Object.keys(scales);
  if (scaleNames.length === 0) return t;
  const wordNames = Object.keys(words);
  const num = wordNames.length ? String.raw`\d+(?:\.\d+)?|${alternation(wordNames)}` : String.raw`\d+(?:\.\d+)?`;
  const next = [...wordNames, ...scaleNames];
  const re = new RegExp(
    String.raw`${WORD_EDGE_L}(${num})[ \t]+(${alternation(scaleNames)})${WORD_EDGE_R}(?![ \t]+(?:\d|(?:${alternation(next)})${WORD_EDGE_R}))`,
    'giu',
  );
  const lower = (o: Record<string, number>) => new Map(Object.entries(o).map(([k, v]) => [k.toLowerCase(), v]));
  const w = lower(words), s = lower(scales);
  return t.replace(re, (m, n: string, scale: string) => {
    const mult = BigInt(s.get(scale.toLowerCase())!);
    const word = w.get(n.toLowerCase());
    const [int, frac = ''] = word === undefined ? n.split('.') : [String(word)];
    const scaled = BigInt(int! + frac) * mult;
    const div = 10n ** BigInt(frac.length);
    return scaled % div === 0n ? group(scaled / div) : m;
  });
}

// ---------------------------------------------------------------- voice commands
export type VoiceCommand = { kind: 'insert' | 'copy' | 'just_draft' | 'cancel' | 'refine'; instruction?: string };

const compiled = new WeakMap<LocalePack, Array<{ kind: VoiceCommand['kind']; re: RegExp; instruction?: string }>>();
function grammar(pack: LocalePack) {
  let g = compiled.get(pack);
  if (!g) {
    const c = pack.commands;
    g = [
      ...(['cancel', 'insert', 'copy', 'just_draft'] as const).flatMap((kind) => c[kind].map((p) => ({ kind, re: new RegExp(compilePhrase(p, false), 'iu') }))),
      ...c.refine.map((r) => ({ kind: 'refine' as const, re: new RegExp(compilePhrase(r.say, true), 'iu'), instruction: r.instruction })),
    ];
    compiled.set(pack, g);
  }
  return g;
}

/**
 * A command spoken while the Draft sheet is open, or null. The caller treats
 * null as a Refine instruction in the user's own words, so the loop works
 * without a mouse.
 */
export function matchVoiceCommand(text: string, pack: LocalePack): VoiceCommand | null {
  const u = text.normalize('NFC').replace(/^[\s\p{P}]+|[\s\p{P}]+$/gu, '').replace(/\s+/g, ' ');
  if (!u) return null;
  for (const g of grammar(pack)) {
    const m = g.re.exec(`${u} `);
    if (!m) continue;
    return g.instruction === undefined ? { kind: g.kind } : { kind: 'refine', instruction: g.instruction.replace('{x}', m[1]!.trim()) };
  }
  return null;
}
