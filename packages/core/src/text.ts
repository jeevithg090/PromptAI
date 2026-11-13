/**
 * The normalized comparison space shared by grounding, unsourced checks, the
 * number rule and tool lookup (blueprint §6): NFC, case-fold, digit folding,
 * whitespace collapse, plus number-grouping folding so 1,00,000 = 100,000 = 100000.
 */

const ND = /\p{Nd}/u;
const digitValues = new Map<string, string>();

/**
 * Any Unicode decimal digit to ASCII. Unicode encodes every decimal digit set as
 * a contiguous run 0-9, so a digit's value is its offset in its run.
 */
export function foldDigits(s: string): string {
  return s.replace(/\p{Nd}/gu, (d) => {
    if (d >= '0' && d <= '9') return d;
    let v = digitValues.get(d);
    if (v === undefined) {
      const cp = d.codePointAt(0)!;
      let start = cp;
      while (ND.test(String.fromCodePoint(start - 1))) start--;
      v = String((cp - start) % 10);
      digitValues.set(d, v);
    }
    return v;
  });
}

/** Western (1,234,567) or Indian (12,34,567) digit grouping; ASCII digits. */
export const GROUPED_NUMBER = /(?<![\d,])(?:\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})+,\d{3})(?!\d|,\d)/g;

/** Drop grouping commas: "1,00,000" and "100,000" both become "100000". */
export function foldNumberGrouping(s: string): string {
  return s.replace(GROUPED_NUMBER, (m) => m.replace(/,/g, ''));
}

export function normalize(s: string): string {
  return foldNumberGrouping(foldDigits(s.normalize('NFC').toLowerCase())).replace(/\s+/g, ' ').trim();
}

/** 'L' for letters and combining marks, 'N' for digits, '' otherwise. */
function charClass(ch: string | undefined): string {
  return ch === undefined ? '' : /[\p{L}\p{M}]/u.test(ch) ? 'L' : /\p{N}/u.test(ch) ? 'N' : '';
}

/**
 * Index of the first occurrence of `needle` in `hay` that does not continue a
 * longer word or number, or -1. Both already normalized. Only same-class
 * neighbours join: "art" is not in "start" and "5" is not in "15", but "15" is in "15s".
 */
export function findWord(hay: string, needle: string): number {
  if (!needle) return -1;
  const first = charClass(Array.from(needle)[0]);
  const last = charClass(Array.from(needle).at(-1));
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + 1)) {
    const before = charClass(Array.from(hay.slice(Math.max(0, i - 2), i)).at(-1));
    const end = i + needle.length;
    const after = charClass(Array.from(hay.slice(end, end + 2))[0]);
    if ((!first || before !== first) && (!last || after !== last)) return i;
  }
  return -1;
}
