/**
 * Consent semantics (blueprint §8 Consent, B2). The ledger is append-only and
 * the latest entry per purpose wins. A purpose with no entry is No, except
 * "Personalize for me", which is part of the service and on until paused.
 */
import { desc, eq } from 'drizzle-orm';
import { consentLedger, type Db } from '@promptai/db';
import type { ConsentEntry, ConsentPurpose } from '@promptai/contract';
import type { Caller } from './auth.ts';

/** The latest entry for each purpose the user has answered. */
export async function latestConsents(db: Db, userId: string): Promise<ConsentEntry[]> {
  const rows = await db
    .selectDistinctOn([consentLedger.purpose], { purpose: consentLedger.purpose, granted: consentLedger.granted, version: consentLedger.version, at: consentLedger.at })
    .from(consentLedger)
    .where(eq(consentLedger.userId, userId))
    .orderBy(consentLedger.purpose, desc(consentLedger.at), desc(consentLedger.id));
  return rows.map((r) => ({ ...r, at: r.at.toISOString() }));
}

export function granted(consents: readonly ConsentEntry[], purpose: ConsentPurpose): boolean {
  const entry = consents.find((c) => c.purpose === purpose);
  return entry ? entry.granted : purpose === 'personalize';
}

/**
 * Whether the caller's counts, memories and frecency are read and written.
 * Guests are stateless (blueprint §12): nothing about them is learned.
 */
export async function personalizes(db: Db, caller: Caller): Promise<boolean> {
  return caller.kind === 'account' && granted(await latestConsents(db, caller.id), 'personalize');
}
