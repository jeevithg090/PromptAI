import type { EmbeddingProvider } from '../../types/Provider';
import { EMBEDDING_DIM } from './GeminiEmbeddingAdapter';

/**
 * Deterministic offline embeddings for tests — same-text-in, same-vector-out,
 * loosely locality-sensitive (shared words → higher cosine similarity), so
 * retrieval-ordering tests behave sensibly without a network call.
 */
export class MockEmbeddingAdapter implements EmbeddingProvider {
  name = 'mock';

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => {
      const v = new Array<number>(EMBEDDING_DIM).fill(0);
      for (const word of t.toLowerCase().split(/\W+/).filter(Boolean)) {
        let h = 0;
        for (let i = 0; i < word.length; i++) h = (h * 31 + word.charCodeAt(i)) >>> 0;
        const idx = h % EMBEDDING_DIM;
        v[idx] = (v[idx] ?? 0) + 1;
      }
      const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
      return v.map((x) => x / norm);
    });
  }
}
