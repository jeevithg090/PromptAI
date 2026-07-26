import { PKBService } from '../services/PKBService';
import { logger } from '../utils/logger';
import { config } from '../config/env';
import { ingestChunks } from '../services/DocIngest';
import { groundingService } from '../services/GroundingService';
import { Client } from 'pg';
import type { Agent, AgentInput, AgentOutput, KnowledgeChunk } from '../types/Agent';
import type { Platform } from '../types/Platform';

/**
 * Doc Retrieval Agent — spec §6, §10.2, §31.3 Step 13.
 * Builds a retrieval query from classified intent + entities + platform,
 * pulls the top-k PKB/MPKB chunks via pgvector, and hands them to the
 * pipeline (Supervisor merges them into context.pkbChunks).
 *
 * Self-healing RAG (T5.2, §6.2): when retrieval yields low-similarity or
 * zero chunks, live-fetches the platform's docs_url, extracts + chunks,
 * ranks fresh chunks against the query embedding, and returns the top 3.
 * Fresh chunks are async-upserted for future lookups.
 *
 * Degrades gracefully (§29.7): any failure returns `partial` with zero
 * chunks — drafting proceeds ungrounded rather than not at all.
 */
export class DocRetrievalAgent implements Agent {
  name = 'DocRetrievalAgent';

  constructor(private readonly pkb: PKBService = new PKBService()) {}

  async execute(input: AgentInput): Promise<AgentOutput> {
    const { context } = input;

    // Custom platform (V1.1): the client already supplied doc chunks fetched
    // from the platform's own docs — pass them through untouched. There is
    // nothing in the DB to retrieve for a `custom:` platform id.
    if (context.platform.platform_id.startsWith('custom:')) {
      return { status: 'success', data: { chunks: context.pkbChunks ?? [] }, tokensUsed: 0 };
    }

    const query = [
      context.taskType ?? 'general prompt',
      ...Object.values(context.entities ?? {}),
      `on ${context.platform.display_name}`,
    ].join(' ');

    try {
      const chunks = await this.pkb.retrieve(query, {
        platform_id: context.platform.platform_id,
        modelFamily: context.platform.model_family,
      }, 5);

      // Self-healing live-fetch fallback (§6.2, T5.2)
      if (config.LIVE_FETCH_ENABLED && this.shouldLiveFetch(chunks)) {
        const liveChunks = await this.tryLiveFetch(context.platform, query);
        if (liveChunks) return { status: 'success', data: { chunks: liveChunks }, tokensUsed: 0 };
      }

      return { status: 'success', data: { chunks }, tokensUsed: 0 };
    } catch (error) {
      logger.warn({
        type: 'agent:retrieval_degraded',
        agent: this.name,
        sessionId: context.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      // Ungrounded drafting beats no drafting — never fail the pipeline here.
      return { status: 'partial', data: { chunks: [] }, tokensUsed: 0 };
    }
  }

  /** True when retrieval returned nothing or the best result is below the similarity threshold. */
  private shouldLiveFetch(chunks: KnowledgeChunk[]): boolean {
    if (chunks.length === 0) return true;
    const bestSimilarity = chunks.reduce((max, c) => Math.max(max, c.similarity ?? 0), 0);
    return bestSimilarity < config.PKB_MIN_SIMILARITY;
  }

  /**
   * Self-healing grounding (§6.2, finalplan §A2): when the PKB is cold or
   * low-similarity, extract prompt-writing rules from the platform's OFFICIAL
   * docs via GroundingService (Gemini url_context, or an SSRF-guarded HTML
   * fetch fallback). Real doc-grounded chunks replace the old fake-0.5 stub.
   * Fresh chunks are async-upserted so the next request is a fast pgvector hit.
   */
  private async tryLiveFetch(platform: Platform, query: string): Promise<KnowledgeChunk[] | null> {
    const docsUrl = platform.docs_url;
    if (!docsUrl) return null;

    const started = Date.now();
    const chunks = await groundingService.ground(platform, query);
    if (chunks.length === 0) return null;

    // Fire-and-forget upsert so the request is not blocked by DB writes.
    if (config.DATABASE_URL) {
      const client = new Client({ connectionString: config.DATABASE_URL, ssl: { rejectUnauthorized: false } });
      client.connect().then(() => {
        ingestChunks(
          client,
          chunks.map((c) => ({ content: c.content, sourceUrl: c.sourceUrl })),
          { kind: 'pkb', platformId: platform.platform_id, trustScore: chunks[0]!.trustScore, category: 'crawled' }
        ).catch(() => {}).finally(() => client.end().catch(() => {}));
      }).catch(() => {});
    }

    logger.info({
      type: 'tool:live_fetch',
      platformId: platform.platform_id,
      durationMs: Date.now() - started,
      chunksFound: chunks.length,
      status: 'success',
    });

    return chunks;
  }
}
