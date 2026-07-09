import { config } from '../../config/env';
import { logger } from '../../utils/logger';
import type { EmbeddingProvider } from '../../types/Provider';

/**
 * Google Gemini embeddings — default embedding provider (§6 PKB).
 * gemini-embedding-001 with outputDimensionality=1536 to match the
 * knowledge_chunks.embedding vector(1536) column exactly.
 *
 * Gotcha (documented by Google): at non-default dimensionality (≠3072) the
 * returned vectors are NOT L2-normalized — we normalize here so pgvector
 * cosine distance behaves correctly.
 */
const MODEL = 'gemini-embedding-001';
const BASE = 'https://generativelanguage.googleapis.com/v1beta';
export const EMBEDDING_DIM = 1536;

interface EmbedContentResponse {
  embedding: { values: number[] };
}

function l2Normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return norm === 0 ? v : v.map((x) => x / norm);
}

export class GeminiEmbeddingAdapter implements EmbeddingProvider {
  name = 'gemini';

  async embed(texts: string[], kind: 'document' | 'query'): Promise<number[][]> {
    const apiKey = config.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    const taskType = kind === 'document' ? 'RETRIEVAL_DOCUMENT' : 'RETRIEVAL_QUERY';
    const started = Date.now();
    const results: number[][] = [];

    // Sequential single calls keep us far under free-tier rate limits and
    // keep error attribution simple; volume is tiny (seeding is a one-off).
    for (const text of texts) {
      const res = await fetch(`${BASE}/models/${MODEL}:embedContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: `models/${MODEL}`,
          content: { parts: [{ text }] },
          taskType,
          outputDimensionality: EMBEDDING_DIM,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        logger.error({ type: 'provider:gemini_embed_error', status: res.status, durationMs: Date.now() - started });
        throw new Error(`Gemini embedding request failed: ${res.status} ${errorText.slice(0, 200)}`);
      }

      const data = (await res.json()) as EmbedContentResponse;
      if (!data.embedding?.values?.length) {
        throw new Error('Gemini embedding response missing values');
      }
      results.push(l2Normalize(data.embedding.values));
    }

    logger.info({ type: 'provider:gemini_embed', count: texts.length, kind, durationMs: Date.now() - started });
    return results;
  }
}
