import { defineConfig } from 'drizzle-kit';

// `pnpm --filter @promptai/db generate` diffs src/schema.ts against drizzle/meta
// and writes the next migration. Triggers and grants live in custom migrations
// (`drizzle-kit generate --custom`), which drizzle-kit keeps in the journal.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './drizzle',
});
