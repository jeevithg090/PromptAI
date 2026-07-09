/**
 * Tolerant JSON extraction from LLM output.
 * Models (especially reasoning models routed through OpenAI-compatible
 * gateways) sometimes wrap JSON in markdown fences or emit stray text around
 * it. Try strict parse → fence-stripped parse → outermost {..} / [..] slice.
 * Throws if nothing parses, so callers keep their retry/fail-closed logic.
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }

  const unfenced = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try {
    return JSON.parse(unfenced);
  } catch {
    /* fall through */
  }

  // Last resort: slice from the first opening brace/bracket to its matching last one.
  const firstObj = unfenced.indexOf('{');
  const firstArr = unfenced.indexOf('[');
  const start =
    firstObj === -1 ? firstArr : firstArr === -1 ? firstObj : Math.min(firstObj, firstArr);
  if (start !== -1) {
    const open = unfenced[start];
    const close = open === '{' ? '}' : ']';
    const end = unfenced.lastIndexOf(close);
    if (end > start) {
      return JSON.parse(unfenced.slice(start, end + 1));
    }
  }

  throw new Error('no parseable JSON found');
}
