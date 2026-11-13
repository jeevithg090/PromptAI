/**
 * Text direction from a script table (blueprint §15), never from a list of
 * locales: a language's script decides it. ISO 15924 codes written right to left.
 */
const RTL_SCRIPTS = new Set(['Adlm', 'Arab', 'Hebr', 'Mand', 'Mend', 'Nkoo', 'Rohg', 'Samr', 'Syrc', 'Thaa', 'Yezi']);

/** The locale's script, with Intl's likely-subtags data filling in an implied one ('ur' → 'Arab'). */
export function scriptOf(locale: string): string {
  try {
    return new Intl.Locale(locale).maximize().script ?? 'Latn';
  } catch {
    return 'Latn';
  }
}

export function directionOf(locale: string): 'ltr' | 'rtl' {
  return RTL_SCRIPTS.has(scriptOf(locale)) ? 'rtl' : 'ltr';
}
