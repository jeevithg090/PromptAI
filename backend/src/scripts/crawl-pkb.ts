import fs from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';
import { Client } from 'pg';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { fetchDoc, robotsAllow, extractText, chunkText, ingestChunks } from '../services/DocIngest';

/**
 * Scheduled PKB crawler — spec §6.1, §6.3 (T5.1).
 * Reads config/platform-registry.json, crawls each platform's docs_url
 * (robots.txt-respecting, polite), chunks + embeds new content, upserts into
 * knowledge_chunks. Idempotent by content_hash: re-running only processes
 * changed content. Also serves as the Supabase keep-alive (§23.3).
 *
 * Run: npm run crawl:pkb
 * Scheduled: .github/workflows/crawl-pkb.yml (weekly Mon 06:00 UTC)
 */

interface RegistryPlatform {
  platform_id: string;
  display_name: string;
  docs_url: string;
}

interface RegistryFile {
  platforms: RegistryPlatform[];
}

interface CrawlSummary {
  platform: string;
  fetched: number;
  newChunks: number;
  refreshed: number;
  skipped: number;
}

const POLITENESS_MS = 2_000;
const MAX_PAGES_PER_RUN = 5;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Breadth-first crawl starting from docs_url.
 * Returns unique page URLs fetched (up to MAX_PAGES_PER_RUN).
 */
async function crawlPages(startUrl: string, baseOrigin: string): Promise<Map<string, string>> {
  const pages = new Map<string, string>();
  const queue: string[] = [startUrl];
  const seen = new Set<string>([startUrl]);

  while (queue.length > 0 && pages.size < MAX_PAGES_PER_RUN) {
    const url = queue.shift()!;
    const html = await fetchDoc(url);
    if (!html) {
      logger.warn({ type: 'crawl:fetch_failed', url });
      continue;
    }

    pages.set(url, html);

    if (pages.size < MAX_PAGES_PER_RUN) {
      const links = extractLinks(html, baseOrigin);
      for (const link of links) {
        if (!seen.has(link)) {
          seen.add(link);
          queue.push(link);
        }
      }
    }

    await sleep(POLITENESS_MS);
  }

  return pages;
}

/** Extract same-origin links from HTML (simple regex, v1 fidelity). */
function extractLinks(html: string, baseOrigin: string): string[] {
  const links: string[] = [];
  const hrefRe = /href="([^"]+)"/gi;
  let match: RegExpExecArray | null;
  while ((match = hrefRe.exec(html)) !== null) {
    const href = match[1]!;
    try {
      const resolved = new URL(href, baseOrigin);
      if (resolved.origin === baseOrigin && !resolved.hash) {
        const normalized = resolved.href.replace(/\/$/, '');
        if (!links.includes(normalized)) links.push(normalized);
      }
    } catch {
      // ignore malformed URLs
    }
  }
  return links;
}

async function crawl(): Promise<void> {
  if (!config.DATABASE_URL) {
    logger.error({ type: 'crawl_pkb:missing_database_url' });
    process.exitCode = 1;
    return;
  }
  if (!config.GEMINI_API_KEY) {
    logger.error({ type: 'crawl_pkb:missing_gemini_key' });
    process.exitCode = 1;
    return;
  }

  const registryPath = path.resolve(__dirname, '..', '..', '..', 'config', 'platform-registry.json');
  const registry: RegistryFile = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));

  const client = new Client({ connectionString: config.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const summaries: CrawlSummary[] = [];

  try {
    for (const platform of registry.platforms) {
      const docUrl = platform.docs_url;
      let origin: string;
      try {
        origin = new URL(docUrl).origin;
      } catch {
        logger.warn({ type: 'crawl:invalid_url', platform: platform.platform_id, url: docUrl });
        summaries.push({ platform: platform.platform_id, fetched: 0, newChunks: 0, refreshed: 0, skipped: 0 });
        continue;
      }

      const docPath = new URL(docUrl).pathname;

      // Robots.txt check
      const allowed = await robotsAllow(origin, docPath);
      if (!allowed) {
        logger.info({ type: 'crawl:skipped_robots', platform: platform.platform_id });
        summaries.push({ platform: platform.platform_id, fetched: 0, newChunks: 0, refreshed: 0, skipped: 0 });
        continue;
      }

      logger.info({ type: 'crawl:starting', platform: platform.platform_id, docsUrl: docUrl });

      const pages = await crawlPages(docUrl, origin);
      let totalNew = 0;
      let totalRefreshed = 0;

      for (const [pageUrl, html] of pages) {
        const text = extractText(html);
        const chunks = chunkText(text);

        const result = await ingestChunks(
          client,
          chunks.map((c) => ({ content: c, sourceUrl: pageUrl })),
          { kind: 'pkb', platformId: platform.platform_id, trustScore: 0.7, category: 'crawled' }
        );

        totalNew += result.inserted;
        totalRefreshed += result.refreshed;
      }

      summaries.push({
        platform: platform.platform_id,
        fetched: pages.size,
        newChunks: totalNew,
        refreshed: totalRefreshed,
        skipped: 0,
      });
    }
  } finally {
    await client.end();
  }

  // Log summary per platform
  for (const s of summaries) {
    logger.info({
      type: 'crawl:platform_complete',
      platform: s.platform,
      fetched: s.fetched,
      newChunks: s.newChunks,
      refreshed: s.refreshed,
      skipped: s.skipped,
    });
  }

  logger.info({ type: 'crawl:complete', totalPlatforms: summaries.length });
}

crawl().catch((err) => {
  logger.error({ type: 'crawl_pkb:failed', error: err instanceof Error ? err.message : String(err) });
  process.exitCode = 1;
});
