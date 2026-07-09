import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { z } from 'zod';
import { Client } from 'pg';
import { GeminiEmbeddingAdapter } from '../services/providers/GeminiEmbeddingAdapter';
import { config } from '../config/env';
import { logger } from '../utils/logger';

/**
 * PKB/MPKB seed ingestion — spec §6.1, §6.3 (T2.6).
 * Reads config/pkb-seed.json, embeds each chunk via Gemini, and upserts into
 * knowledge_chunks. Idempotent by content_hash: unchanged chunks are skipped
 * (no re-embedding cost), so re-running after editing the seed file only
 * processes what changed. Requires DATABASE_URL + GEMINI_API_KEY.
 * Run: npm run seed:pkb
 */
const seedChunkSchema = z.object({
  kind: z.enum(['pkb', 'mpkb']),
  platform_id: z.string().optional(),
  model_family: z.string().optional(),
  category: z.string(),
  content: z.string().min(20),
  source_url: z.string().url(),
  trust_score: z.number().min(0).max(1),
});

const seedFileSchema = z.object({
  schema_version: z.string(),
  note: z.string().optional(),
  chunks: z.array(seedChunkSchema).min(1),
});

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

async function seed(): Promise<void> {
  if (!config.DATABASE_URL) {
    logger.error({ type: 'seed_pkb:missing_database_url' });
    process.exitCode = 1;
    return;
  }
  if (!config.GEMINI_API_KEY) {
    logger.error({
      type: 'seed_pkb:missing_gemini_key',
      message: 'Set GEMINI_API_KEY in backend/.env (free key from https://aistudio.google.com) and re-run.',
    });
    process.exitCode = 1;
    return;
  }

  const seedPath = path.resolve(__dirname, '..', '..', '..', 'config', 'pkb-seed.json');
  const file = seedFileSchema.parse(JSON.parse(fs.readFileSync(seedPath, 'utf-8')));

  const client = new Client({ connectionString: config.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const embedder = new GeminiEmbeddingAdapter();

  try {
    const { rows: existing } = await client.query<{ content_hash: string }>('select content_hash from knowledge_chunks');
    const known = new Set(existing.map((r) => r.content_hash));

    let inserted = 0;
    let skipped = 0;

    for (const chunk of file.chunks) {
      const hash = sha256(chunk.content);
      if (known.has(hash)) {
        skipped += 1;
        continue;
      }

      const [embedding] = await embedder.embed([chunk.content], 'document');
      if (!embedding) throw new Error('embedder returned no vector');

      await client.query(
        `insert into knowledge_chunks
           (kind, platform_id, model_family, category, content, embedding, source_url, content_hash, trust_score)
         values ($1,$2,$3,$4,$5,$6::vector,$7,$8,$9)`,
        [
          chunk.kind,
          chunk.platform_id ?? null,
          chunk.model_family ?? null,
          chunk.category,
          chunk.content,
          `[${embedding.join(',')}]`,
          chunk.source_url,
          hash,
          chunk.trust_score,
        ]
      );
      inserted += 1;
      logger.info({ type: 'seed_pkb:chunk_inserted', kind: chunk.kind, platformId: chunk.platform_id, category: chunk.category });
    }

    logger.info({ type: 'seed_pkb:complete', total: file.chunks.length, inserted, skipped });
  } finally {
    await client.end();
  }
}

seed().catch((err) => {
  logger.error({ type: 'seed_pkb:failed', error: err instanceof Error ? err.message : String(err) });
  process.exitCode = 1;
});
