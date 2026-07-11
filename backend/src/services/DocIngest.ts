import crypto from 'node:crypto';
import { Client } from 'pg';
import { GeminiEmbeddingAdapter } from './providers/GeminiEmbeddingAdapter';
import { estimateTokens } from '../utils/token-estimator';
import { logger } from '../utils/logger';
import type { EmbeddingProvider } from '../types/Provider';

/**
 * Shared doc-fetch, HTML-strip, chunk, embed & upsert pipeline — spec §6.1.
 * Used by the scheduled PKB crawler (T5.1) and the self-healing live-fetch
 * fallback (T5.2).
 */

export interface CrawlResult {
  platformId: string;
  fetched: number;
  newChunks: number;
  refreshed: number;
  skipped: number;
}

interface ChunkUnit {
  content: string;
  sourceUrl: string;
}

/** Fetch a single URL with timeout. Returns null on failure. */
export async function fetchDoc(url: string, timeoutMs = 15_000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    id.unref();
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'PromptForgeBot/1.0 (+contact in repo)' },
    });
    clearTimeout(id);
    if (!res.ok) return null;
    return res.text();
  } catch {
    return null;
  }
}

/** Check robots.txt for a given origin. Returns true if the path is allowed (or robots.txt unreachable). */
export async function robotsAllow(origin: string, path: string): Promise<boolean> {
  try {
    const txt = await fetchDoc(`${origin}/robots.txt`, 5_000);
    if (!txt) return true;
    const lines = txt.split('\n');
    const disallows: string[] = [];
    let userAgentAll = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('User-agent: *')) userAgentAll = true;
      if (userAgentAll && trimmed.startsWith('Disallow:')) {
        disallows.push(trimmed.slice('Disallow:'.length).trim());
      }
    }
    if (!userAgentAll) return true;
    return !disallows.some((d) => path.startsWith(d));
  } catch {
    return true;
  }
}

/**
 * Strip HTML tags and extract readable text.
 * v1 fidelity: drops <script>/<style>/<nav>, collapses tags to newlines.
 */
export function extractText(html: string): string {
  const withoutBlocks = html
    .replace(/<(script|style|nav)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return withoutBlocks.replace(/\n{3,}/g, '\n\n').trim();
}

/** Split text into ~300–600-token chunks by headings or blank lines. */
export function chunkText(text: string): string[] {
  const sections = text.split(/\n\n+/);
  const chunks: string[] = [];
  let buffer = '';
  for (const sec of sections) {
    const trimmed = sec.trim();
    if (!trimmed) continue;
    const candidate = buffer + (buffer ? '\n\n' : '') + trimmed;
    if (estimateTokens(candidate) <= 600) {
      buffer = candidate;
    } else {
      if (estimateTokens(buffer) >= 40) chunks.push(buffer);
      buffer = trimmed;
    }
  }
  if (estimateTokens(buffer) >= 40) chunks.push(buffer);
  return chunks;
}

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

/**
 * Embed a batch of chunk strings and upsert them into knowledge_chunks.
 * Idempotent by content_hash: known hashes update last_checked_at only;
 * new hashes are inserted. Caller must manage the DB connection lifecycle.
 */
export async function ingestChunks(
  client: Client,
  chunks: ChunkUnit[],
  meta: { kind: 'pkb'; platformId: string; trustScore: number; category: string },
  embedder: EmbeddingProvider = new GeminiEmbeddingAdapter()
): Promise<{ inserted: number; refreshed: number }> {
  const { rows: existing } = await client.query<{ content_hash: string }>(
    'select content_hash from knowledge_chunks'
  );
  const known = new Set(existing.map((r) => r.content_hash));

  let inserted = 0;
  let refreshed = 0;

  for (const chunk of chunks) {
    const hash = sha256(chunk.content);
    if (known.has(hash)) {
      await client.query(
        'update knowledge_chunks set last_checked_at = now() where content_hash = $1',
        [hash]
      );
      refreshed += 1;
      continue;
    }

    const [embedding] = await embedder.embed([chunk.content], 'document');
    if (!embedding) throw new Error('embedder returned no vector for chunk');

    await client.query(
      `insert into knowledge_chunks
        (kind, platform_id, category, content, embedding, source_url, content_hash, trust_score)
       values ($1,$2,$3,$4,$5::vector,$6,$7,$8)`,
      [
        meta.kind,
        meta.platformId,
        meta.category,
        chunk.content,
        `[${embedding.join(',')}]`,
        chunk.sourceUrl,
        hash,
        meta.trustScore,
      ]
    );
    inserted += 1;
    known.add(hash);
  }

  return { inserted, refreshed };
}
