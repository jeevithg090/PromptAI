/**
 * Prompt template variables (F2.4). Pure functions — parse `{{name}}` and
 * `{{name|default}}` slots, fill them, and validate. Mirrored to
 * web/src/lib/templateVars.ts — update together.
 */
export interface TemplateVar {
  name: string;
  default?: string;
}

// name: 1–32 chars of [a-z0-9_]; optional default after a pipe.
const VAR_RE = /\{\{\s*([a-z0-9_]{1,32})\s*(?:\|([^}]*))?\}\}/gi;

/** Extract the distinct variables (first-seen order) from template text. */
export function parseVars(text: string): TemplateVar[] {
  const seen = new Map<string, TemplateVar>();
  for (const m of text.matchAll(VAR_RE)) {
    if (!m[1]) continue;
    const name = m[1].toLowerCase();
    if (!seen.has(name)) {
      const def = m[2]?.trim();
      seen.set(name, def ? { name, default: def } : { name });
    }
  }
  return [...seen.values()];
}

/** Fill variables with provided values (falling back to declared defaults, else ''). */
export function fillVars(text: string, values: Record<string, string>): string {
  return text.replace(VAR_RE, (_full, rawName: string, rawDefault?: string) => {
    const name = rawName.toLowerCase();
    if (values[name] != null && values[name] !== '') return values[name];
    return (rawDefault ?? '').trim();
  });
}

/** List variables missing a value AND a default (i.e. would fill to empty). */
export function missingVars(text: string, values: Record<string, string>): string[] {
  return parseVars(text)
    .filter((v) => (values[v.name] == null || values[v.name] === '') && v.default == null)
    .map((v) => v.name);
}
