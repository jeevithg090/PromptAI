/**
 * Command palette (F2.3) — action registry + a hand-rolled fuzzy subsequence
 * scorer (no new dependency). Characters must appear in order; score rewards
 * consecutive runs and word-boundary matches.
 */
export interface PaletteAction {
  id: string;
  label: string;
  keywords?: string;
  run: () => void;
}

/**
 * Fuzzy score of `query` against `text`. Returns -1 if `query` isn't a
 * subsequence of `text`; higher is a better match. Case-insensitive.
 */
export function fuzzyScore(query: string, text: string): number {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let score = 0;
  let ti = 0;
  let run = 0;
  let prevWasBoundary = true;
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi];
    let found = -1;
    for (let j = ti; j < t.length; j++) {
      if (t[j] === ch) { found = j; break; }
    }
    if (found === -1) return -1; // not a subsequence
    // Reward consecutive matches and word-boundary hits.
    if (found === ti && qi > 0) { run += 1; score += 3 + run; }
    else { run = 0; score += 1; }
    const atBoundary = found === 0 || /[\s\-_/]/.test(t[found - 1] ?? '');
    if (atBoundary) score += 4;
    prevWasBoundary = atBoundary;
    ti = found + 1;
  }
  // Shorter targets rank slightly higher for the same match.
  score += Math.max(0, 10 - Math.floor(t.length / 8));
  void prevWasBoundary;
  return score;
}

/** Rank actions against a query; empty query returns all in registry order. */
export function rankActions(query: string, actions: PaletteAction[]): PaletteAction[] {
  if (!query.trim()) return actions;
  return actions
    .map((a) => ({ a, s: Math.max(fuzzyScore(query, a.label), a.keywords ? fuzzyScore(query, a.keywords) : -1) }))
    .filter((x) => x.s >= 0)
    .sort((x, y) => y.s - x.s)
    .map((x) => x.a);
}
