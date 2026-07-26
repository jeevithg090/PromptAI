import { Client } from 'pg';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { listPlatforms } from '../services/PlatformService';
import { groundingService } from '../services/GroundingService';
import { ingestChunks } from '../services/DocIngest';

/**
 * PKB grounding seed (finalplan §A2.6). For every registered platform, extract
 * prompt-writing rules from its official docs via GroundingService (Gemini
 * url_context, with an SSRF-guarded HTML fetch fallback) and upsert them into
 * knowledge_chunks so the PKB is warm on day one and drafts cite real docs.
 *
 * Idempotent (ingestChunks dedupes by content hash) and RPM-friendly: a short
 * delay between platforms keeps free-tier Gemini from 429ing. Safe to re-run.
 * Requires DATABASE_URL + GEMINI_API_KEY. Run: npm run seed:grounding
 */

// A couple of representative retrieval queries per platform so we capture both
// general syntax and task-specific rules without hammering the free-tier RPM.
const QUERIES = ['prompt structure, syntax, and formatting rules', 'parameters, constraints, and best practices'];
const DELAY_MS = 4_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function run(): Promise<void> {
  if (!config.DATABASE_URL) {
    logger.error({ type: 'seed_grounding:missing_database_url' });
    process.exitCode = 1;
    return;
  }
  if (!config.GEMINI_API_KEY) {
    logger.error({ type: 'seed_grounding:missing_gemini_key', message: 'Set GEMINI_API_KEY in backend/.env and re-run.' });
    process.exitCode = 1;
    return;
  }

  const platforms = listPlatforms().filter((p) => p.docs_url);
  const client = new Client({ connectionString: config.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  let totalInserted = 0;
  try {
    for (const platform of platforms) {
      const collected = new Map<string, { content: string; sourceUrl: string }>();
      for (const query of QUERIES) {
        const chunks = await groundingService.ground(platform, query);
        for (const c of chunks) collected.set(c.content, { content: c.content, sourceUrl: c.sourceUrl });
        await sleep(DELAY_MS);
      }

      if (collected.size === 0) {
        logger.warn({ type: 'seed_grounding:no_chunks', platformId: platform.platform_id });
        continue;
      }

      const { inserted, refreshed } = await ingestChunks(
        client,
        [...collected.values()],
        { kind: 'pkb', platformId: platform.platform_id, trustScore: 0.9, category: 'grounded' },
      );
      totalInserted += inserted;
      logger.info({ type: 'seed_grounding:platform_done', platformId: platform.platform_id, inserted, refreshed });
    }

    logger.info({ type: 'seed_grounding:complete', platforms: platforms.length, inserted: totalInserted });
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  logger.error({ type: 'seed_grounding:failed', error: err instanceof Error ? err.message : String(err) });
  process.exitCode = 1;
});
