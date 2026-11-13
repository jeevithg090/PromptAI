import { defineConfig } from '@lingui/cli';
import { formatter } from '@lingui/format-po';

/**
 * Every UI string lives in a catalog (blueprint §15). `en` is the source;
 * `pseudo` is generated from it for screenshot tests, so clipped or
 * concatenated strings show up before a real translation exists.
 */
export default defineConfig({
  sourceLocale: 'en',
  locales: ['en', 'pseudo'],
  pseudoLocale: { locale: 'pseudo', prepend: '⟦', append: '⟧', extend: 0.35 },
  fallbackLocales: { default: 'en' },
  catalogs: [{ path: '<rootDir>/src/locales/{locale}/messages', include: ['<rootDir>/src'], exclude: ['**/*.test.*'] }],
  format: formatter({ lineNumbers: false }),
});
