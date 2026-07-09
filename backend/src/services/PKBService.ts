import { getPool } from '../utils/db';
import { GeminiEmbeddingAdapter } from './providers/GeminiEmbeddingAdapter';
import { logger } from '../utils/logger';
import type { EmbeddingProvider } from '../types/Provider';
import type { KnowledgeChunk } from '../types/Agent';

/**
 * PKB/MPKB retrieval — spec §6, §10.2.
 * pgvector cosine-similarity search over knowledge_chunks: platform-scoped
 * PKB rows plus model-behavior MPKB rows (which apply across platforms).
 * Live-fetch fallback and the scheduled crawler are Phase 5 (T5.1/T5.2) —
 * this interface anticipates them.
 */
export interface RetrieveFilter {
  platform_id: string;
  modality?: string;
}

interface ChunkRow {
  id: string;
  kind: 'pkb' | 'mpkb';
  platform_id: string | null;
  model_family: string | null;
  content: string;
  source_url: string | null;
  trust_score: string | number | null;
  ingested_at: Date;
}

export class PKBService {
  constructor(private readonly embedder: EmbeddingProvider = new GeminiEmbeddingAdapter()) {}

  async retrieve(query: string, filter: RetrieveFilter, k = 5): Promise<KnowledgeChunk[]> {
    const [queryVector] = await this.embedder.embed([query], 'query');
    if (!queryVector) throw new Error('embedding provider returned no vector');

    const vectorLiteral = `[${queryVector.join(',')}]`;
    const { rows } = await getPool().query<ChunkRow>(
      `select id, kind, platform_id, model_family, content, source_url, trust_score, ingested_at
         from knowledge_chunks
        where platform_id = $1 or kind = 'mpkb'
        order by embedding <=> $2::vector
        limit $3`,
      [filter.platform_id, vectorLiteral, k]
    );

    logger.info({ type: 'pkb:retrieve', platformId: filter.platform_id, k, returned: rows.length });

    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      platformId: r.platform_id ?? undefined,
      modelFamily: r.model_family ?? undefined,
      content: r.content,
      sourceUrl: r.source_url ?? '',
      ingestedAt: r.ingested_at instanceof Date ? r.ingested_at.toISOString() : String(r.ingested_at),
      trustScore: r.trust_score === null ? 0.5 : Number(r.trust_score),
    }));
  }
}
