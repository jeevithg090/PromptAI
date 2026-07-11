import { PKBService } from '../../src/services/PKBService';
import { MockEmbeddingAdapter } from '../../src/services/providers/MockEmbeddingAdapter';
import { setPoolForTesting } from '../../src/utils/db';
import type { Pool } from 'pg';

/** T2.6 retrieval tests — SQL shape and row mapping, with a fake pool + mock embedder. */
describe('PKBService (§6)', () => {
  afterEach(() => setPoolForTesting(null));

  function fakePool(rows: unknown[]): { pool: Pool; query: jest.Mock } {
    const query = jest.fn().mockResolvedValue({ rows });
    setPoolForTesting({ query } as unknown as Pool);
    return { pool: {} as Pool, query };
  }

  it('embeds the query, filters by platform (plus mpkb), orders by cosine distance, limits to k', async () => {
    const { query } = fakePool([]);
    const service = new PKBService(new MockEmbeddingAdapter());

    await service.retrieve('gemini image constraints', { platform_id: 'google_gemini' }, 3);

    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/kind = 'mpkb'/);
    expect(sql).toMatch(/embedding <=> \$2::vector/);
    expect(params[0]).toBe('google_gemini');
    expect(params[1]).toMatch(/^\[[-\d.,e]+\]$/); // pgvector literal
    expect(params[2]).toBe(3);
  });

  it('maps rows to KnowledgeChunk with defaults for nullable fields', async () => {
    fakePool([
      {
        id: 'c1',
        kind: 'mpkb',
        platform_id: null,
        model_family: 'llm_general',
        content: 'few-shot examples dominate instructions',
        source_url: null,
        trust_score: '0.8',
        ingested_at: new Date('2026-07-07T00:00:00Z'),
        similarity: null,
      },
    ]);
    const service = new PKBService(new MockEmbeddingAdapter());

    const chunks = await service.retrieve('anything', { platform_id: 'google_gemini' });

    expect(chunks).toEqual([
      {
        id: 'c1',
        kind: 'mpkb',
        platformId: undefined,
        modelFamily: 'llm_general',
        content: 'few-shot examples dominate instructions',
        sourceUrl: '',
        ingestedAt: '2026-07-07T00:00:00.000Z',
        trustScore: 0.8,
      },
    ]);
  });

  it('propagates embedder failure (callers decide how to degrade)', async () => {
    fakePool([]);
    const embedder = { name: 'boom', embed: jest.fn().mockRejectedValue(new Error('quota')) };
    const service = new PKBService(embedder);

    await expect(service.retrieve('q', { platform_id: 'google_gemini' })).rejects.toThrow('quota');
  });
});
