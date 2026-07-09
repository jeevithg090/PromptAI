import { Client } from 'pg';
import { loadRegistry } from '../services/PlatformService';
import { logger } from '../utils/logger';

/**
 * Seeds the `platforms` table from config/platform-registry.json — spec §5.1.
 * The JSON file stays the source of truth for edits; this script syncs it
 * into Postgres (upsert on platform_id) so the DB and file never drift.
 */
async function seed(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    logger.error({ type: 'seed:missing_database_url' });
    process.exitCode = 1;
    return;
  }

  const registry = loadRegistry();
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    for (const p of registry.platforms) {
      await client.query(
        `insert into platforms
           (platform_id, display_name, modalities, url_patterns, dom_fingerprint_selectors,
            input_selector_candidates, docs_url, quirks, syntax_rules, max_prompt_tokens,
            tos_reviewed, schema_version, last_verified)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         on conflict (platform_id) do update set
           display_name = excluded.display_name,
           modalities = excluded.modalities,
           url_patterns = excluded.url_patterns,
           dom_fingerprint_selectors = excluded.dom_fingerprint_selectors,
           input_selector_candidates = excluded.input_selector_candidates,
           docs_url = excluded.docs_url,
           quirks = excluded.quirks,
           syntax_rules = excluded.syntax_rules,
           max_prompt_tokens = excluded.max_prompt_tokens,
           tos_reviewed = excluded.tos_reviewed,
           schema_version = excluded.schema_version,
           last_verified = excluded.last_verified`,
        [
          p.platform_id,
          p.display_name,
          p.modalities,
          p.url_patterns,
          p.dom_fingerprint_selectors,
          p.input_selector_candidates,
          p.docs_url,
          p.quirks,
          p.syntax_rules,
          p.max_prompt_tokens,
          p.tos_reviewed,
          registry.schema_version,
          registry.last_verified,
        ]
      );
      logger.info({ type: 'seed:platform_upserted', platform_id: p.platform_id });
    }
    logger.info({ type: 'seed:complete', count: registry.platforms.length });
  } finally {
    await client.end();
  }
}

seed().catch(() => {
  process.exitCode = 1;
});
