import { i18n } from '@lingui/core';
import { messages as en } from '../locales/en/messages.po';
import { messages as pseudo } from '../locales/pseudo/messages.po';

/** `pseudo` exists for screenshot tests; real locales arrive with their catalogs. */
const CATALOGS = { en, pseudo } as const;
export type AppLocale = keyof typeof CATALOGS;

const KEY = 'promptai.locale';

/** The stored choice, else the browser's language when we have it, else English. */
export function pickLocale(): AppLocale {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored && stored in CATALOGS) return stored as AppLocale;
  } catch {}
  const base = navigator.language?.split('-')[0];
  return base && base in CATALOGS ? (base as AppLocale) : 'en';
}

export function activate(locale: AppLocale) {
  i18n.loadAndActivate({ locale, messages: CATALOGS[locale] });
  return i18n;
}

export { i18n };
