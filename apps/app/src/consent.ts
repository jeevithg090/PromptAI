import type { ConsentEntry, ConsentPurpose } from '@promptai/contract';

/** The version written with the You privacy switches; bump it when their wording changes. */
export const PRIVACY_CONSENT_VERSION = 'privacy-2026-11';

/** The ledger is append-only; the latest entry per purpose wins. null: never asked. */
export function latestConsent(consents: ConsentEntry[], purpose: ConsentPurpose): boolean | null {
  let latest: ConsentEntry | null = null;
  for (const c of consents) if (c.purpose === purpose && (!latest || c.at >= latest.at)) latest = c;
  return latest ? latest.granted : null;
}
