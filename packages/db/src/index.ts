/**
 * @promptai/db: the Drizzle schema, its migrations and the id helpers
 * (blueprint §12). Drivers stay with the caller: the server passes a drizzle
 * instance over `pg` in production and over PGlite in tests.
 */
import { fileURLToPath } from 'node:url';
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from 'drizzle-orm/pg-core';
import { sql, type ExtractTablesWithRelations } from 'drizzle-orm';
// The pglite and node-postgres migrators are the same generic code
// (`db.dialect.migrate(...)`) and this entry point imports no driver.
import { migrate as drizzleMigrate } from 'drizzle-orm/pglite/migrator';
import * as schema from './schema.ts';

export * from './schema.ts';
export { uuidv7 } from './ids.ts';
export { schema };

export type Schema = typeof schema;
/** A drizzle database over any Postgres driver. */
export type Db = PgDatabase<PgQueryResultHKT, Schema>;
export type Tx = PgTransaction<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;

export const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

/** Applies pending migrations in one transaction, tracked in drizzle.__drizzle_migrations. */
export async function migrate(db: Db): Promise<void> {
  await drizzleMigrate(db as unknown as Parameters<typeof drizzleMigrate>[0], { migrationsFolder });
}

/**
 * Marks the current transaction as an account erasure, the one context in
 * which consent_ledger rows may be deleted (drizzle/0001_append_only.sql).
 * The setting is transaction-local, so it ends with the transaction.
 */
export async function markErasure(tx: Tx): Promise<void> {
  await tx.execute(sql`select set_config('promptai.erasure', 'on', true)`);
}
