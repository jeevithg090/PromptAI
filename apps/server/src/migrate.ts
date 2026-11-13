/** Applies @promptai/db's migrations to DATABASE_URL. Run it once per release, before the instances start. */
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { migrate, schema } from '@promptai/db';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  await migrate(drizzle({ client: pool, schema }));
  console.log('migrated');
} finally {
  await pool.end();
}
