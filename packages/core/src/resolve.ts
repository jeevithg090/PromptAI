/** Tool resolution by alias table (blueprint §4: the client resolves named tools by regex). */
import type { Card } from './compose/card.ts';
import { findWord, normalize } from './text.ts';

/** The id of the fallback card in catalog/families/. */
export const GENERIC_CARD_ID = 'generic';

/** Names a person might say: display name without its "(...)" qualifier, plus aliases. The bare id is not one ("move the cursor"). */
function spokenNames(card: Card): string[] {
  return [card.display_name.replace(/\s*\([^)]*\)\s*$/, ''), ...card.aliases];
}

/**
 * A tool named in `text` wins (leftmost mention; the longest name on a tie),
 * else the host app matched exactly (normalized) against a card's id or names.
 * Null means: use the generic card.
 */
export function resolveTool(text: string, hostApp: string | undefined, cards: readonly Card[]): string | null {
  const tools = cards.filter((c) => c.id !== GENERIC_CARD_ID);
  const hay = normalize(text);
  let best: { id: string; at: number; len: number } | null = null;
  for (const card of tools) {
    for (const name of spokenNames(card)) {
      const n = normalize(name);
      const at = findWord(hay, n);
      if (at !== -1 && (!best || at < best.at || (at === best.at && n.length > best.len))) best = { id: card.id, at, len: n.length };
    }
  }
  if (best) return best.id;
  if (hostApp === undefined) return null;
  const host = normalize(hostApp);
  if (!host) return null;
  return tools.find((c) => [c.id, c.display_name, ...spokenNames(c)].some((n) => normalize(n) === host))?.id ?? null;
}
