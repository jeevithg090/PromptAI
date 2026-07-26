// Mirrors backend/src/utils/templateVars.ts — update together. Pure functions
// for {{name}} / {{name|default}} template slots (F2.4).
export interface TemplateVar { name: string; default?: string; }

const VAR_RE = /\{\{\s*([a-z0-9_]{1,32})\s*(?:\|([^}]*))?\}\}/gi;

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

export function fillVars(text: string, values: Record<string, string>): string {
  return text.replace(VAR_RE, (_full, rawName: string, rawDefault?: string) => {
    const name = rawName.toLowerCase();
    if (values[name] != null && values[name] !== '') return values[name];
    return (rawDefault ?? '').trim();
  });
}
