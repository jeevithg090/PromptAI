/**
 * Deterministic transcript cleanup (blueprint §7, "Rules as locale packs").
 * Every rule leans toward keeping words: a filler left in is a cosmetic miss,
 * a meaningful word removed is a meaning error.
 */
import { foldDigits, foldNumberGrouping } from './text.ts';

/** Marks "capitalize the next letter" where a removed word carried a sentence's capital. */
const CAP = '\u0001';
const capIf = (word: string) => (/^\p{Lu}/u.test(word) ? ` ${CAP}` : ' ');

/** "a new line of products" is content, not a command. */
const DETERMINER = 'a|an|the|this|that|our|your|their|his|her|its|my|another|each|every|one|any';
const LAYOUT = new RegExp(String.raw`[ \t]*(?<!\b(?:${DETERMINER})[ \t]+)\b(?:new[ \t]+(line|paragraph)|naya[ \t]+line)\b(?![ \t]+of\b)[ \t]*[,.]?[ \t]*`, 'giu');

/** um, umm, uh, uhm, er, erm. Not "err" (a verb); all-caps forms (ER, UM) are acronyms and stay. */
const FILLER = /(?:,[ \t]*)?(?<![\p{L}\p{N}'’-])(u+m+|u+h+m*|e+r+m+|er)(?![\p{L}\p{N}'’-])(?:[ \t]*,)?/giu;

/** "you know" stays when it is the real verb: "do you know", "let you know", "you know the way". */
const YK_BEFORE = "do|did|does|don't|didn't|doesn't|if|as|so|now|let|lets|letting|would|will|should|could|can|may|might|must|that|what|how|who|whom|whether|because|when|where|why|since|unless|hope|think|guess|bet|know|sure|and|but|or";
const YK_AFTER = 'that|what|how|if|why|when|where|who|whom|whether|the|a|an|it|him|her|them|me|us|this|those|these|about|anything|nothing|something|someone|everything|everyone|my|his|their|our|your|its|to|more|better|best';
const YOU_KNOW = new RegExp(String.raw`(?:,[ \t]*)?(?<!\b(?:${YK_BEFORE})[ \t]+)\b(you know)\b(?![ \t]+(?:${YK_AFTER})\b)(?:[ \t]*,)?`, 'giu');

/**
 * "like" is removed only where it cannot carry meaning: between commas (", like,"),
 * as a sentence-opening "Like,", or between a copula and an intensifier
 * ("I was like really impressed"). "I like it", "it is like a dream",
 * "like 5 minutes" and quotative "he was like, no way" stay.
 */
const LIKE_COMMAS = /,[ \t]*like[ \t]*,/giu;
const LIKE_OPENER = /(^|[.!?\n][ \t]*)(like)[ \t]*,[ \t]*/giu;
const COPULA = "was|were|is|are|am|i'm|it's|he's|she's|that's|they're|we're|you're";
const INTENSIFIER = 'really|so|totally|super|very|literally|actually|basically|kinda|pretty|completely|absolutely';
const LIKE_HEDGE = new RegExp(String.raw`\b(${COPULA})[ \t]+like,?[ \t]+(?=(?:${INTENSIFIER})\b)`, 'giu');

/**
 * "scratch that" removes the clause before it, back to the previous , ; . ! ? or
 * line break. When the words after it restart that clause ("about my dog,
 * scratch that, about my cat"), only the part from the restarted word goes.
 */
const SCRATCH = /\bscratch that\b[ \t]*[,.!]?/iu;
const CLAUSE_END = /[.!?;,](?=\s)|\n/gu;

function scratchThat(t: string): string {
  for (let m = SCRATCH.exec(t); m; m = SCRATCH.exec(t)) {
    const left = t.slice(0, m.index).replace(/[\s,;:.!?]+$/u, '');
    const cut = [...left.matchAll(CLAUSE_END)].at(-1);
    let keep = cut ? left.slice(0, (cut.index ?? 0) + 1) : '';
    let removed = left.slice(keep.length);
    let right = t.slice(m.index + m[0].length).replace(/^[ \t,;:]+/u, '');
    const first = /^[\p{L}\p{N}]+/u.exec(right)?.[0];
    const restart = first && [...removed.matchAll(new RegExp(String.raw`(?<![\p{L}\p{N}'’])${first}(?![\p{L}\p{N}'’])`, 'giu'))].at(-1);
    if (restart) { keep += removed.slice(0, restart.index); removed = removed.slice(restart.index); }
    if (!right.trim()) keep = keep.replace(/[,;]$/u, '');
    else if (/(?:^|[.!?\n])\s*$/u.test(keep) && /^\s*\p{Lu}/u.test(removed)) right = CAP + right;
    t = keep + (keep && !keep.endsWith('\n') && right ? ' ' : '') + right;
  }
  return t;
}

/** Indian digit grouping: 1,234,567 -> 12,34,567. Only numbers already grouped; bare digit runs may be PIN codes or phone numbers. */
function indianGrouping(t: string): string {
  return t.replace(/(?<![\d,])\d{1,3}(?:,\d{3})+(?!\d|,\d)/g, (m) => {
    const d = m.replace(/,/g, '');
    const head = d.slice(0, -3);
    return `${head.replace(/\B(?=(\d{2})+$)/g, ',')}${head ? ',' : ''}${d.slice(-3)}`;
  });
}

/**
 * Clean a dictated transcript. The rules are English plus Hinglish, so they run
 * only for `en*` and `hi*` locales ("er" is a German pronoun); other locales get
 * whitespace cleanup only, until their locale pack exists.
 */
export function cleanTranscript(text: string, locale = 'en'): string {
  let t = text.normalize('NFC').replaceAll(CAP, '').replace(/\r\n?/g, '\n');
  if (!/^(?:en|hi)(?:-|$)/i.test(locale)) return t.replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').trim();
  t = t.replace(LAYOUT, (_m, cmd: string | undefined) => (cmd?.toLowerCase() === 'paragraph' ? '\n\n' : '\n'));
  t = t.replace(FILLER, (m, word: string) => (word.length > 1 && word === word.toUpperCase() ? m : capIf(word)));
  t = t.replace(YOU_KNOW, (_m, phrase: string) => capIf(phrase));
  t = t.replace(LIKE_COMMAS, ' ');
  t = t.replace(LIKE_OPENER, (_m, lead: string, word: string) => lead + capIf(word).trim());
  t = t.replace(LIKE_HEDGE, '$1 ');
  t = scratchThat(t);
  if (/^en-in$/i.test(locale)) t = indianGrouping(t);
  return t
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/ ([,.!?;:])/g, '$1')
    .replace(/,+([,.!?;:])/g, '$1')
    .replace(/(^|\n)[,;:]+ ?/g, '$1')
    .replace(new RegExp(`${CAP}[ \\t]*(\\p{L})`, 'gu'), (_m, c: string) => c.toUpperCase())
    .replaceAll(CAP, '')
    .trim();
}

function numbersIn(s: string): string[] {
  return foldNumberGrouping(foldDigits(s.normalize('NFC'))).match(/\d+(?:[.:]\d+)*/g) ?? [];
}

/** True when every number in `after` also appears in `before` (grouping and script differences ignored). */
export function numbersConsistent(before: string, after: string): boolean {
  const have = new Set(numbersIn(before));
  return numbersIn(after).every((n) => have.has(n));
}
